//! Experiment harness for GPU stress shapes. A diagnostic, not a product
//! path: it measures which submission pattern and shader body actually load
//! a GPU, reading power and load from the same sysfs the daemon uses.
//!
//! Usage: `gpu_probe [seconds] [variant ...]`
//!
//! Variants are `<shader>-<loop>-<iters>-<reps>-<inflight>`, e.g.
//! `orig-drain-64-4-1` reproduces the current shipped configuration and
//! `fma4-drain-16-1-1` the highest-power one measured so far.
//!
//! Only AMD is wired up for sampling (`gpu_busy_percent` + hwmon); on other
//! vendors run it alongside an external power monitor.

// Diagnostic harness: precision of the reported averages is not load-bearing,
// and the variant runner is deliberately one linear function.
#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::similar_names,
    clippy::too_many_lines,
    clippy::too_many_arguments
)]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const RING_SIZE: usize = 8;
const WORKGROUP: u32 = 256;
const BUF_DISCRETE: u64 = 256 * 1024 * 1024;
const BUF_INTEGRATED: u64 = 16 * 1024 * 1024;
const MAX_WORKGROUPS_PER_DIM: u32 = 65535;

/// Sysfs sample of what the GPU is actually doing.
#[derive(Default, Clone, Copy)]
struct Sample {
    busy: f64,
    power: f64,
    sclk: f64,
    mclk: f64,
    temp: f64,
}

fn read_f64(path: &str) -> Option<f64> {
    std::fs::read_to_string(path).ok()?.trim().parse().ok()
}

fn sample(dev: &str, hwmon: &str) -> Sample {
    Sample {
        busy: read_f64(&format!("{dev}/gpu_busy_percent")).unwrap_or(0.0),
        power: read_f64(&format!("{hwmon}/power1_average")).unwrap_or(0.0) / 1_000_000.0,
        sclk: read_f64(&format!("{hwmon}/freq1_input")).unwrap_or(0.0) / 1_000_000.0,
        mclk: read_f64(&format!("{hwmon}/freq2_input")).unwrap_or(0.0) / 1_000_000.0,
        temp: read_f64(&format!("{hwmon}/temp1_input")).unwrap_or(0.0) / 1000.0,
    }
}

fn find_paths() -> Option<(String, String)> {
    for entry in std::fs::read_dir("/sys/class/drm").ok()? {
        let name = entry.ok()?.file_name().to_string_lossy().to_string();
        if !name.starts_with("card") || name.contains('-') {
            continue;
        }
        let dev = format!("/sys/class/drm/{name}/device");
        if !std::path::Path::new(&format!("{dev}/gpu_busy_percent")).exists() {
            continue;
        }
        let hwmon_dir = format!("{dev}/hwmon");
        let hwmon = std::fs::read_dir(&hwmon_dir)
            .ok()?
            .next()?
            .ok()?
            .file_name()
            .to_string_lossy()
            .to_string();
        return Some((dev.clone(), format!("{hwmon_dir}/{hwmon}")));
    }
    None
}

/// The shipped shader: every transcendental argument derives from the loop
/// index, so a driver compiler can constant-fold the whole body.
fn shader_orig(vec4_count: u32, stride: u32, iters: u32) -> String {
    format!(
        r"
@group(0) @binding(0) var<storage, read> src: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> dst: array<vec4<f32>>;
const N: u32 = {vec4_count}u;
const STRIDE: u32 = {stride}u;
const ITERS: u32 = {iters}u;
@compute @workgroup_size({WORKGROUP})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {{
    let idx = gid.y * STRIDE + gid.x;
    if idx >= N {{ return; }}
    var a = src[idx] + vec4<f32>(0.01);
    for (var i: u32 = 0u; i < ITERS; i = i + 1u) {{
        let f = f32(i) + 1.0;
        let sv = sin(vec4<f32>(f));
        let cv = cos(vec4<f32>(f));
        let ev = exp(vec4<f32>(f * 0.1));
        let sq = sqrt(vec4<f32>(f));
        a = fma(a, sv, cv);
        a = a / clamp(ev * sq, vec4<f32>(0.1), vec4<f32>(0.9));
    }}
    dst[idx] = clamp(a, vec4<f32>(-1.0), vec4<f32>(1.0));
}}
"
    )
}

/// Four independent dense-FMA chains. Coefficients are constant but the
/// accumulators come from memory, so nothing folds, and the four chains give
/// the scheduler enough ILP to keep a wide modern ALU saturated.
fn shader_fma4(vec4_count: u32, stride: u32, iters: u32) -> String {
    format!(
        r"
@group(0) @binding(0) var<storage, read> src: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> dst: array<vec4<f32>>;
const N: u32 = {vec4_count}u;
const STRIDE: u32 = {stride}u;
const ITERS: u32 = {iters}u;
@compute @workgroup_size({WORKGROUP})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {{
    let idx = gid.y * STRIDE + gid.x;
    if idx >= N {{ return; }}
    let s = src[idx];
    var a0 = s + vec4<f32>(0.01);
    var a1 = s * 1.1 + vec4<f32>(0.30);
    var a2 = s * 0.7 + vec4<f32>(0.90);
    var a3 = s * 1.3 + vec4<f32>(0.50);
    let k = vec4<f32>(0.999);
    let c = vec4<f32>(0.001);
    for (var i: u32 = 0u; i < ITERS; i = i + 1u) {{
        a0 = fma(a0, k, c);
        a1 = fma(a1, k, c);
        a2 = fma(a2, k, c);
        a3 = fma(a3, k, c);
        a0 = fma(a1, k, a0);
        a1 = fma(a2, k, a1);
        a2 = fma(a3, k, a2);
        a3 = fma(a0, k, a3);
    }}
    dst[idx] = clamp(a0 + a1 + a2 + a3, vec4<f32>(-1.0), vec4<f32>(1.0));
}}
"
    )
}

/// Same four-way ILP, but every fourth step routes through a data-dependent
/// transcendental so the special-function units cannot idle.
fn shader_mix4(vec4_count: u32, stride: u32, iters: u32) -> String {
    format!(
        r"
@group(0) @binding(0) var<storage, read> src: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> dst: array<vec4<f32>>;
const N: u32 = {vec4_count}u;
const STRIDE: u32 = {stride}u;
const ITERS: u32 = {iters}u;
@compute @workgroup_size({WORKGROUP})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {{
    let idx = gid.y * STRIDE + gid.x;
    if idx >= N {{ return; }}
    let s = src[idx];
    var a0 = s + vec4<f32>(0.01);
    var a1 = s * 1.1 + vec4<f32>(0.30);
    var a2 = s * 0.7 + vec4<f32>(0.90);
    var a3 = s * 1.3 + vec4<f32>(0.50);
    let k = vec4<f32>(0.999);
    let c = vec4<f32>(0.001);
    for (var i: u32 = 0u; i < ITERS; i = i + 1u) {{
        a0 = fma(a0, k, c);
        a1 = fma(a1, k, c);
        a2 = fma(a2, k, c);
        a3 = fma(a3, k, c);
        a0 = fma(a1, k, a0);
        a1 = fma(a2, k, a1);
        a2 = inverseSqrt(abs(a2) + vec4<f32>(1.0));
        a3 = sin(a3);
    }}
    dst[idx] = clamp(a0 + a1 + a2 + a3, vec4<f32>(-1.0), vec4<f32>(1.0));
}}
"
    )
}

/// Eight independent chains: twice the instruction-level parallelism of
/// `fma4`, to find where added ILP stops paying for itself.
fn shader_fma8(vec4_count: u32, stride: u32, iters: u32) -> String {
    format!(
        r"
@group(0) @binding(0) var<storage, read> src: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> dst: array<vec4<f32>>;
const N: u32 = {vec4_count}u;
const STRIDE: u32 = {stride}u;
const ITERS: u32 = {iters}u;
@compute @workgroup_size({WORKGROUP})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {{
    let idx = gid.y * STRIDE + gid.x;
    if idx >= N {{ return; }}
    let s = src[idx];
    var a0 = s + vec4<f32>(0.01);
    var a1 = s * 1.1 + vec4<f32>(0.30);
    var a2 = s * 0.7 + vec4<f32>(0.90);
    var a3 = s * 1.3 + vec4<f32>(0.50);
    var a4 = s * 0.6 + vec4<f32>(0.20);
    var a5 = s * 1.2 + vec4<f32>(0.40);
    var a6 = s * 0.8 + vec4<f32>(0.70);
    var a7 = s * 1.4 + vec4<f32>(0.60);
    let k = vec4<f32>(0.999);
    let c = vec4<f32>(0.001);
    for (var i: u32 = 0u; i < ITERS; i = i + 1u) {{
        a0 = fma(a0, k, c);
        a1 = fma(a1, k, c);
        a2 = fma(a2, k, c);
        a3 = fma(a3, k, c);
        a4 = fma(a4, k, c);
        a5 = fma(a5, k, c);
        a6 = fma(a6, k, c);
        a7 = fma(a7, k, c);
    }}
    dst[idx] = clamp(a0 + a1 + a2 + a3 + a4 + a5 + a6 + a7,
                     vec4<f32>(-1.0), vec4<f32>(1.0));
}}
"
    )
}

struct Variant {
    name: String,
    shader: String,
    drain: bool,
    reps: u32,
    inflight: usize,
}

fn parse_variant(spec: &str) -> Variant {
    let parts: Vec<&str> = spec.split('-').collect();
    assert!(parts.len() == 5, "bad variant spec: {spec}");
    Variant {
        name: spec.to_string(),
        shader: parts[0].to_string(),
        drain: parts[1] == "drain",
        reps: parts[3].parse().expect("reps"),
        inflight: parts[4].parse().expect("inflight"),
    }
}

fn iters_of(spec: &str) -> u32 {
    spec.split('-').nth(2).unwrap().parse().expect("iters")
}

async fn run_variant(
    adapter: &wgpu::Adapter,
    v: &Variant,
    iters: u32,
    secs: u64,
    dev: &str,
    hwmon: &str,
) {
    let info = adapter.get_info();
    let (device, queue) = adapter
        .request_device(
            &wgpu::DeviceDescriptor {
                required_limits: adapter.limits(),
                ..Default::default()
            },
            None,
        )
        .await
        .expect("device");

    let max_binding = u64::from(adapter.limits().max_storage_buffer_binding_size);
    let buf_bytes = match info.device_type {
        wgpu::DeviceType::DiscreteGpu => BUF_DISCRETE.min(max_binding),
        _ => BUF_INTEGRATED.min(max_binding),
    };
    let vec4_count = (buf_bytes / 16) as u32;

    let buffers: Vec<wgpu::Buffer> = (0..RING_SIZE)
        .map(|i| {
            device.create_buffer(&wgpu::BufferDescriptor {
                label: Some(&format!("ring_{i}")),
                size: buf_bytes,
                usage: wgpu::BufferUsages::STORAGE,
                mapped_at_creation: false,
            })
        })
        .collect();

    let total_groups = vec4_count.div_ceil(WORKGROUP);
    let dispatch_x = total_groups.min(MAX_WORKGROUPS_PER_DIM);
    let dispatch_y = total_groups.div_ceil(dispatch_x);
    let stride = dispatch_x * WORKGROUP;

    let src = match v.shader.as_str() {
        "orig" => shader_orig(vec4_count, stride, iters),
        "fma4" => shader_fma4(vec4_count, stride, iters),
        "mix4" => shader_mix4(vec4_count, stride, iters),
        "fma8" => shader_fma8(vec4_count, stride, iters),
        other => panic!("unknown shader {other}"),
    };
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: None,
        source: wgpu::ShaderSource::Wgsl(src.into()),
    });
    let entry = |binding: u32, read_only: bool| wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::COMPUTE,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Storage { read_only },
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    };
    let bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: None,
        entries: &[entry(0, true), entry(1, false)],
    });
    let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: None,
        bind_group_layouts: &[&bgl],
        push_constant_ranges: &[],
    });
    let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: None,
        layout: Some(&layout),
        module: &module,
        entry_point: Some("main"),
        compilation_options: wgpu::PipelineCompilationOptions::default(),
        cache: None,
    });
    let bind_groups: Vec<wgpu::BindGroup> = (0..RING_SIZE)
        .map(|i| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: None,
                layout: &bgl,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: buffers[i].as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: buffers[(i + 1) % RING_SIZE].as_entire_binding(),
                    },
                ],
            })
        })
        .collect();

    // Sampler thread: sysfs is the same source the daemon reads.
    let stop = Arc::new(AtomicBool::new(false));
    let samples = Arc::new(std::sync::Mutex::new(Vec::<(Instant, Sample)>::new()));
    let sampler = {
        let stop = Arc::clone(&stop);
        let samples = Arc::clone(&samples);
        let dev = dev.to_string();
        let hwmon = hwmon.to_string();
        std::thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                let s = sample(&dev, &hwmon);
                samples.lock().unwrap().push((Instant::now(), s));
                std::thread::sleep(Duration::from_millis(200));
            }
        })
    };

    let start = Instant::now();
    let deadline = start + Duration::from_secs(secs);
    let mut submissions: std::collections::VecDeque<wgpu::SubmissionIndex> =
        std::collections::VecDeque::new();
    let mut submits = 0_u64;
    while Instant::now() < deadline {
        let mut encoder =
            device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
        for _ in 0..v.reps {
            for bg in &bind_groups {
                let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                    label: None,
                    timestamp_writes: None,
                });
                pass.set_pipeline(&pipeline);
                pass.set_bind_group(0, bg, &[]);
                pass.dispatch_workgroups(dispatch_x, dispatch_y, 1);
            }
        }
        let idx = queue.submit(std::iter::once(encoder.finish()));
        submits += 1;
        if v.drain {
            device.poll(wgpu::Maintain::Wait);
        } else {
            submissions.push_back(idx);
            while submissions.len() >= v.inflight {
                let wait = submissions.pop_front().expect("nonempty");
                device.poll(wgpu::Maintain::WaitForSubmissionIndex(wait));
            }
        }
    }
    device.poll(wgpu::Maintain::Wait);
    let elapsed = start.elapsed();
    stop.store(true, Ordering::Relaxed);
    sampler.join().ok();

    // Report the steady-state tail so pipeline warm-up does not skew results.
    let all = samples.lock().unwrap();
    let tail_from = start + elapsed.mul_f64(0.4);
    let tail: Vec<Sample> = all
        .iter()
        .filter(|(t, _)| *t >= tail_from)
        .map(|(_, s)| *s)
        .collect();
    let n = tail.len().max(1) as f64;
    let avg = |f: fn(&Sample) -> f64| tail.iter().map(f).sum::<f64>() / n;
    println!(
        "{:<24} busy {:5.1}%  power {:6.1}W  sclk {:5.0}MHz  mclk {:5.0}MHz  temp {:4.1}C  \
         submits/s {:6.1}",
        v.name,
        avg(|s| s.busy),
        avg(|s| s.power),
        avg(|s| s.sclk),
        avg(|s| s.mclk),
        avg(|s| s.temp),
        submits as f64 / elapsed.as_secs_f64(),
    );
}

fn main() {
    let mut args = std::env::args().skip(1);
    let secs: u64 = args.next().unwrap_or_else(|| "15".into()).parse().unwrap();
    let specs: Vec<String> = args.collect();
    let specs = if specs.is_empty() {
        vec!["orig-drain-64-4-1".to_string()]
    } else {
        specs
    };

    let (dev, hwmon) = find_paths().expect("no amdgpu sysfs found");
    println!("sysfs: {dev} / {hwmon}");

    let backends = wgpu::Backends::VULKAN;
    let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
        backends,
        ..Default::default()
    });
    let adapter = instance
        .enumerate_adapters(backends)
        .into_iter()
        .find(|a| a.get_info().device_type != wgpu::DeviceType::Cpu)
        .expect("no hardware adapter");
    println!("adapter: {}", adapter.get_info().name);

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    for spec in &specs {
        let v = parse_variant(spec);
        let iters = iters_of(spec);
        rt.block_on(run_variant(&adapter, &v, iters, secs, &dev, &hwmon));
        // Let the card settle so the next variant does not start hot.
        std::thread::sleep(Duration::from_secs(8));
    }
}
