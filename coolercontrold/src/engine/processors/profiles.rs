/*
 * CoolerControl - monitor and control your cooling and other devices
 * Copyright (c) 2021-2025  Guy Boldon, Eren Simsek and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
