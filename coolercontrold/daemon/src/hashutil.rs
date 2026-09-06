// SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

use std::fmt::Write;

/// Encode a byte slice as a lowercase hex string.
pub fn to_lower_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut acc, byte| {
            // `fmt::Write` for `String` is infallible; it only calls `push_str` internally.
            write!(acc, "{byte:02x}").unwrap();
            acc
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_lower_hex_empty() {
        assert_eq!(to_lower_hex(&[]), "");
    }

    #[test]
    fn test_to_lower_hex_single_byte() {
        assert_eq!(to_lower_hex(&[0xff]), "ff");
        assert_eq!(to_lower_hex(&[0x00]), "00");
        assert_eq!(to_lower_hex(&[0x0a]), "0a");
    }

    #[test]
    fn test_to_lower_hex_multiple_bytes() {
        assert_eq!(to_lower_hex(&[0xde, 0xad, 0xbe, 0xef]), "deadbeef");
    }
}
