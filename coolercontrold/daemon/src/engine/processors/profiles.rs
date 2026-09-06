// SPDX-FileCopyrightText: 2024 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

use crate::engine::{utils, Processor, SpeedProfileData};
use crate::setting::ProfileUID;

/// The standard Graph Profile processor that calculates duty from interpolating the speed profile.
pub struct GraphProcessor {}

impl GraphProcessor {
    pub fn new() -> Self {
        Self {}
    }
}

impl Processor for GraphProcessor {
    fn is_applicable(&self, data: &SpeedProfileData) -> bool {
        data.temp.is_some()
    }

    fn init_state(&self, _: &ProfileUID) {}

    fn clear_state(&self, _: &ProfileUID) {}

    fn process<'a>(&'a self, data: &'a mut SpeedProfileData) -> &'a mut SpeedProfileData {
        data.duty = Some(utils::interpolate_profile(
            &data.profile.speed_profile,
            data.temp.unwrap(),
        ));
        data
    }
}
