// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

//! Shows why `run_gpu_stress` gives each adapter its own OS thread.
//!
//! An earlier version drove every adapter from a `tokio::spawn` task on the
//! daemon's current-thread runtime, with each task calling the *blocking*
//! `device.poll(Maintain::Wait)`. A blocking call on a single-threaded
//! runtime stalls every other task, so adapters took turns instead of
//! running concurrently: each GPU idled while the runtime waited on another.
//! Anyone tempted to move this back onto an async runtime should run this
//! first.
//!
//! Adapter A is the real GPU with a short dispatch. Adapter B stands in for
//! a second, slower adapter (typically the iGPU that nearly every modern
//! platform exposes): its blocking wait is simulated with `thread::sleep`,
//! so it costs wall-clock time inside the runtime without competing for the
//! same silicon. That isolates the scheduling effect from GPU contention.
//!
//! Both loops mirror that old `stress_adapter`, including its per-iteration
//! yield point. The original used `sleep(0).await`, whose timer granularity
//! cost a further ~1ms per submission on top of what is measured here.
//!
//! Usage: `gpu_serialize [seconds] [slow_adapter_wait_ms]`

#![allow(clippy::cast_precision_loss)]

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

const WORKGROUP: u32 = 256;
const GROUPS: u32 = 256;
const ITERS: u32 = 64;

fn shader() -> String {
    format!(
        r"
@group(0) @binding(0) var<storage, read_write> buf: array<vec4<f32>>;
@compute @workgroup_size({WORKGROUP})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {{
    var a = buf[gid.x];
    for (var i: u32 = 0u; i < {ITERS}u; i = i + 1u) {{
        a = fma(a, vec4<f32>(0.999), vec4<f32>(0.001));
    }}
    buf[gid.x] = a;
}}
"
    )
}

/// The real GPU adapter: encode, submit, block on `poll(Wait)`.
struct Gpu {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::ComputePipeline,
    bind_group: wgpu::BindGroup,
    submits: AtomicU64,
}

impl Gpu {
    fn step(&self) {
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: None,
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &self.bind_group, &[]);
            pass.dispatch_workgroups(GROUPS, 1, 1);
        }
        self.queue.submit(std::iter::once(encoder.finish()));
        self.device.poll(wgpu::Maintain::Wait);
        self.submits.fetch_add(1, Ordering::Relaxed);
    }
}

async fn build(adapter: &wgpu::Adapter) -> Gpu {
    let (device, queue) = adapter
        .request_device(&wgpu::DeviceDescriptor::default(), None)
        .await
        .expect("device");
    let buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: None,
        size: u64::from(GROUPS) * u64::from(WORKGROUP) * 16,
        usage: wgpu::BufferUsages::STORAGE,
        mapped_at_creation: false,
    });
    let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: None,
        source: wgpu::ShaderSource::Wgsl(shader().into()),
    });
    let bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: None,
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::COMPUTE,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Storage { read_only: false },
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }],
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
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &bgl,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: buffer.as_entire_binding(),
        }],
    });
    Gpu {
        device,
        queue,
        pipeline,
        bind_group,
        submits: AtomicU64::new(0),
    }
}

fn rate(gpu: &Gpu, elapsed: Duration) -> f64 {
    let n = gpu.submits.swap(0, Ordering::Relaxed);
    n as f64 / elapsed.as_secs_f64()
}

fn main() {
    let mut args = std::env::args().skip(1);
    let secs: u64 = args
        .next()
        .unwrap_or_else(|| "6".into())
        .parse()
        .expect("s");
    let slow_ms: u64 = args
        .next()
        .unwrap_or_else(|| "20".into())
        .parse()
        .expect("ms");

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
    println!("adapter A: {}", adapter.get_info().name);
    println!("adapter B: simulated, {slow_ms}ms blocking wait per submission\n");

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime");
    let gpu = Arc::new(rt.block_on(build(&adapter)));

    // Reference: adapter A alone, exactly as a single-GPU system runs today.
    let deadline = Instant::now() + Duration::from_secs(secs);
    let start = Instant::now();
    rt.block_on(async {
        while Instant::now() < deadline {
            gpu.step();
            tokio::task::yield_now().await;
        }
    });
    println!(
        "A alone                      {:8.1} submits/s",
        rate(&gpu, start.elapsed())
    );

    // Shipped structure with two adapters: tokio tasks, one runtime thread.
    let deadline = Instant::now() + Duration::from_secs(secs);
    let start = Instant::now();
    rt.block_on(async {
        let local = tokio::task::LocalSet::new();
        local
            .run_until(async {
                let g = Arc::clone(&gpu);
                let a = tokio::task::spawn_local(async move {
                    while Instant::now() < deadline {
                        g.step();
                        tokio::task::yield_now().await;
                    }
                });
                let b = tokio::task::spawn_local(async move {
                    while Instant::now() < deadline {
                        // Stands in for the second adapter's poll(Wait).
                        std::thread::sleep(Duration::from_millis(slow_ms));
                        tokio::task::yield_now().await;
                    }
                });
                let _ = a.await;
                let _ = b.await;
            })
            .await;
    });
    println!(
        "A + B, shipped (tokio tasks) {:8.1} submits/s",
        rate(&gpu, start.elapsed())
    );

    // One OS thread per adapter: B's blocking wait cannot stall A.
    let deadline = Instant::now() + Duration::from_secs(secs);
    let start = Instant::now();
    let gpu_ref: &Gpu = &gpu;
    std::thread::scope(|scope| {
        scope.spawn(move || {
            while Instant::now() < deadline {
                gpu_ref.step();
            }
        });
        scope.spawn(|| {
            while Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(slow_ms));
            }
        });
    });
    println!(
        "A + B, one thread each       {:8.1} submits/s",
        rate(&gpu, start.elapsed())
    );
}
