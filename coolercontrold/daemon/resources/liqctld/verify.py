#! /usr/bin/env python3

# SPDX-FileCopyrightText: 2025 Guy Boldon, Eren Simsek and contributors
# SPDX-License-Identifier: GPL-3.0-or-later

import importlib.metadata
import importlib.util
import logging as log
import sys


def get_liquidctl_version() -> str:
    """
    Return the liquidctl version.
    This should be called after checking for the liquidctl package.
    """
    try:
        return importlib.metadata.version("liquidctl")
    except importlib.metadata.PackageNotFoundError:
        try:
            import liquidctl

            return getattr(liquidctl, "__version__", "unknown")
        except (AttributeError, ImportError) as e:
            log.info("liquidctl system Python package not found.")
            log.debug(f"liquidctl search error: {e}")
            exit(1)


def main():
    """
    This script verifies that the necessary Python dependencies are installed.
    """
    root_logger = log.getLogger("root")
    root_logger.setLevel(log.INFO)
    formatter = log.Formatter("%(levelname)s%(message)s")
    console_handler = log.StreamHandler()
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    log.info(f"Python Version detected: {sys.version}")
    importlib.util.find_spec("liquidctl")

    liquidctl_version = get_liquidctl_version()
    log.info(f"liquidctl version detected: {liquidctl_version}")


if __name__ == "__main__":
    main()
