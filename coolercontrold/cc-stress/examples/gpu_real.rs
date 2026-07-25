//! Runs the real `run_gpu_stress` entry point under a Tokio runtime, so the
//! shipped code path can be measured directly (the daemon's compio backend
//! cannot host it: `run_gpu_stress` calls `tokio::spawn`).

fn main() {
    let secs: u16 = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "15".into())
        .parse()
        .expect("seconds");
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("tokio runtime");
    rt.block_on(async {
        cc_stress::run_gpu_stress(secs).await.expect("gpu stress");
    });
}
