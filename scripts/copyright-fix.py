#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Guy Boldon and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
#
# This file writes SPDX tags, so its own body contains tag literals that are not
# licensing declarations. REUSE-IgnoreStart keeps the linter from reading them.
#
# REUSE-IgnoreStart
"""Add missing SPDX headers to source files.

Run after `reuse lint` fails in CI:  make copyright-fix

Derives the copyright year from the file's first commit (following renames), so
a year is stated once and never maintained by hand. Files already carrying an
SPDX-License-Identifier are left alone, which makes this safe to re-run.

Non-source files (docs, configs, binary assets) are covered by REUSE.toml
instead and are never touched here.
"""
import shutil
import subprocess  # nosec B404
import sys
from datetime import date
from pathlib import Path

__VERSION__ = "0.3.0"

LICENSE = "GPL-3.0-or-later"

# Absolute path so the calls below cannot resolve through a mutated PATH.
GIT = shutil.which("git")

# extension -> comment style
STYLES = {
    "rs": "slash",
    "ts": "slash",
    "mts": "slash",
    "js": "slash",
    "mjs": "slash",
    "cpp": "slash",
    "h": "slash",
    "hpp": "slash",
    "proto": "slash",
    "css": "block",
    "vue": "xml",
    "html": "xml",
    "svg": "xml",
    # .xml is deliberately absent: the only one is the AppStream metainfo, which
    # states its own licensing in <metadata_license> and is annotated in
    # REUSE.toml. Injecting a comment there would be a third copy of one fact.
    "py": "hash",
    "sh": "hash",
}


def holder(path: str) -> str:
    if path.startswith("coolercontrold/cc-detect/"):
        return "Guy Boldon, megadjc and contributors"
    if path.startswith(("coolercontrold/", "coolercontrol-ui/")):
        return "Guy Boldon, Eren Simsek and contributors"
    return "Guy Boldon and contributors"


def first_year(path: str) -> str:
    # Fixed argument list, no shell; `path` is separated by `--` so it cannot be
    # read as a flag.
    out = subprocess.run(  # nosec B603
        [
            GIT,
            "log",
            "--follow",
            "--diff-filter=A",
            "--format=%ad",
            "--date=format:%Y",
            "--",
            path,
        ],
        capture_output=True,
        text=True,
        check=False,
    ).stdout.split()
    return out[-1] if out else str(date.today().year)


def header(style: str, year: str, who: str) -> list[str]:
    tags = [
        f"SPDX-FileCopyrightText: {year} {who}",
        f"SPDX-License-Identifier: {LICENSE}",
    ]
    if style == "slash":
        return [f"// {t}" for t in tags]
    if style == "hash":
        return [f"# {t}" for t in tags]
    if style == "block":
        return [f"/* {t} */" for t in tags]
    return ["<!--", *[f"  {t}" for t in tags], "-->"]


def insert_at(lines: list[str]) -> int:
    """First line index after any shebang or XML prolog."""
    i = 0
    while i < len(lines) and (
        lines[i].startswith("#!") or lines[i].lstrip().startswith("<?xml")
    ):
        i += 1
    return i


def tracked_files() -> list[str]:
    # Fixed argument list, no shell, no caller input.
    return subprocess.run(  # nosec B603
        [GIT, "ls-files"], capture_output=True, text=True, check=False
    ).stdout.splitlines()


def main() -> int:
    if GIT is None:
        print("git not found on PATH", file=sys.stderr)
        return 1
    if "--version" in sys.argv:
        print(__VERSION__)
        return 0
    check = "--check" in sys.argv
    missing = []
    for path in tracked_files():
        ext = path.rsplit(".", 1)[-1] if "." in Path(path).name else ""
        style = STYLES.get(ext)
        if style is None:
            continue
        text = Path(path).read_text(encoding="utf-8", errors="replace")
        if "SPDX-License-Identifier" in text:
            continue
        missing.append(path)
        if check:
            continue
        lines = text.split("\n")
        at = insert_at(lines)
        block = header(style, first_year(path), holder(path))
        if at < len(lines) and lines[at].strip() != "":
            block.append("")
        lines[at:at] = block
        Path(path).write_text("\n".join(lines), encoding="utf-8")
    if check:
        for m in missing:
            print(f"missing SPDX header: {m}", file=sys.stderr)
        print(f"{len(missing)} file(s) missing headers", file=sys.stderr)
        return 1 if missing else 0
    print(f"added headers to {len(missing)} file(s)")
    return 0


sys.exit(main())
# REUSE-IgnoreEnd
