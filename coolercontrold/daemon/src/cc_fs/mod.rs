// SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

//! File utilities for `CoolerControl`.
//!
//! Specific to `CoolerControl`'s use cases and intended only for ordinary files. Async reads and
//! writes go through the active runtime: Tokio's file utilities (a blocking-thread pool) by
//! default, or compio (completion-based) under the
//! `compio-rt` feature. Directory and metadata helpers fall back to `std` where appropriate and
//! should be used sparingly.

mod metadata;
pub use self::metadata::*;
mod read;
pub use self::read::*;
mod write;
pub use self::write::*;
mod open;
pub use self::open::*;

/// Always-Tokio fs for the auth/session/token subsystem (the REST API lives on the Tokio sidecar).
pub mod sidecar_fs;

// The runtime entry lives in `crate::rt`. Re-exported here so the many fs-touching tests can keep
// calling `cc_fs::test_runtime`.
#[cfg(test)]
pub use crate::rt::test_runtime;
