// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

use crate::cc_fs::sidecar_fs;
use crate::hashutil;
use anyhow::{anyhow, Result};
use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::{DateTime, Local};
use log::error;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::Permissions;
use std::os::unix::fs::PermissionsExt;
use subtle::ConstantTimeEq;
use uuid::Uuid;

use crate::paths;
const DEFAULT_PERMISSIONS: u32 = 0o600;

/// Length of a hex-encoded SHA-256 digest.
const DIGEST_HEX_LEN: usize = 64;

fn default_write_access() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StoredToken {
    pub id: String,
    pub label: String,
    /// DOWNGRADE-COMPAT(added 5.0.0, remove 5.2.0): see DEPRECATIONS.md. Superseded by
    /// `digest`, and only read on the legacy fallback path, but still written so a
    /// downgraded daemon can keep validating tokens minted here.
    pub hash: String,
    /// Hex-encoded SHA-256 of the raw token, absent on tokens minted before 5.0.0.
    /// `validate_token` upgrades those in place the first time they are presented.
    #[serde(default)]
    pub digest: Option<String>,
    pub created_at: DateTime<Local>,
    pub expires_at: Option<DateTime<Local>>,
    pub last_used: Option<DateTime<Local>>,
    #[serde(default = "default_write_access")]
    pub write_access: bool,
}

pub fn generate_token() -> String {
    format!("cc_{}", Uuid::new_v4().simple())
}

pub fn hash_token(token: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(token.as_bytes(), &salt)
        .map_err(|e| anyhow!("Failed to hash token: {e}"))?;
    Ok(hash.to_string())
}

pub fn verify_token(raw: &str, hash: &str) -> bool {
    match PasswordHash::new(hash) {
        Ok(parsed) => Argon2::default()
            .verify_password(raw.as_bytes(), &parsed)
            .is_ok(),
        Err(err) => {
            error!("Failed to parse stored token hash: {err}");
            false
        }
    }
}

/// Hex-encoded SHA-256 of a raw token.
///
/// Tokens are `cc_` plus 122 bits of `Uuid::new_v4` randomness, so a password KDF's
/// cost factor buys nothing here: brute force is infeasible at any hash speed, and
/// there is no precomputable space for a salt to defend. A fast digest with a
/// constant-time compare is the correct primitive for a high-entropy secret, and it
/// keeps the pre-auth path from becoming a CPU amplifier.
pub fn digest_token(raw: &str) -> String {
    let digest = Sha256::digest(raw.as_bytes());
    let hex = hashutil::to_lower_hex(&digest);
    debug_assert_eq!(hex.len(), DIGEST_HEX_LEN);
    hex
}

/// Compare two hex digests without leaking where they diverge. Length is not secret,
/// so checking it first is safe; the byte comparison itself must not short-circuit.
fn digests_match(presented: &str, stored: &str) -> bool {
    if presented.len() != stored.len() {
        return false;
    }
    presented.as_bytes().ct_eq(stored.as_bytes()).into()
}

fn is_expired(token: &StoredToken, now: DateTime<Local>) -> bool {
    token.expires_at.is_some_and(|expires_at| now >= expires_at)
}

pub async fn load_tokens() -> Result<Vec<StoredToken>> {
    let tokens_path = paths::tokens_file();
    if tokens_path.exists() {
        let contents = sidecar_fs::read_txt(tokens_path).await?;
        let trimmed = contents.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }
        let tokens: Vec<StoredToken> = serde_json::from_str(trimmed)?;
        sidecar_fs::set_permissions(tokens_path, Permissions::from_mode(DEFAULT_PERMISSIONS))
            .await?;
        Ok(tokens)
    } else {
        Ok(Vec::new())
    }
}

pub async fn save_tokens(tokens: &[StoredToken]) -> Result<()> {
    let tokens_path = paths::tokens_file();
    let json = serde_json::to_string_pretty(tokens)?;
    let _ = sidecar_fs::remove_file(tokens_path).await;
    sidecar_fs::write_string(tokens_path, json).await?;
    sidecar_fs::set_permissions(tokens_path, Permissions::from_mode(DEFAULT_PERMISSIONS)).await?;
    Ok(())
}

/// A token that matched, and whether it still needs its digest persisted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TokenMatch {
    pub id: String,
    pub write_access: bool,
    /// `Some` when the match came from the legacy argon2 path. The caller must persist
    /// it so this token never pays the KDF cost again.
    pub upgrade_digest: Option<String>,
}

/// Two passes, cheapest first. The digest pass is a handful of 64-byte compares; the
/// argon2 pass costs milliseconds each and runs only against tokens minted before
/// 5.0.0, a set that empties itself as those tokens are used.
pub fn validate_token(raw_token: &str, tokens: &[StoredToken]) -> Option<TokenMatch> {
    let now = Local::now();
    let presented = digest_token(raw_token);
    for token in tokens {
        if is_expired(token, now) {
            continue;
        }
        let Some(stored) = token.digest.as_deref() else {
            continue;
        };
        if digests_match(&presented, stored) {
            return Some(TokenMatch {
                id: token.id.clone(),
                write_access: token.write_access,
                upgrade_digest: None,
            });
        }
    }
    for token in tokens {
        if is_expired(token, now) {
            continue;
        }
        if token.digest.is_some() {
            continue;
        }
        if verify_token(raw_token, &token.hash) {
            return Some(TokenMatch {
                id: token.id.clone(),
                write_access: token.write_access,
                upgrade_digest: Some(presented),
            });
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ops::Not;

    /// Builds a stored token carrying both a digest and an argon2 hash, as `create`
    /// does since 5.0.0.
    fn stored_token(raw: &str, write_access: bool) -> StoredToken {
        StoredToken {
            id: "test-id".to_string(),
            label: "Test Token".to_string(),
            hash: hash_token(raw).unwrap(),
            digest: Some(digest_token(raw)),
            created_at: Local::now(),
            expires_at: None,
            last_used: None,
            write_access,
        }
    }

    /// Builds a token as it looked before 5.0.0: an argon2 hash and no digest.
    fn legacy_token(raw: &str, write_access: bool) -> StoredToken {
        StoredToken {
            digest: None,
            ..stored_token(raw, write_access)
        }
    }

    #[test]
    fn test_generate_token_format() {
        let token = generate_token();
        assert!(token.starts_with("cc_"));
        assert_eq!(token.len(), 35); // "cc_" (3) + uuid simple (32) = 35
                                     // Verify the UUID part is valid hex
        let uuid_part = &token[3..];
        assert!(uuid_part.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_generate_token_uniqueness() {
        let token1 = generate_token();
        let token2 = generate_token();
        assert_ne!(token1, token2);
    }

    #[test]
    fn test_hash_verify_roundtrip() {
        let token = generate_token();
        let hash = hash_token(&token).unwrap();
        assert!(hash.starts_with("$argon2id$"));
        assert!(verify_token(&token, &hash));
    }

    #[test]
    fn test_wrong_token_fails_verification() {
        let token = generate_token();
        let hash = hash_token(&token).unwrap();
        let wrong_token = generate_token();
        assert!(verify_token(&wrong_token, &hash).not());
    }

    /// Goal: the digest is a stable, correctly sized lowercase hex SHA-256.
    #[test]
    fn test_digest_token_shape_and_stability() {
        let raw = generate_token();
        let first = digest_token(&raw);
        assert_eq!(first.len(), DIGEST_HEX_LEN);
        assert!(first.chars().all(|c| c.is_ascii_hexdigit()));
        assert!(first.chars().any(char::is_uppercase).not());
        assert_eq!(first, digest_token(&raw));
        assert_ne!(first, digest_token(&generate_token()));
    }

    /// Goal: a known vector, so a swapped hash algorithm cannot pass silently.
    #[test]
    fn test_digest_token_known_vector() {
        assert_eq!(
            digest_token("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    /// Goal: length mismatch and content mismatch both fail; identity passes.
    #[test]
    fn test_digests_match() {
        let digest = digest_token("a");
        assert!(digests_match(&digest, &digest));
        assert!(digests_match(&digest, &digest_token("b")).not());
        assert!(digests_match(&digest, "short").not());
        assert!(digests_match("short", &digest).not());
    }

    #[test]
    fn test_validate_token_finds_match() {
        let raw = generate_token();
        let result = validate_token(&raw, &[stored_token(&raw, false)]).unwrap();
        assert_eq!(result.id, "test-id");
        assert!(result.write_access.not());
        assert_eq!(result.upgrade_digest, None);
    }

    #[test]
    fn test_validate_token_finds_match_with_write_access() {
        let raw = generate_token();
        let result = validate_token(&raw, &[stored_token(&raw, true)]).unwrap();
        assert_eq!(result.id, "test-id");
        assert!(result.write_access);
        assert_eq!(result.upgrade_digest, None);
    }

    #[test]
    fn test_validate_token_rejects_expired() {
        let raw = generate_token();
        let expired = StoredToken {
            expires_at: Some(Local::now() - chrono::Duration::hours(1)),
            ..stored_token(&raw, true)
        };
        assert_eq!(validate_token(&raw, &[expired]), None);
    }

    /// Goal: expiry is enforced on the legacy path too, not just the digest path.
    #[test]
    fn test_validate_token_rejects_expired_legacy() {
        let raw = generate_token();
        let expired = StoredToken {
            expires_at: Some(Local::now() - chrono::Duration::hours(1)),
            ..legacy_token(&raw, true)
        };
        assert_eq!(validate_token(&raw, &[expired]), None);
    }

    #[test]
    fn test_validate_token_accepts_non_expired() {
        let raw = generate_token();
        let valid = StoredToken {
            expires_at: Some(Local::now() + chrono::Duration::hours(1)),
            ..stored_token(&raw, true)
        };
        let result = validate_token(&raw, &[valid]).unwrap();
        assert_eq!(result.id, "test-id");
        assert!(result.write_access);
    }

    #[test]
    fn test_validate_token_no_match() {
        let raw = generate_token();
        let other = generate_token();
        assert_eq!(validate_token(&raw, &[stored_token(&other, false)]), None);
    }

    /// Goal: a pre-5.0.0 token still authenticates, and hands back the digest the
    /// caller must persist so it never pays argon2 again.
    #[test]
    fn test_validate_token_upgrades_legacy_token() {
        let raw = generate_token();
        let result = validate_token(&raw, &[legacy_token(&raw, true)]).unwrap();
        assert_eq!(result.id, "test-id");
        assert!(result.write_access);
        assert_eq!(result.upgrade_digest, Some(digest_token(&raw)));
    }

    /// Goal: prove a token carrying a digest never reaches the argon2 pass.
    ///
    /// Method: store a token whose `digest` is of token A but whose `hash` is of
    /// token B, then present B. A correct implementation skips digest-bearing tokens
    /// in the legacy pass and returns None. An implementation that fell back to
    /// argon2 for every token would match B's hash and return Some.
    #[test]
    fn test_digest_bearing_token_never_falls_back_to_argon2() {
        let token_a = generate_token();
        let token_b = generate_token();
        let mismatched = StoredToken {
            hash: hash_token(&token_b).unwrap(),
            digest: Some(digest_token(&token_a)),
            ..stored_token(&token_a, true)
        };
        assert_eq!(validate_token(&token_b, &[mismatched]), None);
    }

    /// Goal: rejecting a garbage token against a fully migrated store costs no KDF
    /// work, which is the property that removes the pre-auth CPU amplifier.
    ///
    /// Method: one argon2 verify measures ~7.7ms, so a whole rejection sweep over 50
    /// digest-bearing tokens finishing well inside a single verify's budget proves no
    /// verify ran. The bound is deliberately loose so a slow CI box cannot flake it.
    #[test]
    fn test_rejecting_garbage_token_skips_argon2() {
        let tokens: Vec<StoredToken> = (0..50)
            .map(|_| stored_token(&generate_token(), true))
            .collect();
        let garbage = generate_token();

        let start = std::time::Instant::now();
        let result = validate_token(&garbage, &tokens);
        let elapsed = start.elapsed();

        assert_eq!(result, None);
        assert!(
            elapsed < std::time::Duration::from_millis(5),
            "rejection swept 50 tokens in {elapsed:?}, which implies argon2 ran"
        );
    }

    /// Goal: the digest pass wins even when an unrelated legacy token sits first in
    /// the store, so a migrated token is never delayed by someone else's KDF.
    #[test]
    fn test_digest_pass_precedes_legacy_pass() {
        let legacy_raw = generate_token();
        let digest_raw = generate_token();
        let tokens = vec![
            legacy_token(&legacy_raw, false),
            StoredToken {
                id: "digest-id".to_string(),
                ..stored_token(&digest_raw, true)
            },
        ];
        let result = validate_token(&digest_raw, &tokens).unwrap();
        assert_eq!(result.id, "digest-id");
        assert_eq!(result.upgrade_digest, None);
    }

    #[test]
    fn test_load_save_roundtrip() {
        sidecar_fs::test_runtime(async {
            let dir = tempfile::tempdir().unwrap();
            let tokens_path = dir.path().join(".tokens");

            let raw = generate_token();
            let tokens = vec![StoredToken {
                id: "id1".to_string(),
                label: "Test".to_string(),
                ..stored_token(&raw, true)
            }];

            let json = serde_json::to_string_pretty(&tokens).unwrap();
            sidecar_fs::write_string(&tokens_path, json).await.unwrap();

            let contents = sidecar_fs::read_txt(&tokens_path).await.unwrap();
            let loaded: Vec<StoredToken> = serde_json::from_str(contents.trim()).unwrap();
            assert_eq!(loaded.len(), 1);
            assert_eq!(loaded[0].id, "id1");
            assert_eq!(loaded[0].label, "Test");
            assert!(loaded[0].write_access);
            assert_eq!(loaded[0].digest, Some(digest_token(&raw)));
            assert!(verify_token(&raw, &loaded[0].hash));
        });
    }

    #[test]
    fn test_deserialize_without_write_access_defaults_to_true() {
        let json = r#"[{
            "id": "old-id",
            "label": "Old Token",
            "hash": "$argon2id$v=19$m=19456,t=2,p=1$fake$fake",
            "created_at": "2025-01-01T00:00:00+00:00",
            "expires_at": null,
            "last_used": null
        }]"#;
        let tokens: Vec<StoredToken> = serde_json::from_str(json).unwrap();
        assert_eq!(tokens.len(), 1);
        assert!(tokens[0].write_access);
    }

    /// Goal: a tokens file written before 5.0.0 loads with no digest, so those tokens
    /// route to the legacy pass instead of silently failing to validate.
    #[test]
    fn test_deserialize_without_digest_defaults_to_none() {
        let json = r#"[{
            "id": "old-id",
            "label": "Old Token",
            "hash": "$argon2id$v=19$m=19456,t=2,p=1$fake$fake",
            "created_at": "2025-01-01T00:00:00+00:00",
            "expires_at": null,
            "last_used": null,
            "write_access": false
        }]"#;
        let tokens: Vec<StoredToken> = serde_json::from_str(json).unwrap();
        assert_eq!(tokens.len(), 1);
        assert_eq!(tokens[0].digest, None);
    }

    /// Goal: DOWNGRADE-COMPAT(added 5.0.0, remove 5.2.0). A 4.3.x daemon reads
    /// `hash` and knows nothing of `digest`, so `hash` must still be present and
    /// valid on everything we write.
    #[test]
    fn test_serialized_token_keeps_argon2_hash_for_downgrade() {
        let raw = generate_token();
        let json = serde_json::to_string(&[stored_token(&raw, true)]).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        let hash = value[0]["hash"].as_str().unwrap();
        assert!(hash.starts_with("$argon2id$"));
        assert!(verify_token(&raw, hash));
    }
}
