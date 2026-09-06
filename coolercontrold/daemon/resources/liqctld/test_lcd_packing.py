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

# liquidctl's implementations, captured before any test installs a replacement.
# `_prepare_static_file_rgb16` arrived with Kraken 2023 firmware 2.x support and is
# missing from older liquidctl, such as the one Debian bookworm ships. Read it the way
# `main.patch_kraken_lcd_packing` does, so an old liquidctl skips the comparison
# against it rather than failing the whole module at import.
ORIGINAL_PACKING = KrakenZ3._prepare_static_file
ORIGINAL_PACKING_RGB16 = getattr(KrakenZ3, "_prepare_static_file_rgb16", None)
HAS_LIQUIDCTL_RGB16 = ORIGINAL_PACKING_RGB16 is not None
NO_RGB16_REASON = "liquidctl has no KrakenZ3._prepare_static_file_rgb16"

# liquidctl's own packing changed after the 1.11 Debian bookworm ships: it now honors
# `lcd_resolution` and converts to RGB before indexing pixels. The C path reproduces the
# current implementation, so against an older liquidctl the guard declines to install and
# the stock path stays in use. That is a supported outcome, not a defect, so the
# byte-for-byte comparisons only run where the two are meant to agree. Detected by asking
# the same guard the daemon uses, rather than pinning a version number here.
LIQUIDCTL_MATCHES_C_PATH = main._packing_matches(
    ORIGINAL_PACKING, main._packed_static_file
)
STOCK_PACKING_REASON = "liquidctl's own packing predates the C replacement"


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
    @unittest.skipUnless(LIQUIDCTL_MATCHES_C_PATH, STOCK_PACKING_REASON)
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

    @unittest.skipUnless(LIQUIDCTL_MATCHES_C_PATH, STOCK_PACKING_REASON)
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

    @unittest.skipUnless(HAS_LIQUIDCTL_RGB16, NO_RGB16_REASON)
    def test_rgb16_matches_liquidctl_byte_for_byte(self):
        """Goal: the Kraken 2023 firmware 2.x path packs RGB565 rather than RGBX, and it has
        no device here to catch a mistake, so it must be indistinguishable from liquidctl's
        loop. Method: pack the same image both ways at every rotation and resolution."""
        for size in (240, 320, 640):
            for rotation in (0, 1, 2, 3):
                screen = _Screen(size)
                source = encoded_image(size)
                source.seek(0)
                expected = bytes(ORIGINAL_PACKING_RGB16(screen, source, rotation))
                source.seek(0)
                actual = bytes(main._packed_static_file_rgb16(screen, source, rotation))
                self.assertEqual(
                    actual,
                    expected,
                    f"rgb16 packing differs at {size}x{size} rotation {rotation * 90}deg",
                )

    def test_rgb16_packs_saturated_colors_into_the_right_bits(self):
        """Goal: pin the bit layout against hand-computed bytes, not only against a copy of
        the same loop, which could share a bug. Method: pack pure red, green, blue and white
        and compare with RGB565 worked out by hand, high byte first."""
        screen = _Screen(2)
        image = Image.new("RGB", (2, 2))
        pixels = image.load()
        pixels[0, 0] = (255, 0, 0)
        pixels[1, 0] = (0, 255, 0)
        pixels[0, 1] = (0, 0, 255)
        pixels[1, 1] = (255, 255, 255)
        source = io.BytesIO()
        image.save(source, format="PNG")

        packed = main._packed_static_file_rgb16(screen, source, 0)

        self.assertEqual(
            bytes(packed), bytes([0xF8, 0x00, 0x07, 0xE0, 0x00, 0x1F, 0xFF, 0xFF])
        )

    def test_rgb16_output_is_two_bytes_per_pixel(self):
        """Goal: RGB565 is half the size of the RGBX buffer, which is what the device expects
        and what the transfer is sized from. Method: check the length."""
        screen = _Screen(240)
        packed = main._packed_static_file_rgb16(screen, encoded_image(240), 0)
        self.assertEqual(len(packed), 240 * 240 * 2)

    @unittest.skipUnless(LIQUIDCTL_MATCHES_C_PATH, STOCK_PACKING_REASON)
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
        """Goal: where liquidctl's packing is the one the C path reproduces, patching must
        replace the method and stay correct if applied twice, since the service may run the
        patch path again. Where it is not, the guard must leave liquidctl's own loop in
        place rather than risk wrong bytes on a screen. Method: patch, check what actually
        landed, patch again, then restore. The end state is asserted rather than the return
        value, which the caller discards."""
        landed = (
            main._packed_static_file if LIQUIDCTL_MATCHES_C_PATH else ORIGINAL_PACKING
        )
        try:
            main.patch_kraken_lcd_packing()
            self.assertIs(KrakenZ3._prepare_static_file, landed)
            if HAS_LIQUIDCTL_RGB16 and LIQUIDCTL_MATCHES_C_PATH:
                self.assertIs(
                    KrakenZ3._prepare_static_file_rgb16, main._packed_static_file_rgb16
                )
            main.patch_kraken_lcd_packing()
            self.assertIs(KrakenZ3._prepare_static_file, landed)
        finally:
            KrakenZ3._prepare_static_file = ORIGINAL_PACKING
            # Only restore what was there: assigning None would leave a bogus attribute
            # on a liquidctl that never had one.
            if HAS_LIQUIDCTL_RGB16:
                KrakenZ3._prepare_static_file_rgb16 = ORIGINAL_PACKING_RGB16


if __name__ == "__main__":
    unittest.main()
