# SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
# SPDX-License-Identifier: GPL-3.0-or-later

"""Tests for the Kraken LCD whole-frame transfer and two-bucket rotation.

These drive the replacements against a stub that records every call, so
no device, no USB and no liquidctl driver instance is involved. What is
asserted is the call sequence: how many bucket queries are issued, how
many bulk writes carry the frame, which bucket is targeted, and when the
replacement steps aside for liquidctl's own path.

Run from anywhere; the test inserts its own directory into `sys.path`
so `import main` works regardless of CWD. Three invocations all work:

    # from this directory:
    python3 -m unittest test_lcd_transfer

    # from anywhere via the script entry point:
    python3 coolercontrold/daemon/resources/liqctld/test_lcd_transfer.py

    # from anywhere via unittest discover:
    python3 -m unittest discover -s coolercontrold/daemon/resources/liqctld
"""

import os
import sys
import unittest
from unittest import mock

# `main.py` lives next to this test; make it importable regardless of
# the working directory the test was launched from.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import main  # noqa: E402

BUCKET_QUERY = 0x30
FRAME = bytes(range(256)) * 1600  # 409,600 bytes, one 320x320 frame
BULK_INFO = [0x02, 0x0, 0x0, 0x0, 0x00, 0x40, 0x06, 0x00]


def bucket_response(occupied, offset=0x0140, slots=401):
    """A bucket query reply shaped like the device's: offset at 17:19, size at 19:21."""
    reply = bytearray(64)
    if occupied:
        reply[15] = 1
        reply[16] = 2
        reply[17], reply[18] = offset & 0xFF, offset >> 8
        reply[19], reply[20] = slots & 0xFF, slots >> 8
    return reply


class FakeKraken:
    """Records the calls the transfer path makes, and answers bucket queries."""

    def __init__(self, buckets):
        self.buckets = buckets  # index -> bucket_response(...)
        self.calls = []
        self.bulk_writes = []

    def initialize(self):
        self.calls.append(("initialize",))

    def _write_then_read(self, data):
        data = list(data)
        self.calls.append(("write_then_read", data))
        if data[0] == BUCKET_QUERY and data[1] == 0x04:
            return self.buckets[data[2]]
        return bytearray(64)

    def _write(self, data):
        self.calls.append(("write", list(data)))

    def _delete_bucket(self, index):
        self.calls.append(("delete_bucket", index))
        return True

    def _setup_bucket(self, start_index, end_index, memory_start, memory_size):
        self.calls.append(
            (
                "setup_bucket",
                start_index,
                end_index,
                list(memory_start),
                list(memory_size),
            )
        )
        return True

    def _bulk_write(self, data):
        self.bulk_writes.append(bytes(data))

    def _switch_bucket(self, index, *args):
        self.calls.append(("switch_bucket", index))
        return True

    def bucket_queries(self):
        return [
            c
            for c in self.calls
            if c[0] == "write_then_read" and c[1][0:2] == [0x30, 0x04]
        ]


class TestWholeFrameTransfer(unittest.TestCase):
    def test_frame_is_written_in_a_single_bulk_transfer(self):
        """Goal: the frame must leave in one transfer rather than 800 chunks of 512 bytes,
        which is the whole point of the change. Method: run one update against a device
        whose spare bucket is already allocated, and check the bulk writes."""
        device = FakeKraken({0: bucket_response(True), 1: bucket_response(True)})
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0

        main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        header, frame = device.bulk_writes
        self.assertEqual(
            len(device.bulk_writes), 2, "expected one header and one frame write"
        )
        self.assertEqual(frame, FRAME)
        self.assertEqual(header[:12], bytes(main._LCD_BULK_HEADER))

    def test_only_the_spare_bucket_is_queried(self):
        """Goal: the point of pinning two buckets is to stop rescanning all 16 every frame.
        Method: count the bucket queries and check which index was asked for."""
        device = FakeKraken({0: bucket_response(True), 1: bucket_response(True)})
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0

        main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        queries = device.bucket_queries()
        self.assertEqual(len(queries), 1, "expected exactly one bucket query")
        self.assertEqual(queries[0][1][2], 1, "expected the spare bucket to be queried")

    def test_the_bucket_on_screen_is_never_overwritten(self):
        """Goal: writing into the bucket currently displayed tears the image, which is why
        the rotation exists. Method: run updates from each active bucket and check the
        target of the delete, the setup and the switch."""
        for active, spare in ((0, 1), (1, 0)):
            device = FakeKraken({0: bucket_response(True), 1: bucket_response(True)})
            device._cc_bucket_pair = (0, 1)
            device._cc_active_bucket = active

            main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

            self.assertIn(("delete_bucket", spare), device.calls)
            self.assertIn(("switch_bucket", spare), device.calls)
            setup = [c for c in device.calls if c[0] == "setup_bucket"][0]
            self.assertEqual(setup[1], spare)

    def test_memory_offset_comes_from_the_device(self):
        """Goal: the allocation is reused as the device reports it, so no offset arithmetic
        is invented here. Method: answer the query with a known offset and size, then check
        what was passed to setup."""
        device = FakeKraken(
            {
                0: bucket_response(True),
                1: bucket_response(True, offset=0x0320, slots=401),
            }
        )
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0

        main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        setup = [c for c in device.calls if c[0] == "setup_bucket"][0]
        self.assertEqual(
            setup[3], [0x20, 0x03], "offset bytes must be the device's own"
        )
        self.assertEqual(
            setup[4], [401 & 0xFF, 401 >> 8], "size is the slots the frame needs"
        )


class TestBucketPairIsLearned(unittest.TestCase):
    """The pair comes from whatever liquidctl allocated, never from an assumption."""

    def test_rotation_works_on_buckets_other_than_zero_and_one(self):
        """Goal: a device whose low buckets are already in use, or a gif that sent the
        allocator elsewhere, must still get the rotation. Method: rotate a pair of high
        buckets and check the target."""
        device = FakeKraken({5: bucket_response(True), 6: bucket_response(True)})
        device._cc_bucket_pair = (5, 6)
        device._cc_active_bucket = 6

        main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(device.bucket_queries()[0][1][2], 5)
        self.assertIn(("switch_bucket", 5), device.calls)

    def test_switching_learns_the_two_most_recent_buckets(self):
        """Goal: after a fallback lands on a new bucket, the rotation must re-form around
        it instead of switching off for good. Method: feed a sequence of switches."""

        class Device:
            pass

        device = Device()
        with mock.patch.object(main, "_ORIGINAL_SWITCH_BUCKET", return_value=True):
            for bucket in (0, 1, 0, 1, 7):
                main._switch_bucket_tracking_active(device, bucket)

        self.assertEqual(device._cc_bucket_pair, (1, 7))
        self.assertEqual(device._cc_active_bucket, 7)

    def test_a_stale_active_bucket_delegates(self):
        """Goal: if something else moved the display to a bucket outside our pair, we must
        not compute a target from it. Method: set an active bucket the pair does not hold.
        """
        with mock.patch.object(
            main, "_ORIGINAL_SEND_DATA", return_value="delegated"
        ) as original:
            device = FakeKraken({0: bucket_response(True), 1: bucket_response(True)})
            device._cc_bucket_pair = (0, 1)
            device._cc_active_bucket = 9

            result = main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

            self.assertEqual(result, "delegated")
            original.assert_called_once()


class TestFallsBackToLiquidctl(unittest.TestCase):
    def setUp(self):
        self.original = mock.Mock(return_value="delegated")
        patcher = mock.patch.object(main, "_ORIGINAL_SEND_DATA", self.original)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_first_frame_delegates(self):
        """Goal: before we have put anything on screen we do not know the layout, so
        liquidctl must allocate. Method: run with no recorded active bucket."""
        device = FakeKraken({0: bucket_response(False), 1: bucket_response(False)})

        result = main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(result, "delegated")
        self.assertEqual(
            device.bulk_writes, [], "nothing should have been written directly"
        )

    def test_unallocated_spare_bucket_delegates(self):
        """Goal: the second frame targets a bucket that has never held data, so liquidctl
        must allocate it. Method: answer the query as unoccupied."""
        device = FakeKraken({0: bucket_response(True), 1: bucket_response(False)})
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0

        result = main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(result, "delegated")
        self.assertEqual(device.bulk_writes, [])

    def test_a_frame_that_outgrew_its_bucket_delegates(self):
        """Goal: a larger image than the bucket was sized for must not be squeezed into it.
        Method: report a bucket far too small for the frame."""
        device = FakeKraken(
            {0: bucket_response(True), 1: bucket_response(True, slots=4)}
        )
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0

        result = main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(result, "delegated")
        self.assertEqual(device.bulk_writes, [])


class TestFallbackClearsArtifacts(unittest.TestCase):
    """The fallback can rewrite the displayed bucket, so it keeps the artifact clearing."""

    def test_fallback_initializes_first(self):
        """Goal: liquidctl's upload eventually rewrites the bucket on screen, which is what
        produced image artifacts, so the fallback must re-initialize as CoolerControl used
        to. Method: take the fallback and check initialize ran before the upload."""
        order = []
        device = FakeKraken({0: bucket_response(True), 1: bucket_response(False)})
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0
        device.initialize = lambda: order.append("initialize")

        with mock.patch.object(
            main, "_ORIGINAL_SEND_DATA", side_effect=lambda *a: order.append("upload")
        ):
            main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(order, ["initialize", "upload"])

    def test_fast_path_does_not_initialize(self):
        """Goal: the rotation never touches the displayed bucket, so paying ~800 ms to
        re-initialize on every frame is exactly what this removes. Method: run the fast
        path with an initialize that would record itself."""
        called = []
        device = FakeKraken({0: bucket_response(True), 1: bucket_response(True)})
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0
        device.initialize = lambda: called.append("initialize")

        main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(called, [])

    def test_a_failed_initialize_still_uploads(self):
        """Goal: a possible artifact beats a blank screen, so a failing initialize must not
        abort the frame. Method: raise from initialize and check the upload still ran.
        """
        device = FakeKraken({0: bucket_response(True), 1: bucket_response(False)})
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0

        def boom():
            raise RuntimeError("device busy")

        device.initialize = boom
        with mock.patch.object(
            main, "_ORIGINAL_SEND_DATA", return_value="delegated"
        ) as upload:
            result = main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(result, "delegated")
        upload.assert_called_once()


class TestSupportingPatches(unittest.TestCase):
    def test_switch_bucket_records_what_is_on_screen(self):
        """Goal: the rotation depends on knowing the displayed bucket, and a failed switch
        must not be recorded as displayed. Method: drive both outcomes."""

        class Device:
            pass

        for switched, expected in ((True, 1), (False, None)):
            device = Device()
            with mock.patch.object(
                main, "_ORIGINAL_SWITCH_BUCKET", return_value=switched
            ):
                main._switch_bucket_tracking_active(device, 1)
            self.assertEqual(getattr(device, "_cc_active_bucket", None), expected)

    def test_connect_raises_the_transfer_cap(self):
        """Goal: the 512 byte cap is what splits a frame into 800 transfers, and a model
        that already uses a larger one must not be lowered. Method: connect with each.
        """

        class Device:
            def __init__(self, size):
                self.bulk_buffer_size = size

        with mock.patch.object(main, "_ORIGINAL_KRAKENZ3_CONNECT", return_value=None):
            small = Device(512)
            main._connect_with_whole_frame_transfers(small)
            self.assertEqual(small.bulk_buffer_size, main._LCD_BULK_TRANSFER_BYTES)

            large = Device(main._LCD_BULK_TRANSFER_BYTES * 2)
            main._connect_with_whole_frame_transfers(large)
            self.assertEqual(large.bulk_buffer_size, main._LCD_BULK_TRANSFER_BYTES * 2)


if __name__ == "__main__":
    unittest.main()
