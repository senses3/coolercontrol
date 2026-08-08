// SPDX-FileCopyrightText: 2022 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use strum::{Display, EnumString};

#[derive(
    Debug, Clone, PartialEq, Eq, Hash, Display, EnumString, Serialize, Deserialize, JsonSchema,
)]
pub enum BaseDriver {
    // with associated liquidctl python driver filename
    Aquacomputer,    // aquacomputer.py
    Legacy690Lc,     // asetek.py
    Modern690Lc,     // asetek.py
    Hydro690Lc,      // asetek.py
    HydroPro,        // asetek_pro.py
    AsusRyujin,      // asus_ryujin.py
    AuraLed,         // aura_led.py
    CommanderCore,   // commander_core.py
    CommanderPro,    // commander_pro.py
    ControlHub,      // control_hub.py
    Coolit,          // coolit.py
    CorsairHidPsu,   // corsair_hid_psu.py
    GA2LCD,          // ga2_lcd.py
    Ddr4Temperature, // ddr4.py - NOT currently Supported - requires unsafe ops
    VengeanceRgb,    // ddr4.py - NOT currently Supported - requires unsafe ops
    HydroPlatinum,   // hydro_platinum.py
    Kraken2,         // kraken2.py
    KrakenX3,        // kraken3.py
    KrakenZ3,        // kraken3.py
    MockKrakenZ3,    // kraken3.py
    MpgCooler,       // msi.py
    EvgaPascal,      // nvidia.py - NOT currently Supported - requires unsafe ops
    RogTuring,       // nvidia.py - NOT currently Supported - requires unsafe ops
    NzxtEPsu,        // nzxt_epsu.py
    RgbFusion2,      // rgb_fusion2.py
    SmartDevice,     // smart_device.py
    SmartDevice2,    // smart_device.py
    H1V2,            // smart_device.py
    MsiAcpiEc,       // custom out-of-tree driver
    LianLiUni,       // lianli_uni.py
    NotSupported,    // Used to indicate that this liquidctl driver is not currently supported
}
