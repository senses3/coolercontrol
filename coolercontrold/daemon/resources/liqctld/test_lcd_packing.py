# SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
# SPDX-License-Identifier: GPL-3.0-or-later

"""Tests for the Kraken LCD framebuffer packing replacement.

These compare `_packed_static_file` against liquidctl's own
`KrakenZ3._prepare_static_file` byte for byte. No device, no HTTP layer
and no bulk transfer is involved: both are called directly with an
in-memory image.

Run from anywhere; the test inserts its own directory into `sys.path`
so `import main` works regardless of CWD. Three invocations all work:

    # from this directory:
    python3 -m unittest test_lcd_packing

    # from anywhere via the script entry point:
    python3 coolercontrold/daemon/resources/liqctld/test_lcd_packing.py

    # from anywhere via unittest discover:
    python3 -m unittest discover -s coolercontrold/daemon/resources/liqctld
"""

import io
import os
import sys
import unittest

# `main.py` lives next to this test; make it importable regardless of
# the working directory the test was launched from.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import main  # noqa: E402
from liquidctl.driver.kraken3 import KrakenZ3  # noqa: E402
from PIL import Image  # noqa: E402

# liquidctl's implementation, captured before any test installs the replacement.
ORIGINAL_PACKING = KrakenZ3._prepare_static_file


class _Screen:
    """Stands in for a driver instance: packing only reads `lcd_resolution`."""

    def __init__(self, size):
        self.lcd_resolution = (size, size)


def encoded_image(size, mode="RGB"):
    """A PNG whose three channels all differ, so a swapped channel is visible."""
    image = Image.new(mode, (size, size))
    pixels = image.load()
    for y in range(size):
        for x in range(size):
            pixels[x, y] = (x * 3 % 256, y * 7 % 256, (x + y) * 11 % 256)[
                : len(image.getbands())
            ]
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer


class TestLcdPacking(unittest.TestCase):
    def test_matches_liquidctl_byte_for_byte(self):
        """Goal: the replacement must be indistinguishable from liquidctl's loop, at
        every rotation and at the resolutions liquidctl supports. Method: pack the same
        image both ways and compare the bytes, not just the length."""
        for size in (240, 320, 640):
            for rotation in (0, 1, 2, 3):
                screen = _Screen(size)
                source = encoded_image(size)
                source.seek(0)
                expected = bytes(ORIGINAL_PACKING(screen, source, rotation))
                source.seek(0)
                actual = bytes(main._packed_static_file(screen, source, rotation))
                self.assertEqual(
                    actual,
                    expected,
                    f"packing differs at {size}x{size} rotation {rotation * 90}deg",
                )

    def test_output_shape_is_four_bytes_per_pixel(self):
        """Goal: the framebuffer must stay 4 bytes per pixel with a zero pad, which is
        what the device expects and what `_send_data` sizes its transfer from. Method:
        check the length and that every fourth byte is zero."""
        screen = _Screen(320)
        packed = main._packed_static_file(screen, encoded_image(320), 0)
        self.assertEqual(len(packed), 320 * 320 * 4)
        self.assertEqual(set(packed[3::4]), {0})

    def test_greyscale_and_rgba_sources_still_match(self):
        """Goal: users pick arbitrary images, so a source that is not already RGB must
        convert the same way in both implementations. Method: pack greyscale and RGBA
        sources both ways and compare."""
        for mode in ("L", "RGBA", "P"):
            screen = _Screen(64)
            source = encoded_image(64, mode="RGB" if mode == "P" else mode)
            if mode == "P":
                image = Image.open(source).convert("P")
                source = io.BytesIO()
                image.save(source, format="PNG")
            source.seek(0)
            expected = bytes(ORIGINAL_PACKING(screen, source, 0))
            source.seek(0)
            actual = bytes(main._packed_static_file(screen, source, 0))
            self.assertEqual(actual, expected, f"packing differs for a {mode} source")

    def test_verification_accepts_the_replacement(self):
        """Goal: the guard that runs before patching must accept the real replacement,
        otherwise the patch silently never installs. Method: run the guard."""
        self.assertTrue(
            main._packing_matches(ORIGINAL_PACKING, main._packed_static_file)
        )

    def test_verification_rejects_wrong_bytes(self):
        """Goal: the guard is only worth having if it actually catches a mismatch, which
        is what keeps a bad Pillow build from putting garbage on the screen. Method: feed
        it candidates that are wrong in each way that matters."""

        def wrong_padding(screen, path, rotation):
            packed = main._packed_static_file(screen, path, rotation)
            packed[3::4] = b"\xff" * (len(packed) // 4)
            return packed

        def swapped_channels(screen, path, rotation):
            packed = main._packed_static_file(screen, path, rotation)
            packed[0::4], packed[2::4] = packed[2::4], packed[0::4]
            return packed

        def ignores_rotation(screen, path, rotation):
            return main._packed_static_file(screen, path, 0)

        def raises(screen, path, rotation):
            raise RuntimeError("unsupported raw mode")

        for candidate in (wrong_padding, swapped_channels, ignores_rotation, raises):
            self.assertFalse(
                main._packing_matches(ORIGINAL_PACKING, candidate),
                f"{candidate.__name__} should have been rejected",
            )

    def test_patch_installs_and_is_idempotent(self):
        """Goal: patching must replace the method and stay correct if applied twice (the
        service may restart the patch path). Method: patch, check the bound method, patch
        again, then restore so later tests see liquidctl's original."""
        try:
            self.assertTrue(main.patch_kraken_lcd_packing())
            self.assertIs(KrakenZ3._prepare_static_file, main._packed_static_file)
            self.assertTrue(main.patch_kraken_lcd_packing())
            self.assertIs(KrakenZ3._prepare_static_file, main._packed_static_file)
        finally:
            KrakenZ3._prepare_static_file = ORIGINAL_PACKING


if __name__ == "__main__":
    unittest.main()
