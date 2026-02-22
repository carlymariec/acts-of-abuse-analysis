import unittest
import hashlib
from datetime import datetime, timedelta

from django.test import TestCase

# Optional imports of application modules. Tests are skipped if these are absent.
try:
    from . import hashing
except ImportError:
    hashing = None

try:
    from . import parsers
except ImportError:
    parsers = None

try:
    from . import analysis
except ImportError:
    analysis = None

try:
    from . import timeline
except ImportError:
    timeline = None


class HashComputationTests(TestCase):
    """
    Tests for hash computation accuracy.

    These tests compare the application's hash computation (if available)
    against Python's hashlib implementation on known inputs.
    """

    @unittest.skipIf(
        hashing is None or not hasattr(hashing, "compute_hash"),
        "hashing.compute_hash not available; skipping hash computation tests.",
    )
    def test_sha256_hash_matches_hashlib(self):
        data = b"forensic-evidence-sample"
        expected = hashlib.sha256(data).hexdigest()

        # Assume the application uses SHA-256 by default.
        actual = hashing.compute_hash(data)

        self.assertEqual(
            actual,
            expected,
            "Application hash output must match hashlib.sha256 for known input.",
        )


class ParserTests(TestCase):
    """
    Tests for parser correctness.

    These tests validate that a generic parse_evidence function (if provided)
    can successfully parse a minimal, well-formed input.
    """

    @unittest.skipIf(
        parsers is None or not hasattr(parsers, "parse_evidence"),
        "parsers.parse_evidence not available; skipping parser tests.",
    )
    def test_parser_returns_non_empty_result_for_valid_input(self):
        # Minimal, synthetic input representing an evidence record.
        sample_input = {
            "id": "EV-001",
            "timestamp": "2024-01-01T12:00:00Z",
            "source": "disk-image",
            "data": "example payload",
        }

        result = parsers.parse_evidence(sample_input)

        self.assertIsNotNone(result, "Parser should not return None for valid input.")
        # At minimum, expect some structured object or dict-like content.
        self.assertTrue(
            bool(result),
            "Parser should return a non-empty structure for valid input.",
        )


class AnalysisEngineTests(TestCase):
    """
    Tests for analysis engine pattern detection.

    These tests feed a small synthetic dataset and check that at least one
    pattern is detected when the analysis module exposes detect_patterns.
    """

    @unittest.skipIf(
        analysis is None or not hasattr(analysis, "detect_patterns"),
        "analysis.detect_patterns not available; skipping analysis tests.",
    )
    def test_analysis_detects_basic_pattern(self):
        # Synthetic events that should trigger at least one detectable pattern.
        events = [
            {"id": "EV-100", "timestamp": "2024-01-01T00:00:00Z", "actor": "userA", "action": "login"},
            {"id": "EV-101", "timestamp": "2024-01-01T00:05:00Z", "actor": "userA", "action": "access_sensitive_file"},
            {"id": "EV-102", "timestamp": "2024-01-01T00:06:00Z", "actor": "userA", "action": "logout"},
        ]

        patterns = analysis.detect_patterns(events)

        self.assertIsNotNone(patterns, "Pattern detection should not return None.")
        self.assertTrue(
            bool(patterns),
            "Analysis engine should detect at least one pattern in synthetic data.",
        )


class TimelineGenerationTests(TestCase):
    """
    Tests for timeline generation, including ordering and edge cases.

    These tests assume a generate_timeline function that accepts a collection
    of events and returns them ordered chronologically.
    """

    @unittest.skipIf(
        timeline is None or not hasattr(timeline, "generate_timeline"),
        "timeline.generate_timeline not available; skipping timeline tests.",
    )
    def test_timeline_is_sorted_by_timestamp(self):
        base = datetime(2024, 1, 1, 12, 0, 0)
        events = [
            {"id": "EV-3", "timestamp": base + timedelta(minutes=5)},
            {"id": "EV-1", "timestamp": base},
            {"id": "EV-2", "timestamp": base + timedelta(minutes=1)},
        ]

        ordered = timeline.generate_timeline(events)

        # Extract timestamps in the order returned and verify monotonicity.
        timestamps = [e["timestamp"] for e in ordered]
        self.assertEqual(
            sorted(timestamps),
            timestamps,
            "Timeline events must be returned in chronological order.",
        )

    @unittest.skipIf(
        timeline is None or not hasattr(timeline, "generate_timeline"),
        "timeline.generate_timeline not available; skipping timeline tests.",
    )
    def test_timeline_handles_identical_timestamps(self):
        ts = datetime(2024, 1, 1, 13, 0, 0)
        events = [
            {"id": "EV-10", "timestamp": ts, "seq": 2},
            {"id": "EV-9", "timestamp": ts, "seq": 1},
        ]

        ordered = timeline.generate_timeline(events)

        # All events share the same timestamp; at minimum, they must all be present.
        self.assertEqual(
            {e["id"] for e in events},
            {e["id"] for e in ordered},
            "Timeline must preserve all events even when timestamps are identical.",
        )
