# SPDX-FileCopyrightText: 2026 Guy Boldon, Eren Simsek and contributors
# SPDX-License-Identifier: GPL-3.0-or-later

"""Tests for the Kraken LCD whole-frame transfer, two-bucket rotation and fw2 path.

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


def bucket_response(occupied, offset=0x0140, slots=401, prefix=(0x31, 0x04)):
    """A bucket query reply shaped like the device's: offset at 17:19, size at 19:21."""
    reply = bytearray(64)
    reply[0], reply[1] = prefix
    if occupied:
        reply[15] = 1
        reply[16] = 2
        reply[17], reply[18] = offset & 0xFF, offset >> 8
        reply[19], reply[20] = slots & 0xFF, slots >> 8
    return reply


class _FakeHid:
    """Stands in for the HID handle, which the transfer path drains before it reads."""

    def __init__(self, calls):
        self._calls = calls

    def clear_enqueued_reports(self):
        self._calls.append(("clear_enqueued_reports",))


class FakeKraken:
    """Records the calls the transfer path makes, and answers bucket queries."""

    def __init__(self, buckets, delete_results=(), setup_result=True):
        self.buckets = buckets  # index -> bucket_response(...)
        self.calls = []
        self.bulk_writes = []
        self.device = _FakeHid(self.calls)
        # Consumed in order; a shorter list than there are deletes reports success after it.
        self.delete_results = list(delete_results)
        self.setup_result = setup_result

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
        return self.delete_results.pop(0) if self.delete_results else True

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
        return self.setup_result

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


class TestTheBucketIsFreedBeforeItIsReused(unittest.TestCase):
    """Reusing an allocation still means freeing it first, and the device answers every step.
    One delete is what this device answers, so an incomplete free shows up as a failed setup
    rather than as a second delete; a refusal means the bucket cannot be reused at all.
    """

    def setUp(self):
        self.original = mock.Mock(return_value="delegated")
        patcher = mock.patch.object(main, "_ORIGINAL_SEND_DATA", self.original)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _rotating(self, **kwargs):
        device = FakeKraken(
            {0: bucket_response(True), 1: bucket_response(True)}, **kwargs
        )
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0
        return device

    def test_the_bucket_is_deleted_once(self):
        """Goal: liquidctl deletes a filled bucket twice, but only where it reuses one with
        all 16 occupied, and this rotation runs on hardware with a single delete. A second
        one costs a round trip per frame and asserts if the device does not answer it.
        Method: run a frame and count the deletes."""
        device = self._rotating()

        main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        deletes = [c for c in device.calls if c[0] == "delete_bucket"]
        self.assertEqual(deletes, [("delete_bucket", 1)])
        self.assertEqual(len(device.bulk_writes), 2, "the frame must still go out")

    def test_a_refused_delete_delegates_without_retrying_it(self):
        """Goal: a refusal (0x9) means the bucket is in use, which liquidctl answers by
        allocating elsewhere. Method: refuse the first delete."""
        device = self._rotating(delete_results=[False])

        result = main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(result, "delegated")
        self.assertEqual(len([c for c in device.calls if c[0] == "delete_bucket"]), 1)
        self.assertNotIn("setup_bucket", [c[0] for c in device.calls])
        self.assertEqual(device.bulk_writes, [])

    def test_a_failed_setup_never_writes_or_switches(self):
        """Goal: this is what catches a free that did not complete, which is why the second
        delete liquidctl issues is not needed here: the allocation was never re-established,
        so writing into it and then displaying it puts a torn frame on screen. Method: fail
        the setup and check nothing was written or switched to."""
        device = self._rotating(setup_result=False)

        with self.assertLogs(level="DEBUG") as captured:
            result = main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(result, "delegated")
        self.assertEqual(device.bulk_writes, [])
        self.assertNotIn("switch_bucket", [c[0] for c in device.calls])
        self.assertEqual(
            device._cc_active_bucket, 0, "the screen still shows the other bucket"
        )
        reasons = [m for m in captured.output if "setup refused" in m]
        self.assertEqual(len(reasons), 1, captured.output)


class TestTransferSizeIsRespected(unittest.TestCase):
    """The raised cap is what turns 800 transfers into one, and it is raised for the single
    model liquidctl capped at 512 bytes. A transfer that cannot be resumed has to be able to
    give that back."""

    def _rotating(self, bulk_size):
        device = FakeKraken({0: bucket_response(True), 1: bucket_response(True)})
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0
        device.bulk_buffer_size = bulk_size
        return device

    def test_the_frame_is_chunked_at_the_connections_transfer_size(self):
        """Goal: the cap has to bound the write, or lowering it back would change nothing.
        Method: rotate a frame on a device left at liquidctl's 512 bytes."""
        device = self._rotating(512)

        main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        header, *chunks = device.bulk_writes
        self.assertEqual(header[:12], bytes(main._LCD_BULK_HEADER))
        self.assertEqual(len(chunks), len(FRAME) // 512)
        self.assertEqual(b"".join(chunks), FRAME)

    def test_the_frame_is_handed_over_whole_without_a_copy(self):
        """Goal: slicing the frame to chunk it copies all 400 KB of it, every frame, on the
        path this branch exists to speed up. Method: capture what the write was given and
        check it is the frame itself."""
        device = self._rotating(main._LCD_BULK_TRANSFER_BYTES)
        written = []
        device._bulk_write = written.append

        main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertIs(written[1], FRAME, "the frame must not be sliced when it fits")

    def test_a_timed_out_transfer_returns_to_liquidctls_size(self):
        """Goal: a bulk write that stops part way cannot be resumed, so the retry is the
        next frame and it must not repeat a size the device just timed out at. Method: time
        the frame write out and check the cap and the state left behind."""
        device = self._rotating(main._LCD_BULK_TRANSFER_BYTES)
        device._cc_stock_bulk_size = 512
        device._bulk_write = mock.Mock(side_effect=main.Timeout())

        with self.assertLogs(level="WARNING") as captured:
            with self.assertRaises(main.Timeout):
                main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(device.bulk_buffer_size, 512)
        self.assertNotIn("switch_bucket", [c[0] for c in device.calls])
        self.assertEqual(
            device._cc_active_bucket, 0, "the next frame retries the same spare bucket"
        )
        self.assertTrue(
            [m for m in captured.output if "liquidctl's 512 byte transfers" in m],
            captured.output,
        )

    def test_a_failure_that_is_not_a_timeout_leaves_the_size_alone(self):
        """Goal: a disconnect says nothing about how much the device can take in one write,
        and slowing every later frame for it would be a permanent cost. Method: fail the
        write with the error a vanished device raises."""
        device = self._rotating(main._LCD_BULK_TRANSFER_BYTES)
        device._cc_stock_bulk_size = 512
        device._bulk_write = mock.Mock(side_effect=OSError("no such device"))

        with self.assertRaises(OSError):
            main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(device.bulk_buffer_size, main._LCD_BULK_TRANSFER_BYTES)

    def test_a_device_that_was_never_raised_keeps_its_size(self):
        """Goal: every model but one already uses 2 MB, and a timeout there says nothing
        about the transfer size. Method: time out on a device with no stock size recorded.
        """
        device = self._rotating(main._LCD_BULK_TRANSFER_BYTES)
        device._bulk_write = mock.Mock(side_effect=main.Timeout())

        with self.assertRaises(main.Timeout):
            main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(device.bulk_buffer_size, main._LCD_BULK_TRANSFER_BYTES)


class TestSurvivesReportDesync(unittest.TestCase):
    """liquidctl reads the next report as if it answered the last command, so a stale one
    desyncs everything after it. These pin the guards against that."""

    def test_queued_reports_are_drained_before_reading(self):
        """Goal: a report left over from an earlier command, or one the device sent on its
        own, would be returned as the bucket's reply. Method: check the drain happens, and
        happens before the query."""
        device = FakeKraken({0: bucket_response(True), 1: bucket_response(True)})
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0

        main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        names = [c[0] for c in device.calls]
        self.assertIn("clear_enqueued_reports", names)
        self.assertLess(
            names.index("clear_enqueued_reports"),
            names.index("write_then_read"),
            "the queue must be drained before the first read",
        )

    def test_a_reply_that_is_not_the_bucket_query_delegates(self):
        """Goal: the offsets in an unrelated report are meaningless, and handing one to
        _setup_bucket would place a frame at an arbitrary address. Method: answer the query
        with a report carrying someone else's prefix."""
        wrong = bucket_response(True, prefix=(0x75, 0x02))  # a periodic status report
        device = FakeKraken({0: bucket_response(True), 1: wrong})
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0

        with mock.patch.object(
            main, "_ORIGINAL_SEND_DATA", return_value="delegated"
        ) as upload:
            result = main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(result, "delegated")
        self.assertEqual(
            device.bulk_writes, [], "nothing may be written on a bad reply"
        )
        upload.assert_called_once()
        self.assertNotIn("setup_bucket", [c[0] for c in device.calls])

    def test_the_rotation_advances_even_if_the_switch_reports_failure(self):
        """Goal: the switch's success flag is read from the previous command's reply, so a
        false negative must not strand the rotation on the displayed bucket. Method: make
        the switch report failure and check what the next frame would target."""
        device = FakeKraken({0: bucket_response(True), 1: bucket_response(True)})
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0
        device._switch_bucket = lambda index, *args: (
            device.calls.append(("switch_bucket", index)) or False
        )

        main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(
            device._cc_active_bucket, 1, "the next frame would rewrite the screen"
        )


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

    def test_a_mode_switch_is_not_recorded_as_a_displayed_bucket(self):
        """Goal: `_switch_bucket(0, 2)` selects liquid mode and its bucket index means
        nothing, so learning it would rotate the next frames into a bucket that holds no
        frame. Method: learn a pair, then switch modes positionally and by keyword."""

        class Device:
            pass

        for switch_mode in (
            lambda device: main._switch_bucket_tracking_active(device, 0, 2),
            lambda device: main._switch_bucket_tracking_active(device, 0, mode=2),
        ):
            device = Device()
            with mock.patch.object(main, "_ORIGINAL_SWITCH_BUCKET", return_value=True):
                main._switch_bucket_tracking_active(device, 2)
                main._switch_bucket_tracking_active(device, 3)
                switch_mode(device)

            self.assertEqual(device._cc_bucket_pair, (2, 3))
            self.assertEqual(device._cc_active_bucket, 3)

    def test_an_explicit_display_switch_is_still_recorded(self):
        """Goal: the mode gate must not swallow the switches the rotation depends on.
        Method: pass the display mode explicitly, as liquidctl's default does."""

        class Device:
            pass

        device = Device()
        with mock.patch.object(main, "_ORIGINAL_SWITCH_BUCKET", return_value=True):
            main._switch_bucket_tracking_active(
                device, 5, main._LCD_SWITCH_DISPLAY_MODE
            )

        self.assertEqual(device._cc_active_bucket, 5)

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

    def test_connect_remembers_the_size_it_replaced(self):
        """Goal: a failed transfer has to be able to give the raised cap back, which needs
        the size liquidctl chose for that model. Method: connect with each."""

        class Device:
            def __init__(self, size):
                self.bulk_buffer_size = size

        with mock.patch.object(main, "_ORIGINAL_KRAKENZ3_CONNECT", return_value=None):
            small = Device(512)
            main._connect_with_whole_frame_transfers(small)
            self.assertEqual(small._cc_stock_bulk_size, 512)

            large = Device(main._LCD_BULK_TRANSFER_BYTES)
            main._connect_with_whole_frame_transfers(large)
            self.assertFalse(hasattr(large, "_cc_stock_bulk_size"))


class TestCapabilityGuard(unittest.TestCase):
    """The replacements drive liquidctl's private API, so the guard exists to leave that API
    alone once it moves. A method it forgets to check is one that raises mid-frame instead.
    """

    NAMES = (
        "_send_data",
        "_switch_bucket",
        "_delete_bucket",
        "_setup_bucket",
        "_bulk_write",
        "_write_then_read",
        "_write",
        "set_screen",
        "initialize",
    )

    def _stub_driver(self, missing=None):
        return type(
            "StubKrakenZ3",
            (),
            {
                name: (lambda self, *a, **kw: None)
                for name in self.NAMES
                if name != missing
            },
        )

    def test_a_complete_driver_is_patched(self):
        """Goal: the guard must not be so strict that it turns the patch off on a driver
        that has everything. Method: patch a stub carrying every method."""
        stub = self._stub_driver()

        with mock.patch.object(main, "KrakenZ3", stub):
            installed = main.patch_kraken_lcd_transfer()

        self.assertTrue(installed)
        self.assertIs(stub._send_data, main._send_frame_to_spare_bucket)
        self.assertIs(stub._switch_bucket, main._switch_bucket_tracking_active)

    def test_every_method_the_replacements_call_is_checked(self):
        """Goal: this is the whole point of the guard, and the methods the fallback and the
        drain call are as load-bearing as the transfer's own. Method: remove each in turn
        and check the patch declines."""
        for name in self.NAMES:
            stub = self._stub_driver(missing=name)

            with mock.patch.object(main, "KrakenZ3", stub):
                with self.assertLogs(level="WARNING") as captured:
                    installed = main.patch_kraken_lcd_transfer()

            self.assertFalse(installed, f"a driver without {name} must stay unpatched")
            self.assertIsNot(
                getattr(stub, "_send_data", None), main._send_frame_to_spare_bucket
            )
            self.assertTrue([m for m in captured.output if name in m], captured.output)


class TestEveryFallbackReportsWhy(unittest.TestCase):
    """A fallback costs the full re-initialize, so which gate turned the frame away has to be
    in the log. Warm-up and permanently stuck look identical from the timing alone."""

    def _fallback_reason(self, device):
        with mock.patch.object(main, "_ORIGINAL_SEND_DATA", return_value=None):
            with self.assertLogs(level="DEBUG") as captured:
                main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)
        reasons = [m for m in captured.output if "LCD rotation skipped" in m]
        self.assertEqual(len(reasons), 1, captured.output)
        return reasons[0]

    def test_the_warm_up_frames_report_what_the_rotation_knows(self):
        """Goal: the first frames legitimately fall back, and telling that apart from a stuck
        rotation needs the learned state. Method: run with nothing learned yet."""
        device = FakeKraken({})

        reason = self._fallback_reason(device)

        self.assertIn("pair=()", reason)
        self.assertIn("active=None", reason)

    def test_a_bucket_too_small_for_the_frame_reports_both_sizes(self):
        """Goal: an outgrown bucket is silent otherwise, and looks exactly like a rotation that
        never started. Method: answer the query with a bucket that cannot hold the frame.
        """
        device = FakeKraken(
            {0: bucket_response(True), 1: bucket_response(True, slots=1)}
        )
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0

        reason = self._fallback_reason(device)

        self.assertIn("bucket 1", reason)
        self.assertIn("capacity=1", reason)
        self.assertIn("needs=401", reason)

    def test_an_unexpected_reply_reports_the_prefix_it_saw(self):
        """Goal: the prefix is what says which report arrived instead, so it has to survive into
        the log. Method: answer the query with a periodic status report."""
        device = FakeKraken(
            {0: bucket_response(True), 1: bucket_response(True, prefix=(0x75, 0x02))}
        )
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0

        reason = self._fallback_reason(device)

        self.assertIn("[117, 2]", reason)


class TestScreenEntryDrain(unittest.TestCase):
    """`set_screen` reads the screen's brightness and orientation before it hands the frame to
    the transfer path, so the queue has to be clear by then, not by the time the frame moves.
    """

    def test_the_queue_is_drained_before_liquidctls_set_screen_runs(self):
        """Goal: the read that starves is `set_screen`'s own, so a drain that happens later
        cannot save it. Method: record both and check the order."""
        calls = []
        device = FakeKraken({})
        device.device = _FakeHid(calls)

        def original(self, channel, mode, value, **kwargs):
            calls.append(("set_screen", channel, mode, value))
            return "screen set"

        with mock.patch.object(main, "_ORIGINAL_SET_SCREEN", original):
            result = main._set_screen_with_drained_queue(device, "lcd", "gif", "a.gif")

        self.assertEqual(result, "screen set")
        self.assertEqual(
            [c[0] for c in calls],
            ["clear_enqueued_reports", "set_screen"],
            "the queue must be drained before liquidctl reads the LCD info",
        )

    def test_arguments_reach_liquidctl_unchanged(self):
        """Goal: the wrapper only drains, so every mode and value must pass through as given.
        Method: send a keyword argument along with the positional ones."""
        device = FakeKraken({})
        device.device = _FakeHid([])
        seen = {}

        def original(self, channel, mode, value, **kwargs):
            seen.update(channel=channel, mode=mode, value=value, kwargs=kwargs)

        with mock.patch.object(main, "_ORIGINAL_SET_SCREEN", original):
            main._set_screen_with_drained_queue(
                device, "lcd", "brightness", "50", direct_access=True
            )

        self.assertEqual(
            seen,
            {
                "channel": "lcd",
                "mode": "brightness",
                "value": "50",
                "kwargs": {"direct_access": True},
            },
        )


class TestDeviceProfileLine(unittest.TestCase):
    """An LCD report carries no model, firmware or transfer path today, so triage starts by
    guessing. These pin the one line that answers all of it."""

    def _kraken(self, **overrides):
        device = FakeKraken({0: bucket_response(True), 1: bucket_response(True)})
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0
        device.device.product_id = overrides.get("product_id", 0x3008)
        device._fw = overrides.get("fw", (1, 2, 3))
        device.lcd_resolution = overrides.get("resolution", (320, 320))
        device.bulk_buffer_size = overrides.get("bulk", 2097152)
        return device

    def _profile_lines(self, captured):
        return [m for m in captured.output if "LCD FakeKraken" in m]

    def test_the_profile_reports_the_model_firmware_and_path(self):
        """Goal: every field a maintainer needs before asking the reporter anything. Method:
        drive one frame and read the line."""
        device = self._kraken()

        with self.assertLogs(level="INFO") as captured:
            main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        line = self._profile_lines(captured)[0]
        for expected in (
            "pid=0x3008",
            "fw=1.2.3",
            "res=320x320",
            "bulk=2097152",
            "path=rotation",
            "packing=rgbx",
            f"frame={len(FRAME)}",
        ):
            self.assertIn(expected, line)

    def test_it_is_said_once_per_device_not_once_per_frame(self):
        """Goal: at info this would otherwise be a line on every LCD tick forever. Method:
        send three frames and count."""
        device = self._kraken()

        with self.assertLogs(level="INFO") as captured:
            for _ in range(3):
                main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(len(self._profile_lines(captured)), 1)

    def test_the_geometry_is_reported_even_when_the_rotation_never_engages(self):
        """Goal: a device stuck on the fallback is the one worth diagnosing, so it must not be
        the one that reports nothing. Method: run with the rotation unlearned."""
        device = FakeKraken({})
        device.device.product_id = 0x300C

        with mock.patch.object(main, "_ORIGINAL_SEND_DATA", return_value=None):
            with self.assertLogs(level="INFO") as captured:
                main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        line = self._profile_lines(captured)[0]
        self.assertIn(f"frame={len(FRAME)}", line)
        self.assertIn("slots=401", line)

    def test_the_firmware_2_path_names_itself_and_its_packing(self):
        """Goal: this model takes a different transfer and a different framebuffer layout to
        every other screen, so triage has to be able to tell which one ran. Method: drive that
        transfer and read the path and packing fields."""
        device = self._kraken(product_id=0x300E, fw=(2, 0, 1), resolution=(240, 240))

        with self.assertLogs(level="INFO") as captured:
            main._send_frame_fw2(device, FRAME, BULK_INFO)

        line = self._profile_lines(captured)[0]
        self.assertIn("path=fw2", line)
        self.assertIn("packing=rgb565", line)
        self.assertIn("pid=0x300e", line)

    def test_a_device_missing_every_attribute_still_sends_its_frame(self):
        """Goal: this is a diagnostic, so an unfamiliar driver shape must not be the reason an
        LCD apply fails. Method: strip the attributes it reads."""
        device = FakeKraken({0: bucket_response(True), 1: bucket_response(True)})
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0

        with self.assertLogs(level="INFO") as captured:
            main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        line = self._profile_lines(captured)[0]
        self.assertIn("fw=unknown", line)
        self.assertIn("res=unknown", line)
        self.assertEqual(len(device.bulk_writes), 2, "the frame must still go out")


class TestOutgrownBucketIsReported(unittest.TestCase):
    """A frame that no longer fits its bucket falls back every time it happens, which on a
    640x640 screen full of gifs is most of them. The fallback itself is by design; being
    unable to tell from a log that it is happening is not."""

    def _rotating(self, capacity, occupied=True):
        device = FakeKraken(
            {
                0: bucket_response(True),
                1: bucket_response(occupied, slots=capacity),
            }
        )
        device._cc_bucket_pair = (0, 1)
        device._cc_active_bucket = 0
        return device

    def _size_lines(self, captured):
        return [m for m in captured.output if "outgrowing bucket" in m]

    def test_a_frame_that_outgrew_its_bucket_says_so(self):
        """Goal: this is the one fallback with a cause the reporter can act on, so it has to
        reach a default-level log. Method: answer with a bucket too small for the frame.
        """
        device = self._rotating(capacity=10)

        with mock.patch.object(main, "_ORIGINAL_SEND_DATA", return_value=None):
            with self.assertLogs(level="INFO") as captured:
                main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        line = self._size_lines(captured)[0]
        self.assertIn("bucket 1", line)
        self.assertIn("holds 10", line)

    def test_it_is_said_once_per_device_not_once_per_frame(self):
        """Goal: a carousel of gifs hits this on most frames, so saying it every time would
        be the log spam the once-per-device profile line exists to avoid. Method: three.
        """
        device = self._rotating(capacity=10)

        with mock.patch.object(main, "_ORIGINAL_SEND_DATA", return_value=None):
            with self.assertLogs(level="INFO") as captured:
                for _ in range(3):
                    main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(len(self._size_lines(captured)), 1)

    def test_a_bucket_in_first_use_is_not_reported_as_outgrown(self):
        """Goal: an unoccupied bucket takes the same branch, but it is how a rotation starts
        rather than a condition worth a line. Method: answer with an empty bucket."""
        device = self._rotating(capacity=10, occupied=False)

        with mock.patch.object(main, "_ORIGINAL_SEND_DATA", return_value=None):
            with self.assertLogs(level="DEBUG") as captured:
                main._send_frame_to_spare_bucket(device, FRAME, BULK_INFO)

        self.assertEqual(self._size_lines(captured), [], captured.output)


class TestFirmware2Transfer(unittest.TestCase):
    """The Kraken 2023 on firmware 2.x takes a path of its own: no buckets, and liquidctl
    sends the whole frame twice on every apply. These pin what replaced it."""

    FRAME_FW2 = bytes(range(256)) * 450  # 115,200 bytes, one 240x240 RGB565 frame
    BULK_INFO_FW2 = [0x06, 0x0, 0x0, 0x0] + list((115200).to_bytes(4, "little"))

    def _kraken(self, primed=None):
        device = FakeKraken({})
        device.device.product_id = 0x300E
        device._fw = (2, 0, 0)
        device.lcd_resolution = (240, 240)
        device.bulk_buffer_size = main._LCD_BULK_TRANSFER_BYTES
        if primed is not None:
            device._cc_fw2_primed = primed
        return device

    def _send(self, device):
        main._send_frame_fw2(device, self.FRAME_FW2, self.BULK_INFO_FW2)

    def _transfers(self, device):
        """How many times the frame went out; each transfer opens with its own command."""
        return len(
            [
                c
                for c in device.calls
                if c[0] == "write_then_read" and c[1][0:2] == [0x36, 0x01]
            ]
        )

    def test_the_first_frame_after_an_initialize_is_sent_twice(self):
        """Goal: liquidctl says the second transfer is needed once after initialization, and
        that is the one claim here taken on trust. Method: send one frame cold."""
        device = self._kraken()

        self._send(device)

        self.assertEqual(self._transfers(device), 2)
        self.assertEqual(device.bulk_writes.count(self.FRAME_FW2), 2)

    def test_every_frame_after_the_first_is_sent_once(self):
        """Goal: halving the device work per apply is the point of the change, and Temp mode
        re-applies constantly. Method: four applies, counting transfers."""
        device = self._kraken()

        for _ in range(4):
            self._send(device)

        self.assertEqual(
            self._transfers(device), 5, "two for the first apply, one for each after"
        )

    def test_an_initialize_re_arms_the_doubled_frame(self):
        """Goal: boot, resume and reconnect all land back in the state liquidctl says needs
        the second transfer. Method: prime, initialize, then count the next apply."""
        device = self._kraken()
        self._send(device)

        with mock.patch.object(main, "_ORIGINAL_INITIALIZE", return_value=None):
            main._initialize_repriming_the_lcd(device)
        device.calls.clear()
        self._send(device)

        self.assertEqual(self._transfers(device), 2)

    def test_queued_reports_are_drained_before_the_transfer_opens(self):
        """Goal: `_write_then_read` returns the next report and checks nothing, so a status
        report that arrived while the frame was decoded is taken as the transfer's answer and
        every read after it is one behind. Method: check the drain lands first."""
        device = self._kraken(primed=True)

        self._send(device)

        self.assertEqual(device.calls[0][0], "clear_enqueued_reports")
        self.assertEqual(device.calls[1][1][0:2], [0x36, 0x01])

    def test_the_frame_is_handed_over_whole_without_a_copy(self):
        """Goal: liquidctl rebuilt the frame as a python list of ints for every chunk of
        every send, and it sent twice. Method: capture what the write was given."""
        device = self._kraken(primed=True)
        written = []
        device._bulk_write = written.append

        self._send(device)

        self.assertIs(
            written[1], self.FRAME_FW2, "the frame must not be sliced or rebuilt"
        )

    def test_the_frame_is_chunked_at_the_connections_transfer_size(self):
        """Goal: this path shares the transfer sizing the rotation uses, including the fall
        back a timeout triggers. Method: send at liquidctl's own 512 bytes."""
        device = self._kraken(primed=True)
        device.bulk_buffer_size = 512

        self._send(device)

        header, *chunks = device.bulk_writes
        self.assertEqual(header[:12], bytes(main._LCD_BULK_HEADER))
        self.assertEqual(b"".join(chunks), self.FRAME_FW2)

    def test_a_transfer_that_failed_leaves_the_next_frame_doubled(self):
        """Goal: priming records that the device has had its second transfer, so a send that
        never landed must not count as one. Method: time the frame write out."""
        device = self._kraken()
        device._bulk_write = mock.Mock(side_effect=main.Timeout())

        with self.assertRaises(main.Timeout):
            self._send(device)

        self.assertFalse(getattr(device, "_cc_fw2_primed", False))


class TestGifSupportIsReported(unittest.TestCase):
    """The daemon never sees a product id, so the one model that cannot show a gif has to be
    named here or the mode goes on being offered and failing."""

    def _kraken(self, product_id, fw):
        device = FakeKraken({})
        device.device.product_id = product_id
        if fw is not None:
            device._fw = fw
        return device

    def test_the_2023_on_firmware_2_cannot(self):
        with mock.patch.object(main, "KrakenZ3", FakeKraken):
            self.assertIs(
                main.lcd_gif_supported(self._kraken(0x300E, (2, 0, 0))), False
            )

    def test_the_same_model_on_firmware_1_can(self):
        """Goal: liquidctl gates on the firmware major as well as the model. Method: the same
        product id one major earlier."""
        with mock.patch.object(main, "KrakenZ3", FakeKraken):
            self.assertIs(main.lcd_gif_supported(self._kraken(0x300E, (1, 8, 0))), True)

    def test_another_model_on_firmware_2_can(self):
        """Goal: a 2024 model on a 2.x firmware takes liquidctl's ordinary path, where gifs
        work, so keying off the firmware alone would take the mode away from it. Method: a
        different product id at the refusing firmware."""
        with mock.patch.object(main, "KrakenZ3", FakeKraken):
            self.assertIs(main.lcd_gif_supported(self._kraken(0x3014, (2, 0, 0))), True)

    def test_a_device_without_a_screen_answers_nothing(self):
        self.assertIsNone(main.lcd_gif_supported(self._kraken(0x300E, (2, 0, 0))))

    def test_an_unread_firmware_answers_nothing(self):
        """Goal: reporting "no gifs" from a firmware that was never read would take the mode
        away on a guess. Method: the refusing model with `_fw` never populated."""
        with mock.patch.object(main, "KrakenZ3", FakeKraken):
            self.assertIsNone(main.lcd_gif_supported(self._kraken(0x300E, None)))


class TestGifUnsupportedIsExplained(unittest.TestCase):
    """A firmware that cannot show gifs fails the same way a broken device does, and the daemon
    re-applies on a schedule, so the explanation has to be said once and only once."""

    def test_it_explains_the_refusal_once_and_still_raises(self):
        device = FakeKraken({})

        def refuse(self, channel, mode, value, **kwargs):
            raise main.NotSupportedByDriver(
                "gif images are not supported on firmware 2.X.Y"
            )

        with mock.patch.object(main, "_ORIGINAL_SET_SCREEN", refuse):
            with self.assertLogs(level="WARNING") as captured:
                for _ in range(3):
                    with self.assertRaises(main.NotSupportedByDriver):
                        main._set_screen_with_drained_queue(
                            device, "lcd", "gif", "a.gif"
                        )

        explained = [m for m in captured.output if "does not support LCD gifs" in m]
        self.assertEqual(len(explained), 1, captured.output)

    def test_a_refusal_that_is_not_about_gifs_is_not_explained_away(self):
        """Goal: the message names gifs specifically, so it must not appear for another mode's
        refusal. Method: refuse a static image."""
        device = FakeKraken({})

        def refuse(self, channel, mode, value, **kwargs):
            raise main.NotSupportedByDriver("something else entirely")

        with mock.patch.object(main, "_ORIGINAL_SET_SCREEN", refuse):
            with self.assertRaises(main.NotSupportedByDriver):
                with mock.patch.object(main.log, "warning") as warned:
                    main._set_screen_with_drained_queue(
                        device, "lcd", "static", "a.png"
                    )
            warned.assert_not_called()


if __name__ == "__main__":
    unittest.main()
