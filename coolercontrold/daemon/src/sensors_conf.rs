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

//! Reads the `label` and `ignore` statements out of the user's lm-sensors configuration.
//!
//! The grammar, file search order and precedence rules follow lm-sensors `lib/conf-lex.l`,
//! `lib/conf-parse.y`, `lib/init.c` and `lib/access.c`. `set`, `compute` and `bus` statements are
//! recognized and discarded: they steer readings, which is not something we mirror.
//!
//! The files are read once at startup and are never written by us. A malformed statement is
//! reported and skipped, an unreadable file is reported and skipped: a broken sensors
//! configuration must never keep the daemon from starting.

use crate::cc_fs;
use crate::repositories::hwmon::chip_name::{BusType, ChipName};
use log::{info, warn};
use std::fmt::Write as _;
use std::ops::Not;
use std::path::{Path, PathBuf};
use std::rc::Rc;

/// Where lm-sensors looks for its configuration.
const DEFAULT_ETC_DIR: &str = "/etc";
const PRIMARY_CONFIG_FILE: &str = "sensors3.conf";
/// Only consulted when the primary file is absent, never in addition to it.
const LEGACY_CONFIG_FILE: &str = "sensors.conf";
const CONFIG_DIR: &str = "sensors.d";

/// Caps on what we will read. A sensors configuration is a handful of small hand-written files;
/// these bounds only stop a pathological directory from costing us memory or startup time.
const MAX_CONFIG_FILES: usize = 64;
const MAX_CONFIG_FILE_BYTES: u64 = 1024 * 1024;
/// A `chip` statement may name many chips, but not thousands.
const MAX_STATEMENT_TOKENS: usize = 256;

/// The `label` and `ignore` statements of every parsed configuration file, in parse order.
#[derive(Debug, Default)]
pub struct SensorsConf {
    chip_blocks: Vec<ChipBlock>,
    files_read: usize,
}

/// One `chip` statement and the statements that follow it, up to the next `chip`.
#[derive(Debug)]
struct ChipBlock {
    /// The file the block came from, named when we report acting on it.
    source: Rc<Path>,
    /// The chip patterns the block applies to. A block matches if any of them does. Empty when
    /// the `chip` statement itself was malformed, which makes the block inert.
    patterns: Vec<ChipPattern>,
    /// Feature name to label, in file order. The first entry for a feature wins.
    labels: Vec<(String, String)>,
    /// Feature names to hide.
    ignores: Vec<String>,
}

/// A chip name pattern from a `chip` statement. `None` means `*`, matching anything.
#[derive(Debug, PartialEq, Eq)]
struct ChipPattern {
    prefix: Option<String>,
    bus_type: Option<BusType>,
    bus_nr: Option<i16>,
    addr: Option<u32>,
}

impl SensorsConf {
    /// Reads the standard lm-sensors configuration files. Never fails: an unusable configuration
    /// yields an empty result.
    pub async fn load() -> Self {
        Self::load_from(Path::new(DEFAULT_ETC_DIR)).await
    }

    /// `etc_dir` stands in for `/etc` so that the search order is testable.
    pub async fn load_from(etc_dir: &Path) -> Self {
        let paths = config_file_paths(etc_dir);
        let mut chip_blocks = Vec::new();
        let mut files_read = 0;
        for path in paths {
            let Some(contents) = read_config_file(&path).await else {
                continue;
            };
            chip_blocks.append(&mut parse(&contents, &path));
            files_read += 1;
        }
        let loaded = Self {
            chip_blocks,
            files_read,
        };
        info!("Loaded lm-sensors configuration: {}", loaded.summary());
        loaded
    }

    /// The label configured for a feature, e.g. `temp1`, of a chip.
    ///
    /// Across blocks the last one parsed wins, within a block the first statement wins. That
    /// ordering is `sensors_get_label`'s, which walks the blocks backwards and their statements
    /// forwards. It is positional: a later `chip "nct6687-*"` beats an earlier exact match.
    pub fn label(&self, chip: &ChipName, feature: &str) -> Option<&str> {
        self.matching_blocks(chip).find_map(|block| {
            block
                .labels
                .iter()
                .find(|(name, _)| name == feature)
                .map(|(_, label)| label.as_str())
        })
    }

    /// The configuration file that hides this feature, if any of them does.
    ///
    /// Order does not matter here, unlike for labels: no statement un-ignores a feature, so the
    /// first match found is as good as any. The file is reported so that a user with a directory
    /// full of them can find the statement.
    pub fn ignore_source(&self, chip: &ChipName, feature: &str) -> Option<&Path> {
        self.matching_blocks(chip).find_map(|block| {
            block
                .ignores
                .iter()
                .any(|name| name == feature)
                .then(|| block.source.as_ref())
        })
    }

    /// Blocks that apply to this chip, last parsed first.
    fn matching_blocks(&self, chip: &ChipName) -> impl Iterator<Item = &ChipBlock> {
        self.chip_blocks
            .iter()
            .rev()
            .filter(move |block| block.matches(chip))
    }

    /// Builds a configuration straight from text, for tests that need one without a file tree.
    #[cfg(test)]
    pub fn from_config_text(contents: &str) -> Self {
        Self {
            chip_blocks: parse(contents, Path::new("test.conf")),
            files_read: 1,
        }
    }

    fn summary(&self) -> String {
        let labels: usize = self.chip_blocks.iter().map(|b| b.labels.len()).sum();
        let ignores: usize = self.chip_blocks.iter().map(|b| b.ignores.len()).sum();
        let mut summary = String::with_capacity(64);
        let _ = write!(
            summary,
            "{} file(s), {} chip block(s), {labels} label(s), {ignores} ignored feature(s)",
            self.files_read,
            self.chip_blocks.len()
        );
        summary
    }
}

impl ChipBlock {
    fn matches(&self, chip: &ChipName) -> bool {
        self.patterns.iter().any(|pattern| pattern.matches(chip))
    }
}

impl ChipPattern {
    /// An element is compared only when the pattern pins it down, which is `sensors_match_chip`
    /// with the wildcards all on the configuration side.
    fn matches(&self, chip: &ChipName) -> bool {
        if self.prefix.as_ref().is_some_and(|p| *p != chip.prefix) {
            return false;
        }
        if self.bus_type.is_some_and(|t| t != chip.bus.bus_type()) {
            return false;
        }
        if self.bus_nr.is_some_and(|nr| nr != chip.bus.nr()) {
            return false;
        }
        if self.addr.is_some_and(|addr| addr != chip.bus.addr()) {
            return false;
        }
        true
    }
}

/// The configuration files to read, in the order lm-sensors reads them.
///
/// One of `sensors3.conf` or `sensors.conf`, never both, then every regular file in `sensors.d`
/// sorted by name. Note that the directory is not filtered by extension.
fn config_file_paths(etc_dir: &Path) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let primary = etc_dir.join(PRIMARY_CONFIG_FILE);
    let legacy = etc_dir.join(LEGACY_CONFIG_FILE);
    if cc_fs::exists(&primary) {
        paths.push(primary);
    } else if cc_fs::exists(&legacy) {
        paths.push(legacy);
    }
    paths.append(&mut config_dir_paths(&etc_dir.join(CONFIG_DIR)));
    if paths.len() > MAX_CONFIG_FILES {
        warn!(
            "Found {} lm-sensors configuration files, reading only the first {MAX_CONFIG_FILES}",
            paths.len()
        );
        paths.truncate(MAX_CONFIG_FILES);
    }
    paths
}

fn config_dir_paths(config_dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = cc_fs::read_dir(config_dir) else {
        return Vec::new();
    };
    let mut paths = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|file_type| file_type.is_file()))
        .map(|entry| entry.path())
        .filter(|path| {
            // Hidden files are skipped, which is how editor backups stay out of the way.
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with('.').not())
        })
        .collect::<Vec<PathBuf>>();
    paths.sort();
    paths
}

async fn read_config_file(path: &Path) -> Option<String> {
    let too_large = cc_fs::metadata(path).is_ok_and(|data| data.len() > MAX_CONFIG_FILE_BYTES);
    if too_large {
        warn!(
            "Skipping lm-sensors configuration file over {MAX_CONFIG_FILE_BYTES} bytes: {}",
            path.display()
        );
        return None;
    }
    cc_fs::read_txt(path)
        .await
        .inspect_err(|err| {
            warn!(
                "Skipping unreadable lm-sensors configuration file {}: {err}",
                path.display()
            );
        })
        .ok()
}

/// Turns one configuration file into its chip blocks. Statements we cannot make sense of are
/// reported and dropped, as the grammar's own error production does.
fn parse(contents: &str, path: &Path) -> Vec<ChipBlock> {
    let source: Rc<Path> = Rc::from(path);
    let mut blocks: Vec<ChipBlock> = Vec::new();
    let mut lexer = Lexer::new(contents);
    let mut statement = Vec::new();
    loop {
        let line = lexer.line;
        let end_of_input = lexer.read_statement(&mut statement);
        apply_statement(
            &statement,
            &mut blocks,
            &Location {
                source: &source,
                line,
            },
        );
        if end_of_input {
            return blocks;
        }
    }
}

/// Where a statement came from, for the log lines about it.
struct Location<'a> {
    source: &'a Rc<Path>,
    line: u32,
}

impl Location<'_> {
    fn warn(&self, message: &str) {
        warn!(
            "Ignoring lm-sensors configuration statement at {}:{}: {message}",
            self.source.display(),
            self.line
        );
    }
}

fn apply_statement(statement: &[Token], blocks: &mut Vec<ChipBlock>, location: &Location) {
    let Some(Token::Name(keyword)) = statement.first() else {
        if statement.is_empty().not() {
            location.warn("statement does not start with a keyword");
        }
        return;
    };
    let arguments = &statement[1..];
    match keyword.as_str() {
        "chip" => blocks.push(parse_chip_statement(arguments, location)),
        "label" => apply_label(arguments, blocks, location),
        "ignore" => apply_ignore(arguments, blocks, location),
        // Valid statements that say nothing about naming or visibility.
        "set" | "compute" | "bus" => (),
        _ => location.warn("invalid keyword"),
    }
}

/// A `chip` statement always opens a block, even when its patterns are unusable. lm-sensors
/// instead drops the statement and lets the following labels fall into the previous block, which
/// silently relabels an unrelated chip. An inert block is the safer reading of the same typo.
fn parse_chip_statement(arguments: &[Token], location: &Location) -> ChipBlock {
    let mut patterns = Vec::with_capacity(arguments.len());
    for argument in arguments {
        let Token::Name(name) = argument else {
            location.warn("chip name must be a name or a quoted string");
            continue;
        };
        match parse_chip_pattern(name) {
            Some(pattern) => patterns.push(pattern),
            None => location.warn(&format!("unparsable chip name \"{name}\"")),
        }
    }
    if arguments.is_empty() {
        location.warn("chip statement names no chips");
    }
    ChipBlock {
        source: Rc::clone(location.source),
        patterns,
        labels: Vec::new(),
        ignores: Vec::new(),
    }
}

fn apply_label(arguments: &[Token], blocks: &mut [ChipBlock], location: &Location) {
    let [Token::Name(feature), Token::Name(label)] = arguments else {
        location.warn("label takes a feature name and a label");
        return;
    };
    let Some(block) = blocks.last_mut() else {
        location.warn("label statement before the first chip statement");
        return;
    };
    block.labels.push((feature.clone(), label.clone()));
}

fn apply_ignore(arguments: &[Token], blocks: &mut [ChipBlock], location: &Location) {
    let [Token::Name(feature)] = arguments else {
        location.warn("ignore takes a single feature name");
        return;
    };
    let Some(block) = blocks.last_mut() else {
        location.warn("ignore statement before the first chip statement");
        return;
    };
    if is_subfeature_name(feature) {
        location.warn(&format!(
            "\"{feature}\" names a sub-feature, which only lm-sensors 3.6.1 and later act on, \
             and which does not map onto a CoolerControl channel: ignoring the whole feature \
             instead requires dropping the suffix"
        ));
        return;
    }
    block.ignores.push(feature.clone());
}

/// Whether a name is the sub-feature form, e.g. `fan1_input` rather than `fan1`, for the
/// features that map onto our channels. Other features have underscores of their own, such as
/// `cpu0_vid`, so the check is deliberately narrow.
fn is_subfeature_name(feature: &str) -> bool {
    const CHANNEL_PREFIXES: [&str; 3] = ["temp", "fan", "pwm"];
    let has_channel_prefix = CHANNEL_PREFIXES
        .iter()
        .any(|prefix| feature.starts_with(prefix));
    has_channel_prefix && feature.contains('_')
}

/// Parses a chip name pattern, `prefix-bustype[-busnr]-address`, where any element may be `*`.
///
/// Mirrors `sensors_parse_chip_name`. Only whole elements may be wildcards, so `nct6*-isa-0a20`
/// is not a pattern, it is a literal prefix that will never match.
fn parse_chip_pattern(text: &str) -> Option<ChipPattern> {
    let (prefix, rest) = if let Some(rest) = text.strip_prefix("*-") {
        (None, rest)
    } else {
        let (prefix, rest) = text.split_once('-')?;
        (Some(prefix.to_owned()), rest)
    };
    // A sole `*` stands for every bus and address, e.g. `nct6687-*`.
    if rest == "*" {
        return Some(ChipPattern {
            prefix,
            bus_type: None,
            bus_nr: None,
            addr: None,
        });
    }
    let (bus_token, rest) = rest.split_once('-')?;
    let bus_type = BusType::from_config_token(bus_token)?;
    let (bus_nr, rest) = if bus_type.has_bus_nr() {
        parse_bus_nr(rest)?
    } else {
        (None, rest)
    };
    let addr = if rest == "*" {
        None
    } else {
        Some(u32::from_str_radix(rest, 16).ok()?)
    };
    Some(ChipPattern {
        prefix,
        bus_type: Some(bus_type),
        bus_nr,
        addr,
    })
}

/// The bus number element, which only some bus types carry. Decimal, or `*` for any.
fn parse_bus_nr(text: &str) -> Option<(Option<i16>, &str)> {
    if let Some(rest) = text.strip_prefix("*-") {
        return Some((None, rest));
    }
    let (nr, rest) = text.split_once('-')?;
    Some((Some(nr.parse::<i16>().ok()?), rest))
}

/// One token of the configuration grammar. Only names carry meaning for us; the rest exists so a
/// statement that is not shaped the way we expect can be recognized and skipped.
#[derive(Debug, PartialEq, Eq)]
enum Token {
    /// A bare identifier or a quoted string, which the grammar treats alike.
    Name(String),
    /// A character that cannot begin a name, such as an operator in a `compute` expression.
    Other(char),
    /// A lexical error, such as a string with no closing quote.
    Invalid,
}

/// What the tokenizer found: a token, the end of a statement, or the end of the file.
enum Lexed {
    Token(Token),
    EndOfStatement,
    EndOfInput,
}

/// Tokenizer for the configuration grammar, following `conf-lex.l`.
struct Lexer<'a> {
    rest: &'a str,
    line: u32,
}

impl<'a> Lexer<'a> {
    fn new(contents: &'a str) -> Self {
        Self {
            rest: contents,
            line: 1,
        }
    }

    /// Fills `statement` with the tokens up to the end of the line, and reports whether the input
    /// is exhausted. Statements end at a newline; a backslash before one continues them.
    fn read_statement(&mut self, statement: &mut Vec<Token>) -> bool {
        statement.clear();
        loop {
            match self.next_token() {
                Lexed::EndOfInput => return true,
                Lexed::EndOfStatement => return false,
                Lexed::Token(token) => {
                    if statement.len() < MAX_STATEMENT_TOKENS {
                        statement.push(token);
                    }
                }
            }
        }
    }

    fn next_token(&mut self) -> Lexed {
        loop {
            let Some(next) = self.rest.chars().next() else {
                return Lexed::EndOfInput;
            };
            match next {
                // BLANK, which notably does not include the newline.
                ' ' | '\x0c' | '\r' | '\t' | '\x0b' => self.advance(1),
                '\n' => {
                    self.advance(1);
                    self.line += 1;
                    return Lexed::EndOfStatement;
                }
                '#' => self.skip_to_line_end(),
                '\\' if self.skip_escaped_newline() => (),
                '"' => return Lexed::Token(self.read_quoted_name()),
                _ if is_name_char(next) => return Lexed::Token(self.read_bare_name()),
                _ => {
                    self.advance(next.len_utf8());
                    return Lexed::Token(Token::Other(next));
                }
            }
        }
    }

    fn advance(&mut self, bytes: usize) {
        self.rest = &self.rest[bytes..];
    }

    fn skip_to_line_end(&mut self) {
        let line_end = self.rest.find('\n').unwrap_or(self.rest.len());
        self.advance(line_end);
    }

    /// Consumes a backslash that continues the statement onto the next line. Only blanks may sit
    /// between it and the newline.
    fn skip_escaped_newline(&mut self) -> bool {
        let after_blanks = self.rest[1..].trim_start_matches([' ', '\x0c', '\r', '\t', '\x0b']);
        if after_blanks.starts_with('\n').not() {
            return false;
        }
        let consumed = self.rest.len() - after_blanks.len() + 1;
        self.advance(consumed);
        self.line += 1;
        true
    }

    fn read_bare_name(&mut self) -> Token {
        let name_end = self
            .rest
            .find(|c: char| is_name_char(c).not())
            .unwrap_or(self.rest.len());
        let (name, rest) = self.rest.split_at(name_end);
        self.rest = rest;
        Token::Name(name.to_owned())
    }

    /// Reads a double quoted string with its escapes.
    ///
    /// A newline before the closing quote is an error, including an escaped one: a string cannot
    /// span lines. The newline is left in place so that it still ends the statement and the next
    /// line is parsed normally.
    fn read_quoted_name(&mut self) -> Token {
        self.advance(1);
        let mut name = String::new();
        while let Some(next) = self.rest.chars().next() {
            if next == '\n' {
                return Token::Invalid;
            }
            self.advance(next.len_utf8());
            match next {
                '"' => return Token::Name(name),
                '\\' => {
                    let Some(escaped) = self.rest.chars().next() else {
                        break;
                    };
                    if escaped == '\n' {
                        return Token::Invalid;
                    }
                    self.advance(escaped.len_utf8());
                    name.push(unescape(escaped));
                }
                _ => name.push(next),
            }
        }
        Token::Invalid
    }
}

/// The escapes the grammar names. Any other escaped character stands for itself.
fn unescape(escaped: char) -> char {
    match escaped {
        'a' => '\x07',
        'b' => '\x08',
        'f' => '\x0c',
        'n' => '\n',
        'r' => '\r',
        't' => '\t',
        'v' => '\x0b',
        other => other,
    }
}

/// `IDCHAR` in the grammar. A bare name holds no dashes, which is why chip names are quoted.
fn is_name_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repositories::hwmon::chip_name::Bus;
    use std::fs;
    use tempfile::TempDir;

    fn chip(prefix: &str, bus: Bus) -> ChipName {
        ChipName {
            prefix: prefix.to_owned(),
            bus,
        }
    }

    fn nct6687() -> ChipName {
        chip("nct6687", Bus::Isa { addr: 0x0a20 })
    }

    fn parsed(contents: &str) -> SensorsConf {
        SensorsConf::from_config_text(contents)
    }

    /// Writes a `/etc` tree and loads it, which is the only way to cover the search order.
    struct EtcFixture {
        root: TempDir,
    }

    impl EtcFixture {
        fn new() -> Self {
            Self {
                root: tempfile::tempdir().unwrap(),
            }
        }

        fn write(&self, relative_path: &str, contents: &str) {
            let path = self.root.path().join(relative_path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, contents).unwrap();
        }

        async fn load(&self) -> SensorsConf {
            SensorsConf::load_from(self.root.path()).await
        }
    }

    /// Goal: the statements we care about must survive a realistically shaped file, including
    /// the syntax around them. Method: one file with comments, quoting, continuation and the
    /// statements we discard, then check what came out.
    #[test]
    fn parses_labels_and_ignores() {
        let conf = parsed(
            r#"
            # A comment line, and a chip naming two patterns.
            chip "nct6687-isa-0a20" "it8686-*"
                label temp1 "Water In"      # trailing comment
                label   fan2   PumpTach
                ignore temp5
                ignore fan7
                set in0_min  0.9 * 3.3
                compute temp1 @ - 5, @ + 5
                label \
                    temp2 "Continued"
                label temp3 "Not \
                             Continued"
            "#,
        );

        assert_eq!(conf.label(&nct6687(), "temp1"), Some("Water In"));
        // A bare name is as good as a quoted one.
        assert_eq!(conf.label(&nct6687(), "fan2"), Some("PumpTach"));
        // A backslash before a newline continues the statement.
        assert_eq!(conf.label(&nct6687(), "temp2"), Some("Continued"));
        // It cannot do so from inside a string, though: that is an unterminated string.
        assert_eq!(conf.label(&nct6687(), "temp3"), None);
        assert_eq!(conf.label(&nct6687(), "temp9"), None);
        assert!(conf.ignore_source(&nct6687(), "temp5").is_some());
        assert!(conf.ignore_source(&nct6687(), "fan7").is_some());
        assert!(conf.ignore_source(&nct6687(), "temp1").is_some().not());
        // The second pattern of the same statement matches too.
        let it8686 = chip("it8686", Bus::Isa { addr: 0x0a40 });
        assert_eq!(conf.label(&it8686, "temp1"), Some("Water In"));
    }

    /// Goal: precedence must be positional, since that is what lm-sensors does and what a user's
    /// existing file was written against. Method: a specific block followed by a wildcard block,
    /// and two labels for one feature inside a single block.
    #[test]
    fn resolves_by_position_not_by_specificity() {
        let conf = parsed(
            r#"
            chip "nct6687-isa-0a20"
                label temp1 "Specific"
                label temp1 "Shadowed By The First"
            chip "nct6687-*"
                label temp1 "Later Wildcard"
                label temp3 "Only Here"
            "#,
        );

        // The later block wins even though the earlier one names the chip exactly.
        assert_eq!(conf.label(&nct6687(), "temp1"), Some("Later Wildcard"));
        // A block that says nothing about a feature does not shadow an earlier one.
        assert_eq!(conf.label(&nct6687(), "temp3"), Some("Only Here"));
    }

    /// Goal: the first statement inside a block must win, which is the opposite of the rule
    /// between blocks and is the part the man page gets wrong. Method: two labels for one
    /// feature in one block, with no other block in play.
    #[test]
    fn keeps_the_first_statement_within_a_block() {
        let conf = parsed(
            r#"
            chip "nct6687-*"
                label temp1 "First Wins"
                label temp1 "Second Loses"
            "#,
        );

        assert_eq!(conf.label(&nct6687(), "temp1"), Some("First Wins"));
    }

    /// Goal: every wildcard form must match what it should and nothing else, because a pattern
    /// that matches too much silently relabels unrelated hardware. Method: parse each form and
    /// check it against chips that should and should not match.
    #[test]
    fn matches_chip_patterns() {
        let cases: Vec<(&str, ChipPattern)> = vec![
            (
                "nct6687-isa-0a20",
                ChipPattern {
                    prefix: Some("nct6687".to_owned()),
                    bus_type: Some(BusType::Isa),
                    bus_nr: None,
                    addr: Some(0x0a20),
                },
            ),
            (
                "nct6687-*",
                ChipPattern {
                    prefix: Some("nct6687".to_owned()),
                    bus_type: None,
                    bus_nr: None,
                    addr: None,
                },
            ),
            (
                "*-isa-*",
                ChipPattern {
                    prefix: None,
                    bus_type: Some(BusType::Isa),
                    bus_nr: None,
                    addr: None,
                },
            ),
            (
                "lm78-i2c-*-2d",
                ChipPattern {
                    prefix: Some("lm78".to_owned()),
                    bus_type: Some(BusType::I2c),
                    bus_nr: None,
                    addr: Some(0x2d),
                },
            ),
            (
                "lm78-i2c-1-2d",
                ChipPattern {
                    prefix: Some("lm78".to_owned()),
                    bus_type: Some(BusType::I2c),
                    bus_nr: Some(1),
                    addr: Some(0x2d),
                },
            ),
        ];
        for (text, expected) in cases {
            assert_eq!(parse_chip_pattern(text).as_ref(), Some(&expected), "{text}");
        }

        // A bus type that carries no bus number must not eat one.
        let k10temp = chip("k10temp", Bus::Pci { addr: 0x00c3 });
        assert!(parse_chip_pattern("k10temp-pci-00c3")
            .unwrap()
            .matches(&k10temp));
        assert!(parse_chip_pattern("k10temp-pci-*")
            .unwrap()
            .matches(&k10temp));
        assert!(parse_chip_pattern("*-pci-00c3").unwrap().matches(&k10temp));
        assert!(parse_chip_pattern("k10temp-isa-00c3")
            .unwrap()
            .matches(&k10temp)
            .not());
        assert!(parse_chip_pattern("k10temp-pci-00c4")
            .unwrap()
            .matches(&k10temp)
            .not());

        // The bus number is only compared when the pattern pins it.
        let lm78 = chip("lm78", Bus::I2c { nr: 1, addr: 0x2d });
        assert!(parse_chip_pattern("lm78-i2c-*-2d").unwrap().matches(&lm78));
        assert!(parse_chip_pattern("lm78-i2c-1-2d").unwrap().matches(&lm78));
        assert!(parse_chip_pattern("lm78-i2c-2-2d")
            .unwrap()
            .matches(&lm78)
            .not());

        // Only whole elements may be wildcards.
        assert!(parse_chip_pattern("nct6*-isa-0a20")
            .unwrap()
            .matches(&nct6687())
            .not());
    }

    /// Goal: a pattern we cannot parse must be rejected outright rather than half understood.
    /// Method: the malformed forms a hand-written file is likely to contain.
    #[test]
    fn rejects_unparsable_chip_patterns() {
        for text in [
            "nct6687",           // no bus element at all
            "nct6687-isa",       // no address
            "nct6687-usb-0a20",  // unknown bus type
            "nct6687-i2c-0a20",  // bus number missing for a type that needs one
            "nct6687-isa-nnnn",  // address is not hexadecimal
            "nct6687-isa-0a20-", // trailing rubbish
            "",
        ] {
            assert_eq!(parse_chip_pattern(text), None, "{text} should not parse");
        }
    }

    /// Goal: one bad statement must cost only that statement. A configuration file is
    /// hand-written and a typo in it must not disarm the rest. Method: a file where every kind
    /// of malformed statement is surrounded by good ones.
    #[test]
    fn skips_malformed_statements_and_keeps_going() {
        let conf = parsed(
            r#"
            label temp1 "Before Any Chip"
            chip "nct6687-*"
                label temp1 "Good"
                label temp2
                label temp3 "One" "Too Many"
                ignore
                ignore temp4 temp5
                labelx temp6 "Not A Keyword"
                label temp7 "Unterminated
                label temp8 "Good Again"
                ignore temp9
            "#,
        );

        assert_eq!(conf.label(&nct6687(), "temp1"), Some("Good"));
        assert_eq!(conf.label(&nct6687(), "temp2"), None);
        assert_eq!(conf.label(&nct6687(), "temp3"), None);
        assert_eq!(conf.label(&nct6687(), "temp7"), None);
        // Recovery: the statements after the broken ones still apply.
        assert_eq!(conf.label(&nct6687(), "temp8"), Some("Good Again"));
        assert!(conf.ignore_source(&nct6687(), "temp9").is_some());
        assert!(conf.ignore_source(&nct6687(), "temp4").is_some().not());
    }

    /// Goal: a `chip` statement with an unusable name must not capture the labels that follow it,
    /// which in lm-sensors would land on the previous chip and relabel it. Method: a good block
    /// followed by a typo'd one whose labels must go nowhere.
    #[test]
    fn an_unusable_chip_statement_swallows_its_own_labels() {
        let conf = parsed(
            r#"
            chip "nct6687-*"
                label temp1 "Correct"
            chip "nct6687"
                label temp1 "Typo Block"
            "#,
        );

        assert_eq!(conf.label(&nct6687(), "temp1"), Some("Correct"));
    }

    /// Goal: sub-feature ignores must not be mistaken for feature ignores, because
    /// `ignore fan1_input` means something narrower than `ignore fan1` and only on newer
    /// lm-sensors. Method: both forms in one block.
    #[test]
    fn does_not_act_on_subfeature_ignores() {
        let conf = parsed(
            r#"
            chip "nct6687-*"
                ignore fan1_input
                ignore temp2_crit
                ignore fan3
            "#,
        );

        assert!(conf.ignore_source(&nct6687(), "fan1").is_some().not());
        assert!(conf.ignore_source(&nct6687(), "fan1_input").is_some().not());
        assert!(conf.ignore_source(&nct6687(), "temp2").is_some().not());
        assert!(conf.ignore_source(&nct6687(), "fan3").is_some());
    }

    /// Goal: a feature name that merely contains an underscore must still work, or chips with a
    /// vid feature would silently lose their ignore. Method: the two real feature names that
    /// carry underscores.
    #[test]
    fn keeps_feature_names_that_contain_underscores() {
        let conf = parsed(
            r#"
            chip "nct6687-*"
                ignore cpu0_vid
                ignore beep_enable
            "#,
        );

        assert!(conf.ignore_source(&nct6687(), "cpu0_vid").is_some());
        assert!(conf.ignore_source(&nct6687(), "beep_enable").is_some());
    }

    /// Goal: the file search order decides which of two conflicting labels a user sees, so it
    /// must match lm-sensors exactly. Method: an `/etc` tree holding every file in the search
    /// order at once, each labelling the same feature.
    #[test]
    fn reads_files_in_the_documented_order() {
        crate::rt::test_runtime(async {
            let fixture = EtcFixture::new();
            fixture.write(
                "sensors3.conf",
                "chip \"nct6687-*\"\n label temp1 \"Primary\"\n",
            );
            fixture.write(
                "sensors.conf",
                "chip \"nct6687-*\"\n label temp1 \"Legacy\"\n",
            );
            fixture.write(
                "sensors.d/50-first",
                "chip \"nct6687-*\"\n label temp1 \"Fifty\"\n label temp2 \"Only Fifty\"\n \
                 ignore fan4\n",
            );
            fixture.write(
                "sensors.d/99-last.conf",
                "chip \"nct6687-*\"\n label temp1 \"Ninety Nine\"\n",
            );
            fixture.write(
                "sensors.d/.hidden",
                "chip \"nct6687-*\"\n label temp1 \"Hidden\"\n",
            );

            let conf = fixture.load().await;

            // The last file parsed wins, and the directory is read after the main file.
            assert_eq!(conf.label(&nct6687(), "temp1"), Some("Ninety Nine"));
            // Extensionless files in the directory count, and hidden ones do not.
            assert_eq!(conf.label(&nct6687(), "temp2"), Some("Only Fifty"));
            assert_eq!(conf.files_read, 3);
            // An ignore names the file it came from, which is the point of reporting one.
            assert_eq!(
                conf.ignore_source(&nct6687(), "fan4")
                    .and_then(|path| path.file_name())
                    .and_then(|name| name.to_str()),
                Some("50-first")
            );
        });
    }

    /// Goal: the legacy file must be read only when the primary one is absent, never both.
    /// Method: the same tree without `sensors3.conf`.
    #[test]
    fn falls_back_to_the_legacy_file_only_when_alone() {
        crate::rt::test_runtime(async {
            let fixture = EtcFixture::new();
            fixture.write(
                "sensors.conf",
                "chip \"nct6687-*\"\n label temp1 \"Legacy\"\n",
            );

            let conf = fixture.load().await;

            assert_eq!(conf.label(&nct6687(), "temp1"), Some("Legacy"));
            assert_eq!(conf.files_read, 1);
        });
    }

    /// Goal: a machine with no lm-sensors configuration must produce nothing at all, since that
    /// is the common case and it must stay free. Method: an empty tree, and a directory holding
    /// something that is not a regular file.
    #[test]
    fn an_absent_configuration_is_empty() {
        crate::rt::test_runtime(async {
            let fixture = EtcFixture::new();
            let conf = fixture.load().await;
            assert!(conf.chip_blocks.is_empty());
            assert_eq!(conf.files_read, 0);
            assert_eq!(conf.label(&nct6687(), "temp1"), None);
            assert!(conf.ignore_source(&nct6687(), "temp1").is_some().not());

            fs::create_dir_all(fixture.root.path().join("sensors.d/a-directory")).unwrap();
            let conf = fixture.load().await;
            assert!(conf.chip_blocks.is_empty());
        });
    }

    /// Goal: the tokenizer must agree with the lexer on the awkward cases, since every parse
    /// result rests on it. Method: drive the statements that exercise each rule.
    #[test]
    fn tokenizes_the_awkward_cases() {
        // A quoted string keeps what looks like a comment, and its escapes.
        let conf = parsed("chip \"nct6687-*\"\n label temp1 \"a#b\\tc\\\"d\"\n");
        assert_eq!(conf.label(&nct6687(), "temp1"), Some("a#b\tc\"d"));

        // A comment may end a statement, with or without a trailing newline.
        let conf = parsed("chip \"nct6687-*\"\n label temp1 \"x\" # done");
        assert_eq!(conf.label(&nct6687(), "temp1"), Some("x"));

        // A file that ends mid-statement still yields that statement.
        let conf = parsed("chip \"nct6687-*\"\n label temp1 \"no newline\"");
        assert_eq!(conf.label(&nct6687(), "temp1"), Some("no newline"));

        // Carriage returns are blanks, so a CRLF file parses the same.
        let conf = parsed("chip \"nct6687-*\"\r\n label temp1 \"crlf\"\r\n");
        assert_eq!(conf.label(&nct6687(), "crlf"), None);
        assert_eq!(conf.label(&nct6687(), "temp1"), Some("crlf"));

        // An empty file is not an error.
        assert!(parsed("").chip_blocks.is_empty());
        assert!(parsed("\n\n# only a comment\n").chip_blocks.is_empty());
    }
}
