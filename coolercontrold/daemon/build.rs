// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Guard: the web UI is embedded into the binary from resources/app via
    // include_dir! (see api/base.rs). Building the daemon without first building
    // the UI embeds an empty directory, yielding a binary that serves a blank
    // web UI with no other error. Fail packaging (release) builds early here;
    // warn for debug builds so daemon-only iteration still works.
    let app_index =
        PathBuf::from(std::env::var("CARGO_MANIFEST_DIR")?).join("resources/app/index.html");
    if !app_index.exists() {
        let msg = "UI assets missing: resources/app/index.html not found. The daemon embeds \
            the coolercontrol-ui build at compile time, so the UI must be built first. From \
            the repo root run `make` (builds everything in the correct order), or `make \
            build-ui` to build just the UI.";
        assert!(
            std::env::var("PROFILE").as_deref() != Ok("release"),
            "{msg}"
        );
        println!("cargo:warning={msg}");
    }

    // Query pkg-config for hwdata's pkgdatadir at build time (e.g., NixOS).
    if let Ok(output) = std::process::Command::new("pkg-config")
        .args(["hwdata", "--variable", "pkgdatadir"])
        .output()
    {
        if output.status.success() {
            let dir = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !dir.is_empty() && std::path::Path::new(&dir).is_dir() {
                println!("cargo:rustc-env=HWDATA_PKGDATADIR={dir}");
            }
        }
    }

    // Compile the protos with the pure-Rust protox compiler, then hand tonic the resulting descriptor
    // set for code generation. This removes protoc as a system build dependency. protox supports
    // proto3 optional natively, so no experimental protoc arg is needed.
    let file_descriptor_set = protox::compile(
        [
            "resources/proto/coolercontrol/models/v1/device.proto",
            "resources/proto/coolercontrol/device_service/v1/device_service.proto",
        ],
        ["resources/proto"],
    )?;
    tonic_prost_build::configure()
        .build_server(true)
        .build_client(true)
        .compile_fds(file_descriptor_set)?;
    Ok(())
}
