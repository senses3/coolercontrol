// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

//! The `manifest.toml` written into every backup.
//!
//! It makes a backup self-describing: `list` renders it and `restore` reads it
//! to warn on a daemon-version mismatch before overwriting live config.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// File name of the manifest inside a backup directory.
pub const MANIFEST_FILE_NAME: &str = "manifest.toml";

/// Bumped only when the manifest schema changes in a non-additive way.
pub const FORMAT_VERSION: u32 = 1;

/// Metadata describing the contents and origin of a single backup.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub format_version: u32,
    pub daemon_version: String,
    /// RFC 3339 local timestamp of when the backup was taken.
    pub created: String,
    pub hostname: String,
    pub includes_secrets: bool,
    /// File names captured in the backup, in backup order.
    pub files: Vec<String>,
}

impl Manifest {
    pub fn new(created: String, files: Vec<String>, includes_secrets: bool) -> Self {
        Self {
            format_version: FORMAT_VERSION,
            daemon_version: crate::VERSION.to_string(),
            created,
            hostname: sysinfo::System::host_name().unwrap_or_default(),
            includes_secrets,
            files,
        }
    }

    /// Renders the manifest as a TOML string.
    pub fn to_toml(&self) -> Result<String> {
        Ok(toml_edit::ser::to_document(self)
            .context("Serializing backup manifest")?
            .to_string())
    }

    /// Parses a manifest from a TOML string.
    #[allow(dead_code)] // Consumed by `list`/`restore` in a later phase.
    pub fn from_toml(contents: &str) -> Result<Self> {
        toml_edit::de::from_str(contents).context("Parsing backup manifest")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Goal: a manifest must survive a TOML round-trip byte-for-value so `list`
    /// and `restore` read back exactly what `backup` wrote. Method: build a
    /// manifest, render to TOML, parse it back, and assert every field matches.
    #[test]
    fn manifest_round_trips_through_toml() {
        let manifest = Manifest::new(
            "2026-07-12T14:30:00+00:00".to_string(),
            vec!["config.toml".to_string(), "alerts.json".to_string()],
            false,
        );

        let toml = manifest.to_toml().unwrap();
        let parsed = Manifest::from_toml(&toml).unwrap();

        assert_eq!(parsed.format_version, FORMAT_VERSION);
        assert_eq!(parsed.daemon_version, crate::VERSION);
        assert_eq!(parsed.created, "2026-07-12T14:30:00+00:00");
        assert!(!parsed.includes_secrets);
        assert_eq!(parsed.files, vec!["config.toml", "alerts.json"]);
    }
}
