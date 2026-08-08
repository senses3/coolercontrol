// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

use std::fs::OpenOptions;

/// Creates a new set of `std::fs::OpenOptions`.
///
/// All options are initially set to false.
pub fn open_options() -> OpenOptions {
    OpenOptions::new()
}
