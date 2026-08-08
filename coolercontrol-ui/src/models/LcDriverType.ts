// SPDX-FileCopyrightText: 2023 Guy Boldon, Eren Simsek and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * This is a representation of the liquidctl driver instance
 */
export enum LcDriverType {
    Aquacomputer = 'Aquacomputer',
    CommanderPro = 'CommanderPro',
    Kraken2 = 'Kraken2',
    KrakenX3 = 'KrakenX3',
    KrakenZ3 = 'KrakenZ3',
    MockKrakenZ3 = 'MockKrakenZ3',
    SmartDevice = 'SmartDevice',
    SmartDevice2 = 'SmartDevice2',
    H1V2 = 'H1V2',
    HydroPlatinum = 'HydroPlatinum',
    CorsairHidPsu = 'CorsairHidPsu',
    RgbFusion2 = 'RgbFusion2',
    AuraLed = 'AuraLed',
    CommanderCore = 'CommanderCore',
    NzxtEPsu = 'NzxtEPsu',
    Modern690Lc = 'Modern690Lc',
    MsiAcpiEc = 'MsiAcpiEc',
    Hydro690Lc = 'Hydro690Lc',
    Legacy690Lc = 'Legacy690Lc',
    HydroPro = 'HydroPro',
    EvgaPascal = 'EvgaPascal',
    RogTuring = 'RogTuring',
    Ddr4Temperature = 'Ddr4Temperature',
    VengeanceRgb = 'VengeanceRgb',
}

/**
 * Get the localized display name for LcDriverType
 * Note: Since model names typically don't need translation, we only add the function interface here but keep the original names
 * If specific model names need to be localized in the future, corresponding translations can be added here
 * @param type LcDriverType enum value
 * @returns Localized display name
 */
export function getLcDriverTypeDisplayName(type: LcDriverType): string {
    // These device models typically aren't translated, so return the original value
    // If localized display names are needed in the future, appropriate translation keys can be added
    return String(type)
}
