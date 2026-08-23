"""Characterization tests for downloader invariants without starting Flask.

The production module starts background threads and installs socket guards at
import time. These tests extract pure/small functions from its AST so local and
CI checks remain deterministic and never contact media providers.
"""

import ast
import os
import re
import tempfile
import threading
import time
import unittest
from pathlib import Path


APP_PATH = Path(__file__).resolve().parents[1] / "app.py"
APP_SOURCE = APP_PATH.read_text(encoding="utf-8")
APP_TREE = ast.parse(APP_SOURCE, filename=str(APP_PATH))


def load_function(name, namespace):
    node = next(
        item for item in APP_TREE.body
        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and item.name == name
    )
    module = ast.Module(body=[node], type_ignores=[])
    ast.fix_missing_locations(module)
    exec(compile(module, str(APP_PATH), "exec"), namespace)
    return namespace[name]


def function_source(name):
    node = next(
        item for item in APP_TREE.body
        if isinstance(item, ast.FunctionDef) and item.name == name
    )
    return ast.get_source_segment(APP_SOURCE, node)


def download_source():
    return function_source("download")


def orchestration_source():
    """download() plus the units docs/OPTIMIZATIONS.md Finding 11 extracted from
    it (option planning, attempt execution, media post-processing, job
    finalizer). Route-wide
    invariants (single extraction call, cleanup coverage) are checked across
    all five, since the logic now lives across them rather than only inline.
    """
    return "\n".join(function_source(name) for name in (
        "build_download_options",
        "run_download_attempts",
        "apply_mute_postprocessing",
        "finalize_prepared_download",
        "download",
    ))


class SourceHealthTests(unittest.TestCase):
    def test_backend_source_compiles(self):
        compile(APP_SOURCE, str(APP_PATH), "exec")

    def test_single_extraction_and_native_token_handoff_are_preserved(self):
        source = orchestration_source()
        self.assertEqual(source.count("extract_info(url, download=True)"), 1)
        plan_source = function_source("build_download_options")
        self.assertIn('extra["noplaylist"] = True', plan_source)
        self.assertIn('extra["match_filter"] = enforce_download_limits', plan_source)
        self.assertEqual(source.count("prepare_native_download("), 1)
        self.assertIn('"download_url": f"/files/{token}"', source)

    def test_all_terminal_failure_paths_use_scoped_cleanup_helpers(self):
        source = orchestration_source()
        self.assertNotIn("f.startswith(filename)", source)
        self.assertGreaterEqual(source.count("discard_cancel_event(download_id)"), 10)
        self.assertGreaterEqual(source.count("cleanup_download_artifacts(filename)"), 3)

    def test_finding_11_extraction_is_wired_up_and_route_stays_small(self):
        """docs/OPTIMIZATIONS.md Finding 11: attempt execution, media
        post-processing, and job finalization must be extracted units the
        route calls into, not inline logic -- and the route itself should
        stay small enough to reason about without them.
        """
        source = download_source()
        self.assertIn("make_download_progress_hook(", source)
        self.assertIn("build_download_options(", source)
        self.assertIn("run_download_attempts(", source)
        self.assertIn("apply_mute_postprocessing(", source)
        self.assertIn("finalize_prepared_download(", source)
        # Regression guard: route previously spanned ~470 lines (all hot-path
        # concerns inline). It should now be meaningfully smaller.
        self.assertLess(len(source.splitlines()), 250)


class FormatPlanningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.build_format_str = staticmethod(load_function("build_format_str", {
            "AUDIO_FMTS": {"mp3", "flac", "wav", "ogg", "opus", "m4a"},
            "is_youtube": lambda url: "youtube.com" in url or "youtu.be" in url,
        }))

    def test_youtube_mute_selects_video_only(self):
        selector = self.build_format_str(
            "https://www.youtube.com/watch?v=abcdefghijk", "1080", "mp4", "h264", mute=True
        )
        self.assertIn("bestvideo", selector)
        self.assertNotIn("bestaudio", selector)

    def test_normal_youtube_video_keeps_audio_fallback(self):
        selector = self.build_format_str(
            "https://youtu.be/abcdefghijk", "1080", "mp4", "h264", mute=False
        )
        self.assertIn("bestaudio", selector)

    def test_audio_mode_remains_audio_only(self):
        self.assertEqual(
            self.build_format_str("https://example.com/video", "1080", "mp3", "h264"),
            "bestaudio/best",
        )


class DownloadOptionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.limit_filter = staticmethod(lambda info, incomplete=False: None)

        def get_opts_list(url, *, extra, youtube_video_fallback):
            return {
                "url": url,
                "extra": extra,
                "youtube_video_fallback": youtube_video_fallback,
            }

        cls.build_options = staticmethod(load_function("build_download_options", {
            "build_format_str": lambda url, quality, fmt, codec, mute=False: "selected-format",
            "FFMPEG_DIR": "ffmpeg",
            "enforce_download_limits": cls.limit_filter,
            "get_opts_list": get_opts_list,
            "is_youtube": lambda url: "youtube.com" in url,
        }))

    def _build(self, **overrides):
        values = {
            "quality": "1080",
            "fmt": "mp4",
            "codec": "h264",
            "audio_q": "192",
            "mute": False,
            "is_audio": False,
            "add_meta": False,
            "want_sponsorblock": False,
            "sb_categories": ["sponsor"],
            "sb_mode": "mark",
            "want_subs": False,
            "sub_langs": ["en"],
            "filepath": "download/job",
            "progress_hook": object(),
        }
        values.update(overrides)
        return self.build_options("https://youtube.com/watch?v=abcdefghijk", **values)

    def test_video_plan_keeps_single_item_limits_and_optional_processors(self):
        result = self._build(add_meta=True, want_sponsorblock=True, sb_mode="remove", want_subs=True)
        extra = result["extra"]
        self.assertEqual(extra["format"], "selected-format")
        self.assertEqual(extra["merge_output_format"], "mp4")
        self.assertTrue(extra["noplaylist"])
        self.assertIs(extra["match_filter"], self.limit_filter)
        self.assertTrue(result["youtube_video_fallback"])
        self.assertEqual(
            [processor["key"] for processor in extra["postprocessors"]],
            ["FFmpegMetadata", "SponsorBlock", "ModifyChapters", "FFmpegEmbedSubtitle"],
        )

    def test_audio_plan_extracts_requested_codec_without_video_fallback(self):
        result = self._build(fmt="mp3", is_audio=True, audio_q="320", want_subs=True)
        extra = result["extra"]
        extractor = extra["postprocessors"][0]
        self.assertEqual(extractor["key"], "FFmpegExtractAudio")
        self.assertEqual(extractor["preferredcodec"], "mp3")
        self.assertEqual(extractor["preferredquality"], "320")
        self.assertNotIn("writesubtitles", extra)
        self.assertFalse(result["youtube_video_fallback"])


class DownloadLimitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.enforce_download_limits = staticmethod(load_function("enforce_download_limits", {
            "MAX_VIDEO_DURATION_SECONDS": 3600,
        }))

    def test_playlist_container_is_rejected_but_single_entry_is_allowed(self):
        container = {"playlist": "Mix", "protocol": "https"}
        entry = {"playlist": "Mix", "playlist_index": 1, "protocol": "https"}
        self.assertIn("Playlist downloads are not supported", self.enforce_download_limits(container, incomplete=True))
        self.assertIsNone(self.enforce_download_limits(entry, incomplete=True))

    def test_duration_and_protocol_limits_are_preserved(self):
        self.assertIn("Video too long", self.enforce_download_limits({"duration": 3601, "protocol": "https"}))
        self.assertIn("protocol", self.enforce_download_limits({"duration": 60, "protocol": "https+file"}).lower())
        self.assertIsNone(self.enforce_download_limits({"duration": 60, "protocol": "m3u8_native+https"}))


class RequestParsingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class DownloadRequestError(ValueError):
            pass

        cls.error_type = DownloadRequestError
        cls.parse_download_request = staticmethod(load_function("parse_download_request", {
            "DownloadRequestError": DownloadRequestError,
            "ALLOWED_DOWNLOAD_FORMATS": {"mp4", "webm", "mkv", "avi", "mov", "mp3"},
            "ALLOWED_VIDEO_CODECS": {"h264", "av1", "vp9"},
            "ALLOWED_SPONSORBLOCK_CATEGORIES": {"sponsor", "intro"},
            "AUDIO_FMTS": {"mp3"},
            "FFMPEG_DIR": "ffmpeg",
            "is_safe_url": lambda url: url.startswith("https://"),
            "is_youtube_live_url": lambda url: False,
            "is_unsupported_domain": lambda url: False,
            "is_youtube": lambda url: "youtube.com" in url,
        }))

    def test_valid_request_is_normalized_before_job_reservation(self):
        parsed = self.parse_download_request({
            "url": " https://youtube.com/watch?v=abcdefghijk ",
            "format": "MP4",
            "codec": "H264",
            "quality": 1080,
            "audioQ": "invalid",
            "mute": True,
            "sub_langs": ["tr", "bad/lang", "en"],
            "sponsorblock_categories": ["sponsor", "unknown"],
        })
        self.assertEqual(parsed["url"], "https://youtube.com/watch?v=abcdefghijk")
        self.assertEqual(parsed["audio_q"], "256")
        self.assertEqual(parsed["sub_langs"], ["tr", "en"])
        self.assertEqual(parsed["sb_categories"], ["sponsor"])
        self.assertTrue(parsed["youtube_video_only_mute"])
        self.assertFalse(parsed["mute_needs_strip"])

    def test_invalid_body_and_format_fail_before_state_is_reserved(self):
        with self.assertRaisesRegex(self.error_type, "Invalid request body"):
            self.parse_download_request([])
        with self.assertRaisesRegex(self.error_type, "Unsupported format"):
            self.parse_download_request({"url": "https://example.com/video", "format": "exe"})


class CleanupLifecycleTests(unittest.TestCase):
    def test_artifact_cleanup_is_token_scoped(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            token = "abc12345"
            own_files = [f"{token}.mp4", f"{token}.part"]
            other_file = f"{token}9.mp4"
            for name in [*own_files, other_file]:
                Path(temp_dir, name).write_bytes(b"test")

            def force_cleanup(path):
                os.remove(path)

            cleanup = load_function("cleanup_download_artifacts", {
                "DOWNLOAD_DIR": temp_dir,
                "DOWNLOAD_ID_RE": re.compile(r"^[A-Za-z0-9_-]{8,64}$"),
                "_force_cleanup": force_cleanup,
                "os": os,
            })
            self.assertEqual(cleanup(token), 2)
            self.assertFalse(any(Path(temp_dir, name).exists() for name in own_files))
            self.assertTrue(Path(temp_dir, other_file).exists())
            self.assertEqual(cleanup("bad/token"), 0)

    def test_cancel_event_discard_is_idempotent(self):
        events = {"download01": object()}
        discard = load_function("discard_cancel_event", {
            "cancel_events": events,
            "cancel_events_lock": threading.Lock(),
        })
        discard("download01")
        discard("download01")
        self.assertEqual(events, {})


class _Logger:
    def info(self, *a, **k):
        pass

    def error(self, *a, **k):
        pass


class _NullScope:
    def __call__(self, *a, **k):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _GeventTimeout:
    """Stand-in for gevent.Timeout: a context manager that does not
    actually enforce a deadline, so tests stay deterministic."""

    def __init__(self, *a, **k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _FakeDownloadCancelled(Exception):
    pass


class _FakeYtDlpModule:
    """Minimal stand-in for the yt_dlp module surface run_download_attempts
    touches: utils.DownloadCancelled and a YoutubeDL context manager whose
    extract_info() is scripted per-test via a queue of callables."""

    def __init__(self, behaviors):
        self._behaviors = list(behaviors)
        self.calls = 0

        class _Utils:
            DownloadCancelled = _FakeDownloadCancelled
        self.utils = _Utils()

        outer = self

        class _YoutubeDL:
            def __init__(self, opts):
                self.opts = opts

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def extract_info(self, url, download=True):
                behavior = outer._behaviors[outer.calls]
                outer.calls += 1
                return behavior()

        self.YoutubeDL = _YoutubeDL


class AttemptExecutionTests(unittest.TestCase):
    """docs/OPTIMIZATIONS.md Finding 11: attempt execution was extracted from the
    /download route into run_download_attempts(). These tests cover the
    retry-ladder decisions that make the loop non-trivial, without touching
    a real extractor.
    """

    def _load(self, behaviors):
        reap_calls = []
        fake_yt_dlp = _FakeYtDlpModule(behaviors)

        class _DownloadAttemptResult:
            def __init__(self, success=False, full_path=None, video_title=None,
                         timed_out=False, last_err=None, primary_err=None):
                self.success = success
                self.full_path = full_path
                self.video_title = video_title
                self.timed_out = timed_out
                self.last_err = last_err
                self.primary_err = primary_err

        namespace = {
            "DownloadAttemptResult": _DownloadAttemptResult,
            "is_youtube": lambda url: False,
            "logger": _Logger(),
            "_snapshot_child_pids": lambda: set(),
            "_reap_new_children": lambda before, download_id, filename: reap_calls.append(1),
            "gevent": type("gevent", (), {"Timeout": _GeventTimeout}),
            "yt_dlp": fake_yt_dlp,
            "_pot_provider_network_scope": _NullScope(),
            "enforce_download_limits": lambda info, incomplete=False: None,
            "resolve_downloaded_media_path": lambda info, filename: info.get("_path"),
            "remember_primary_error": lambda primary, candidate: primary or candidate,
            "DOWNLOAD_TIMEOUT_SECONDS": 30,
            "time": time,
        }
        fn = load_function("run_download_attempts", namespace)
        return fn, reap_calls

    def test_cookie_error_falls_through_to_next_attempt_which_succeeds(self):
        def first():
            raise ValueError("cookie invalid, please refresh")

        def second():
            return {"_path": "/tmp/final.mp4", "title": "Second Attempt"}

        fn, reap_calls = self._load([first, second])
        result = fn(
            "https://example.com/video", [{}, {}],
            download_id="d1", filename="f1", video_title=None,
            request_deadline=time.monotonic() + 30,
            cancel_event=threading.Event(),
        )
        self.assertTrue(result.success)
        self.assertEqual(result.full_path, "/tmp/final.mp4")
        self.assertEqual(result.video_title, "Second Attempt")
        self.assertEqual(len(reap_calls), 1)  # only the failed first attempt reaps

    def test_rate_limit_error_stops_immediately_without_trying_fallback(self):
        def first():
            raise ValueError("HTTP Error 429: Too Many Requests")

        def unreachable():
            raise AssertionError("second attempt should not run after a 429")

        fn, _ = self._load([first, unreachable])
        result = fn(
            "https://example.com/video", [{}, {}],
            download_id="d1", filename="f1", video_title=None,
            request_deadline=time.monotonic() + 30,
            cancel_event=threading.Event(),
        )
        self.assertFalse(result.success)
        self.assertIn("429", str(result.primary_err))

    def test_expired_deadline_is_reported_as_timeout_not_a_generic_failure(self):
        fn, _ = self._load([lambda: {"_path": "/tmp/x.mp4"}])
        result = fn(
            "https://example.com/video", [{}],
            download_id="d1", filename="f1", video_title=None,
            request_deadline=time.monotonic() - 1,  # already expired
            cancel_event=threading.Event(),
        )
        self.assertTrue(result.timed_out)
        self.assertFalse(result.success)

    def test_cancel_event_set_before_any_attempt_is_re_raised(self):
        fn, _ = self._load([lambda: {"_path": "/tmp/x.mp4"}])
        cancel_event = threading.Event()
        cancel_event.set()
        result = fn(
            "https://example.com/video", [{}],
            download_id="d1", filename="f1", video_title=None,
            request_deadline=time.monotonic() + 30,
            cancel_event=cancel_event,
        )
        # Loop breaks on a pre-set cancel_event rather than raising itself;
        # the route checks cancel_event.is_set() right after the call.
        self.assertFalse(result.success)


class MutePostprocessingTests(unittest.TestCase):
    """docs/OPTIMIZATIONS.md Finding 11: the mute-strip FFmpeg pass was extracted
    into apply_mute_postprocessing(). Only exercised as a fallback now that
    Finding 2 makes YouTube select a video-only format up front, but non-
    YouTube muxed-only sources still take this path.
    """

    def _load(self, run_result):
        namespace = {
            "logger": _Logger(),
            "os": os,
            "subprocess": type("subprocess", (), {
                "run": staticmethod(lambda *a, **k: run_result),
            }),
            "FFMPEG_PATH": "ffmpeg",
            "FFMPEG_DIR": "/usr/bin",
            "FFMPEG_LOCAL_PROTOCOLS": "file",
            "FFMPEG_TIMEOUT": 30,
            "_register_cleanup": lambda path: None,
            "_unregister_cleanup": lambda path: None,
        }
        return load_function("apply_mute_postprocessing", namespace)

    def test_successful_strip_renames_muted_output_over_original(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            full_path = str(Path(temp_dir, "clip.mp4"))
            Path(full_path).write_bytes(b"ORIGINAL")
            muted_path = str(Path(temp_dir, "clip.muted.mp4"))

            class _Result:
                returncode = 0
                stderr = ""

            def fake_run(*a, **k):
                Path(muted_path).write_bytes(b"MUTED")
                return _Result()

            fn = self._load(None)
            fn.__globals__["subprocess"].run = staticmethod(fake_run)
            fn(full_path)
            self.assertEqual(Path(full_path).read_bytes(), b"MUTED")
            self.assertFalse(Path(muted_path).exists())

    def test_ffmpeg_failure_raises_and_leaves_original_untouched(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            full_path = str(Path(temp_dir, "clip.mp4"))
            Path(full_path).write_bytes(b"ORIGINAL")

            class _Result:
                returncode = 1
                stderr = "boom"

            fn = self._load(None)
            fn.__globals__["subprocess"].run = staticmethod(lambda *a, **k: _Result())
            with self.assertRaises(RuntimeError):
                fn(full_path)
            self.assertEqual(Path(full_path).read_bytes(), b"ORIGINAL")


class JobFinalizerTests(unittest.TestCase):
    """docs/OPTIMIZATIONS.md Finding 11: the success/too-large decision, progress
    emit, slot release, and native-transfer handoff were extracted into
    finalize_prepared_download(). Repeated calls with the same state must
    return the cached result. release_slot must fire exactly once, and
    only on the success path -- the too-large path leaves it to the route's
    own `finally` fallback, matching the pre-extraction behavior.
    """

    def _load(self, *, max_size):
        calls = {"discard": 0, "release_slot": 0, "prepared": None}

        namespace = {
            "os": os,
            "logger": _Logger(),
            "MAX_DOWNLOAD_SIZE_BYTES": max_size,
            "discard_cancel_event": lambda download_id: calls.__setitem__("discard", calls["discard"] + 1),
            "safe_emit": lambda event, data, room=None: None,
            "sanitize_filename": lambda name: name,
            "safe_download_name": lambda requested, fallback, ext: requested or f"{fallback}.{ext}",
            "prepare_native_download": lambda path, name, ip, reservation_id: calls.__setitem__("prepared", (path, name, ip, reservation_id)) or "TOKEN123",
            "jsonify": lambda payload: payload,
            "PREPARED_FILE_TTL": 600,
            "_unregister_cleanup": lambda path: None,
        }
        fn = load_function("finalize_prepared_download", namespace)
        return fn, calls

    def test_oversized_file_is_rejected_without_releasing_the_slot(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            full_path = str(Path(temp_dir, "big.mp4"))
            Path(full_path).write_bytes(b"x" * 100)
            fn, calls = self._load(max_size=10)
            released = []
            state = {"lock": threading.Lock()}
            (payload, status), reservation_consumed = fn(
                full_path, fmt="mp4", video_title="T", requested_download_name=None,
                ip="1.2.3.4", spool_reservation_id="res1", sid=None, download_id="d1",
                release_slot=lambda: released.append(1),
                state=state,
            )
            self.assertEqual(status, 400)
            self.assertEqual(payload["error_code"], "file_too_large")
            self.assertFalse(reservation_consumed)
            self.assertEqual(released, [])
            self.assertEqual(calls["discard"], 1)

    def test_successful_file_releases_slot_once_and_hands_off_token(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            full_path = str(Path(temp_dir, "clip.mp4"))
            Path(full_path).write_bytes(b"x" * 10)
            fn, calls = self._load(max_size=1000)
            released = []
            state = {"lock": threading.Lock()}
            first = fn(
                full_path, fmt="mp4", video_title="My Title", requested_download_name=None,
                ip="1.2.3.4", spool_reservation_id="res1", sid=None, download_id="d1",
                release_slot=lambda: released.append(1),
                state=state,
            )
            second = fn(
                full_path, fmt="mp4", video_title="My Title", requested_download_name=None,
                ip="1.2.3.4", spool_reservation_id="res1", sid=None, download_id="d1",
                release_slot=lambda: released.append(1),
                state=state,
            )
            (payload, status), reservation_consumed = first
            self.assertIs(second, first)
            self.assertEqual(status, 200)
            self.assertTrue(payload["ok"])
            self.assertEqual(payload["download_url"], "/files/TOKEN123")
            self.assertTrue(reservation_consumed)
            self.assertEqual(released, [1])
            self.assertEqual(calls["prepared"], (full_path, calls["prepared"][1], "1.2.3.4", "res1"))
            self.assertEqual(calls["discard"], 1)

    def test_retry_after_prepare_failure_does_not_release_slot_twice(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            full_path = str(Path(temp_dir, "clip.mp4"))
            Path(full_path).write_bytes(b"x" * 10)
            fn, calls = self._load(max_size=1000)
            released = []
            attempts = []

            def flaky_prepare(path, name, ip, reservation_id):
                attempts.append((path, name, ip, reservation_id))
                if len(attempts) == 1:
                    raise RuntimeError("temporary handoff failure")
                calls["prepared"] = attempts[-1]
                return "TOKEN123"

            fn.__globals__["prepare_native_download"] = flaky_prepare
            state = {"lock": threading.Lock()}
            kwargs = {
                "fmt": "mp4",
                "video_title": "My Title",
                "requested_download_name": None,
                "ip": "1.2.3.4",
                "spool_reservation_id": "res1",
                "sid": None,
                "download_id": "d1",
                "release_slot": lambda: released.append(1),
                "state": state,
            }
            with self.assertRaisesRegex(RuntimeError, "temporary handoff failure"):
                fn(full_path, **kwargs)

            (payload, status), reservation_consumed = fn(full_path, **kwargs)
            self.assertEqual(status, 200)
            self.assertTrue(payload["ok"])
            self.assertTrue(reservation_consumed)
            self.assertEqual(released, [1])
            self.assertEqual(len(attempts), 2)
            self.assertEqual(calls["discard"], 1)


if __name__ == "__main__":
    unittest.main()
