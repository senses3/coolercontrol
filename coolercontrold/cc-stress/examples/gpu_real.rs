// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

//! Runs the real `run_gpu_stress` entry point directly, so the shipped code
//! path can be measured without going through the daemon. Sample power and
//! load from sysfs alongside it, or use the `gpu_probe` example to compare
//! shader and submission variants.

fn main() {
    let secs: u16 = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "15".into())
        .parse()
        .expect("seconds");
    cc_stress::run_gpu_stress(secs, None).expect("gpu stress");
}
