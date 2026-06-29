import hashlib
import io
import json
import os
import tempfile
from datetime import datetime, timezone

from django.core.exceptions import ValidationError
from django.test import TestCase

from evidence.analysis_engine import CoerciveControlEngine
from evidence.analysis_pipeline import run_analysis_pipeline
from evidence.file_security import validate_file_content
from evidence.ingestion import compute_file_hash, import_parser, process_upload
from evidence.normalization import (
    build_context_window,
    local_day_bounds,
    merge_windows,
    normalize_messages,
)
from evidence.views import generate_timeline


# ---------------------------------------------------------------------------
# Hash computation
# ---------------------------------------------------------------------------

class HashComputationTests(TestCase):
    def test_sha256_matches_hashlib(self):
        data = b"forensic-evidence-sample"
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(data)
            tmp = f.name
        try:
            expected = hashlib.sha256(data).hexdigest()
            self.assertEqual(compute_file_hash(tmp), expected)
        finally:
            os.unlink(tmp)

    def test_hash_is_64_hex_chars(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(b"test")
            tmp = f.name
        try:
            h = compute_file_hash(tmp)
            self.assertEqual(len(h), 64)
            self.assertTrue(all(c in "0123456789abcdef" for c in h))
        finally:
            os.unlink(tmp)


# ---------------------------------------------------------------------------
# Parser whitelist / injection guard
# ---------------------------------------------------------------------------

class IngestionWhitelistTests(TestCase):
    def test_allowed_parser_loads(self):
        parser = import_parser('generic')
        self.assertTrue(hasattr(parser, 'extract_data'))

    def test_unknown_parser_raises(self):
        with self.assertRaises(ValueError):
            import_parser('evil_module')

    def test_whitelist_case_insensitive(self):
        parser = import_parser('WhatsApp')
        self.assertTrue(hasattr(parser, 'extract_data'))


# ---------------------------------------------------------------------------
# Generic parser
# ---------------------------------------------------------------------------

class GenericParserTests(TestCase):
    def _write_tmp(self, content, suffix='.txt'):
        f = tempfile.NamedTemporaryFile(
            mode='w', suffix=suffix, delete=False, encoding='utf-8'
        )
        f.write(content)
        f.close()
        return f.name

    def test_parses_plain_lines(self):
        tmp = self._write_tmp("Hello world\nSecond line\n")
        try:
            msgs = import_parser('generic').extract_data(tmp)
            self.assertEqual(len(msgs), 2)
            self.assertEqual(msgs[0]['content'], 'Hello world')
        finally:
            os.unlink(tmp)

    def test_empty_file_returns_empty_list(self):
        tmp = self._write_tmp("")
        try:
            msgs = import_parser('generic').extract_data(tmp)
            self.assertEqual(msgs, [])
        finally:
            os.unlink(tmp)

    def test_extracts_sender_from_plain_line(self):
        """Sender in 'Name: message' format should be detected on lines without a timestamp."""
        tmp = self._write_tmp("Alice: Hello there\nBob: Hi back\n")
        try:
            msgs = import_parser('generic').extract_data(tmp)
            self.assertEqual(len(msgs), 2)
            self.assertEqual(msgs[0]['sender'], 'Alice')
            self.assertEqual(msgs[0]['content'], 'Hello there')
            self.assertEqual(msgs[1]['sender'], 'Bob')
        finally:
            os.unlink(tmp)

    def test_extracts_sender_after_timestamp(self):
        """Sender in 'TIMESTAMP - Name: message' format should be detected."""
        tmp = self._write_tmp("01/15/2024 10:30:00 - Alice: Hello there\n")
        try:
            msgs = import_parser('generic').extract_data(tmp)
            self.assertEqual(len(msgs), 1)
            self.assertEqual(msgs[0]['sender'], 'Alice')
            self.assertEqual(msgs[0]['content'], 'Hello there')
            self.assertIsNotNone(msgs[0]['timestamp'])
        finally:
            os.unlink(tmp)

    def test_no_sender_pattern_falls_back_to_unknown(self):
        """Lines with no 'Sender: message' pattern should fall back to 'Unknown'."""
        tmp = self._write_tmp("Just a plain statement with no sender.\n")
        try:
            msgs = import_parser('generic').extract_data(tmp)
            self.assertEqual(msgs[0]['sender'], 'Unknown')
            self.assertEqual(msgs[0]['content'], 'Just a plain statement with no sender.')
        finally:
            os.unlink(tmp)


# ---------------------------------------------------------------------------
# WhatsApp parser
# ---------------------------------------------------------------------------

class WhatsAppParserTests(TestCase):
    def _write_tmp(self, content):
        f = tempfile.NamedTemporaryFile(
            mode='w', suffix='.txt', delete=False, encoding='utf-8'
        )
        f.write(content)
        f.close()
        return f.name

    def test_parses_basic_message(self):
        tmp = self._write_tmp(
            "01/15/2024, 10:30:00 - Alice: Hello there\n"
        )
        try:
            msgs = import_parser('whatsapp').extract_data(tmp)
            self.assertEqual(len(msgs), 1)
            self.assertEqual(msgs[0]['sender'], 'Alice')
            self.assertEqual(msgs[0]['content'], 'Hello there')
        finally:
            os.unlink(tmp)

    def test_continuation_line_merged(self):
        tmp = self._write_tmp(
            "01/15/2024, 10:30:00 - Alice: First line\n"
            "second line continued\n"
        )
        try:
            msgs = import_parser('whatsapp').extract_data(tmp)
            self.assertEqual(len(msgs), 1)
            self.assertIn("second line continued", msgs[0]['content'])
        finally:
            os.unlink(tmp)


# ---------------------------------------------------------------------------
# Facebook parser
# ---------------------------------------------------------------------------

class FacebookParserTests(TestCase):
    def _write_json(self, data):
        f = tempfile.NamedTemporaryFile(
            mode='w', suffix='.json', delete=False, encoding='utf-8'
        )
        json.dump(data, f)
        f.close()
        return f.name

    def test_parses_messages(self):
        payload = {
            "participants": [{"name": "Alice"}],
            "messages": [
                {"sender_name": "Alice", "timestamp_ms": 1705312200000, "content": "Hi"},
                {"sender_name": "Bob", "timestamp_ms": 1705312260000, "content": "Hey"},
            ],
        }
        tmp = self._write_json(payload)
        try:
            msgs = import_parser('facebook').extract_data(tmp)
            self.assertEqual(len(msgs), 2)
            self.assertEqual(msgs[0]['sender'], 'Alice')
        finally:
            os.unlink(tmp)

    def test_invalid_json_raises(self):
        f = tempfile.NamedTemporaryFile(
            mode='w', suffix='.json', delete=False, encoding='utf-8'
        )
        f.write("not valid json{{{")
        f.close()
        try:
            with self.assertRaises(ValueError):
                import_parser('facebook').extract_data(f.name)
        finally:
            os.unlink(f.name)


# ---------------------------------------------------------------------------
# Discord parser
# ---------------------------------------------------------------------------

class DiscordParserTests(TestCase):
    def test_invalid_json_raises(self):
        f = tempfile.NamedTemporaryFile(
            mode='w', suffix='.json', delete=False, encoding='utf-8'
        )
        f.write("not valid json{{{")
        f.close()
        try:
            with self.assertRaises(ValueError):
                import_parser('discord').extract_data(f.name)
        finally:
            os.unlink(f.name)

    def test_parses_messages(self):
        payload = {
            "guild": {"name": "Test Server"},
            "messages": [
                {
                    "author": {"name": "Alice"},
                    "timestamp": "2024-01-15T10:30:00+00:00",
                    "content": "Hello",
                }
            ],
        }
        f = tempfile.NamedTemporaryFile(
            mode='w', suffix='.json', delete=False, encoding='utf-8'
        )
        json.dump(payload, f)
        f.close()
        try:
            msgs = import_parser('discord').extract_data(f.name)
            self.assertEqual(len(msgs), 1)
            self.assertEqual(msgs[0]['sender'], 'Alice')
        finally:
            os.unlink(f.name)


# ---------------------------------------------------------------------------
# Process upload — JSON platform detection
# ---------------------------------------------------------------------------

class ProcessUploadDetectionTests(TestCase):
    def test_detects_facebook(self):
        payload = {
            "participants": [{"name": "Alice"}],
            "messages": [
                {"sender_name": "Alice", "timestamp_ms": 1705312200000, "content": "Hi"},
            ],
        }
        f = tempfile.NamedTemporaryFile(
            mode='w', suffix='.json', delete=False, encoding='utf-8'
        )
        json.dump(payload, f)
        f.close()
        try:
            msgs = process_upload(f.name)
            self.assertEqual(len(msgs), 1)
        finally:
            os.unlink(f.name)

    def test_txt_falls_through_to_whatsapp(self):
        f = tempfile.NamedTemporaryFile(
            mode='w', suffix='.txt', delete=False, encoding='utf-8'
        )
        f.write("01/15/2024, 10:30:00 - Alice: Hello\n")
        f.close()
        try:
            msgs = process_upload(f.name)
            self.assertIsInstance(msgs, list)
        finally:
            os.unlink(f.name)


# ---------------------------------------------------------------------------
# Analysis engine
# ---------------------------------------------------------------------------

class CoerciveControlEngineTests(TestCase):
    def setUp(self):
        self.engine = CoerciveControlEngine()

    def test_baseline_severity(self):
        r = self.engine.analyze_message("Hello, how are you?")
        self.assertEqual(r['severity'], 1)

    def test_duluth_category_detected(self):
        r = self.engine.analyze_message("You are worthless and I will isolate you.")
        self.assertGreaterEqual(r['severity'], 2)
        self.assertTrue(len(r['categories']) > 0)

    def test_no_duplicate_categories(self):
        r = self.engine.analyze_message(
            "You are worthless and pathetic, you are nothing."
        )
        self.assertEqual(len(r['categories']), len(set(r['categories'])))

    def test_economic_abuse_detected(self):
        r = self.engine.analyze_message("I drained the account and called your boss.")
        self.assertGreaterEqual(r['severity'], 3)
        self.assertIn('Controlling Assets and Draining Accounts', r['economic_abuse_flags'])
        self.assertIn('Sabotaging Employment', r['economic_abuse_flags'])

    def test_child_abuse_detected(self):
        r = self.engine.analyze_message("I am not returning the kids this weekend.")
        self.assertGreaterEqual(r['severity'], 3)
        self.assertGreater(len(r['child_abuse_flags']), 0)

    def test_darvo_detected(self):
        r = self.engine.analyze_message("It never happened, you are crazy.")
        self.assertIn('Deny', r['darvo_flags'])
        self.assertIn('Attack', r['darvo_flags'])

    def test_no_duplicate_darvo_flags(self):
        r = self.engine.analyze_message("crazy liar unstable bitch")
        self.assertEqual(len(r['darvo_flags']), len(set(r['darvo_flags'])))

    def test_institutional_severity_uses_max(self):
        r = self.engine.analyze_message(
            "I am not returning the kids and the judge will take them."
        )
        self.assertEqual(r['severity'], 4)
        self.assertTrue(r['institutional_abuse'])


# ---------------------------------------------------------------------------
# Timeline generation
# ---------------------------------------------------------------------------

class GenerateTimelineTests(TestCase):
    class _Event:
        def __init__(self, ts, sender, score, notes, verified):
            self.timestamp = ts
            self.sender = sender
            self.severity_score = score
            self.user_context_notes = notes
            self.is_verified = verified

    def test_empty_events_returns_fallback(self):
        html = generate_timeline([])
        self.assertIn("No verified events", html)

    def test_all_unverified_returns_fallback(self):
        events = [self._Event(datetime(2024, 1, 1), 'Alice', 2, '', False)]
        html = generate_timeline(events)
        self.assertIn("No verified events", html)

    def test_null_timestamp_excluded(self):
        events = [self._Event(None, 'Alice', 2, '', True)]
        html = generate_timeline(events)
        self.assertIn("No verified events", html)

    def test_verified_events_produce_plotly_html(self):
        events = [
            self._Event(datetime(2024, 1, 10), 'Alice', 3, 'Note', True),
            self._Event(datetime(2024, 1, 11), 'Bob', 1, '', False),   # excluded
            self._Event(datetime(2024, 1, 12), 'Alice', 4, 'CPS', True),
        ]
        html = generate_timeline(events)
        self.assertIn('plotly', html.lower())


# ---------------------------------------------------------------------------
# Cross-reference flag list
# ---------------------------------------------------------------------------

class CrossReferenceFlagTests(TestCase):
    def setUp(self):
        self.engine = CoerciveControlEngine()

    def _wheel_labels(self, result):
        return [f['wheel'] for f in result['all_flags']]

    def _categories(self, result):
        return [f['category'] for f in result['all_flags']]

    def test_baseline_has_empty_all_flags(self):
        r = self.engine.analyze_message("Hello, how are you?")
        self.assertEqual(r['all_flags'], [])

    def test_duluth_match_appears_in_all_flags(self):
        r = self.engine.analyze_message("You are worthless and I am isolating you.")
        wheels = self._wheel_labels(r)
        self.assertIn('Post-Separation Power & Control', wheels)

    def test_economic_match_appears_in_all_flags(self):
        r = self.engine.analyze_message("I drained the account.")
        wheels = self._wheel_labels(r)
        self.assertIn('Post-Separation Economic Abuse', wheels)

    def test_child_abuse_match_appears_in_all_flags(self):
        r = self.engine.analyze_message("I am not returning the kids.")
        wheels = self._wheel_labels(r)
        self.assertIn('Child Abuse', wheels)

    def test_darvo_match_appears_in_all_flags(self):
        r = self.engine.analyze_message("It never happened, you are crazy.")
        wheels = self._wheel_labels(r)
        self.assertIn('DARVO', wheels)
        # Both Deny and Attack should be listed
        darvo_entries = [f for f in r['all_flags'] if f['wheel'] == 'DARVO']
        categories = [e['category'] for e in darvo_entries]
        self.assertIn('Deny', categories)
        self.assertIn('Attack', categories)

    def test_institutional_appears_in_all_flags(self):
        r = self.engine.analyze_message("The judge will decide custody.")
        wheels = self._wheel_labels(r)
        self.assertIn('Systemic/Institutional Abuse', wheels)

    def test_multi_wheel_message_all_flags_contains_all_wheels(self):
        """A message touching all wheels populates all_flags with entries from every wheel."""
        msg = (
            "You are crazy. I drained the account. "
            "I am not returning the kids. The judge will see you are unfit."
        )
        r = self.engine.analyze_message(msg)
        wheels = set(self._wheel_labels(r))
        self.assertIn('DARVO', wheels)
        self.assertIn('Post-Separation Economic Abuse', wheels)
        self.assertIn('Child Abuse', wheels)
        self.assertIn('Systemic/Institutional Abuse', wheels)

    def test_all_flags_entries_have_wheel_and_category_keys(self):
        r = self.engine.analyze_message("You are worthless. I drained the account.")
        for entry in r['all_flags']:
            self.assertIn('wheel', entry)
            self.assertIn('category', entry)


# ---------------------------------------------------------------------------
# File security scanner
# ---------------------------------------------------------------------------

class _FakeFile:
    """Minimal in-memory file-like object for testing the security scanner."""
    def __init__(self, content: bytes, name: str = 'evidence.txt'):
        self._buf = io.BytesIO(content)
        self.name = name

    def seek(self, pos):
        self._buf.seek(pos)

    def read(self, n=-1):
        return self._buf.read(n) if n != -1 else self._buf.read()


class FileScannerTests(TestCase):
    def test_clean_text_file_passes(self):
        f = _FakeFile(b"01/15/2024 10:30 - Alice: Hello there\n", name='chat.txt')
        # Should not raise
        validate_file_content(f)

    def test_clean_json_file_passes(self):
        payload = json.dumps({
            "participants": [{"name": "Alice"}],
            "messages": [{"sender_name": "Alice", "content": "Hi"}],
        }).encode()
        f = _FakeFile(payload, name='export.json')
        validate_file_content(f)

    def test_windows_executable_blocked(self):
        f = _FakeFile(b'\x4d\x5a' + b'\x00' * 100, name='malware.txt')
        with self.assertRaises(ValidationError) as ctx:
            validate_file_content(f)
        self.assertIn('Windows executable', str(ctx.exception))

    def test_elf_executable_blocked(self):
        f = _FakeFile(b'\x7fELF' + b'\x00' * 100, name='elf.txt')
        with self.assertRaises(ValidationError):
            validate_file_content(f)

    def test_shell_script_blocked(self):
        f = _FakeFile(b'#!/bin/bash\nrm -rf /', name='script.txt')
        with self.assertRaises(ValidationError) as ctx:
            validate_file_content(f)
        self.assertIn('shell', str(ctx.exception))

    def test_xss_script_tag_in_txt_blocked(self):
        f = _FakeFile(b'hello <script>alert(1)</script> world', name='chat.txt')
        with self.assertRaises(ValidationError) as ctx:
            validate_file_content(f)
        self.assertIn('script', str(ctx.exception))

    def test_javascript_url_in_json_blocked(self):
        payload = b'{"msg": "click javascript:alert(1)"}'
        f = _FakeFile(payload, name='export.json')
        with self.assertRaises(ValidationError) as ctx:
            validate_file_content(f)
        self.assertIn('javascript', str(ctx.exception))

    def test_sql_injection_in_txt_blocked(self):
        f = _FakeFile(b"name'; DROP TABLE evidence;--", name='chat.txt')
        with self.assertRaises(ValidationError) as ctx:
            validate_file_content(f)
        self.assertIn('SQL', str(ctx.exception))

    def test_eval_call_in_json_blocked(self):
        payload = b'{"data": "eval(malicious())"}'
        f = _FakeFile(payload, name='data.json')
        with self.assertRaises(ValidationError) as ctx:
            validate_file_content(f)
        self.assertIn('eval()', str(ctx.exception))

    def test_prototype_pollution_blocked(self):
        payload = b'{"__proto__": {"admin": true}}'
        f = _FakeFile(payload, name='data.json')
        with self.assertRaises(ValidationError) as ctx:
            validate_file_content(f)
        self.assertIn('prototype pollution', str(ctx.exception))

    def test_injection_patterns_not_scanned_for_pdf(self):
        """PDF files are not text-scanned for injection patterns."""
        # A PDF with <script> text in it should pass the injection scan
        # (the magic-byte check still applies for executables)
        payload = b'%PDF-1.4 <script>alert(1)</script>'
        f = _FakeFile(payload, name='document.pdf')
        # Should not raise (PDFs are not text-scanned)
        validate_file_content(f)


# ---------------------------------------------------------------------------
# Normalization helpers — local-day slicing and window merging
# ---------------------------------------------------------------------------

class LocalDayBoundsTests(TestCase):
    """Tests for DST-safe local-day UTC bound computation."""

    def test_utc_day_bounds(self):
        """UTC day for 2024-01-15 12:00 UTC should span that whole UTC day."""
        dt = datetime(2024, 1, 15, 12, 0, tzinfo=timezone.utc)
        start, end = local_day_bounds(dt, 'UTC')
        self.assertEqual(start, datetime(2024, 1, 15, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(end, datetime(2024, 1, 16, 0, 0, tzinfo=timezone.utc))

    def test_eastern_standard_time_offset(self):
        """America/New_York at UTC-5 (EST) in January: day bounds 5 h ahead of UTC."""
        # 2024-01-15 12:00 UTC = 07:00 EST — local day is 2024-01-15 EST.
        dt = datetime(2024, 1, 15, 12, 0, tzinfo=timezone.utc)
        start, end = local_day_bounds(dt, 'America/New_York')
        # Local midnight 2024-01-15 00:00 EST = 2024-01-15 05:00 UTC
        self.assertEqual(start, datetime(2024, 1, 15, 5, 0, tzinfo=timezone.utc))
        # Local midnight 2024-01-16 00:00 EST = 2024-01-16 05:00 UTC
        self.assertEqual(end, datetime(2024, 1, 16, 5, 0, tzinfo=timezone.utc))

    def test_dst_spring_forward_day_is_23_hours(self):
        """DST spring-forward day (America/New_York 2024-03-10) should be 23 h long."""
        # 2024-03-10: clocks spring forward 2 am -> 3 am (23-hour day).
        dt = datetime(2024, 3, 10, 12, 0, tzinfo=timezone.utc)
        start, end = local_day_bounds(dt, 'America/New_York')
        delta = end - start
        self.assertEqual(delta.total_seconds(), 23 * 3600)

    def test_dst_fall_back_day_is_25_hours(self):
        """DST fall-back day (America/New_York 2024-11-03) should be 25 h long."""
        # 2024-11-03: clocks fall back 2 am -> 1 am (25-hour day).
        dt = datetime(2024, 11, 3, 12, 0, tzinfo=timezone.utc)
        start, end = local_day_bounds(dt, 'America/New_York')
        delta = end - start
        self.assertEqual(delta.total_seconds(), 25 * 3600)

    def test_naive_datetime_treated_as_utc(self):
        """Naive datetime should be treated as UTC without raising."""
        dt = datetime(2024, 6, 1, 10, 0)  # naive
        start, end = local_day_bounds(dt, 'UTC')
        self.assertEqual(start, datetime(2024, 6, 1, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(end, datetime(2024, 6, 2, 0, 0, tzinfo=timezone.utc))


class MergeWindowsTests(TestCase):
    """Tests for context-window merging logic."""

    def test_empty_list_returns_empty(self):
        self.assertEqual(merge_windows([]), [])

    def test_single_window_unchanged(self):
        self.assertEqual(merge_windows([(2, 7)]), [(2, 7)])

    def test_non_overlapping_windows_kept_separate(self):
        result = merge_windows([(0, 3), (10, 15)])
        self.assertEqual(result, [(0, 3), (10, 15)])

    def test_overlapping_windows_merged(self):
        result = merge_windows([(0, 5), (3, 8)])
        self.assertEqual(result, [(0, 8)])

    def test_adjacent_windows_merged(self):
        # Windows (0,5) and (6,10) are adjacent — should merge to (0,10).
        result = merge_windows([(0, 5), (6, 10)])
        self.assertEqual(result, [(0, 10)])

    def test_unsorted_input_is_sorted_first(self):
        result = merge_windows([(10, 15), (0, 5)])
        self.assertEqual(result, [(0, 5), (10, 15)])

    def test_multiple_overlapping_collapse_to_one(self):
        result = merge_windows([(0, 3), (2, 6), (5, 10)])
        self.assertEqual(result, [(0, 10)])

    def test_build_context_window_clamped(self):
        messages = [{}] * 20
        start, end = build_context_window(messages, 0, window_size=5)
        self.assertEqual(start, 0)
        self.assertEqual(end, 5)

        start, end = build_context_window(messages, 19, window_size=5)
        self.assertEqual(start, 14)
        self.assertEqual(end, 19)


class NormalizeMessagesTests(TestCase):
    """Tests for message normalization."""

    def test_naive_timestamp_becomes_utc(self):
        raw = [{'timestamp': datetime(2024, 1, 1, 12, 0), 'sender': 'A', 'content': 'hi'}]
        result = normalize_messages(raw)
        self.assertIsNotNone(result[0]['timestamp'].tzinfo)

    def test_missing_sender_defaults_to_unknown(self):
        raw = [{'timestamp': None, 'content': 'hello'}]
        result = normalize_messages(raw)
        self.assertEqual(result[0]['sender'], 'Unknown')

    def test_missing_content_defaults_to_empty_string(self):
        raw = [{'timestamp': None, 'sender': 'Bob'}]
        result = normalize_messages(raw)
        self.assertEqual(result[0]['content'], '')


# ---------------------------------------------------------------------------
# Analysis pipeline — persistence of new fields
# ---------------------------------------------------------------------------

class AnalysisPipelinePersistenceTests(TestCase):
    """Tests that run_analysis_pipeline persists AnalyzedEvent with new fields."""

    def _make_evidence(self):
        """Create a minimal ForensicEvidence-like stub via the real model."""
        from django.contrib.auth import get_user_model
        from evidence.models import ForensicEvidence

        User = get_user_model()
        user = User.objects.create_user(username='testuser', password='pw')
        ev = ForensicEvidence.__new__(ForensicEvidence)
        ev.user = user
        ev.file_hash = 'a' * 64
        # We store a fake file attr to avoid full media stack.
        ev.file = None
        ev.pk = None
        # Bypass file-hash logic by setting hash directly then saving bare.
        ev.save = lambda *a, **kw: None  # stub out save for evidence
        ev.pk = 1  # fake pk
        return ev

    def _make_real_evidence(self):
        """Create a real ForensicEvidence row using raw DB insert."""
        from django.contrib.auth import get_user_model
        from evidence.models import ForensicEvidence, AnalyzedEvent
        User = get_user_model()
        user, _ = User.objects.get_or_create(username='pipetest')
        # Use raw SQL to create a minimal ForensicEvidence row.
        from django.db import connection
        with connection.cursor() as cur:
            cur.execute(
                "INSERT INTO evidence_forensicevidence"
                " (user_id, file, file_hash, upload_date)"
                " VALUES (%s, %s, %s, datetime('now'))",
                [user.pk, 'evidence_files/test.txt', 'b' * 64],
            )
            ev_id = cur.lastrowid
        return ForensicEvidence.objects.get(pk=ev_id)

    def test_new_identifier_fields_persisted(self):
        """Pipeline should store sender_id, conversation_id, message_id, source_platform."""
        from evidence.models import AnalyzedEvent

        ev = self._make_real_evidence()

        raw = [
            {
                'timestamp': datetime(2024, 1, 15, 12, 0, tzinfo=timezone.utc),
                'sender': 'Abuser',
                'content': 'You are worthless and I will isolate you.',
                'sender_id': 'user-42',
                'conversation_id': 'conv-99',
                'message_id': 'msg-001',
                'source_platform': 'whatsapp',
            }
        ]
        events = run_analysis_pipeline(raw, ev)
        self.assertEqual(len(events), 1)
        saved = AnalyzedEvent.objects.get(pk=events[0].pk)
        self.assertEqual(saved.sender_id, 'user-42')
        self.assertEqual(saved.conversation_id, 'conv-99')
        self.assertEqual(saved.message_id, 'msg-001')
        self.assertEqual(saved.source_platform, 'whatsapp')
        self.assertFalse(saved.is_verified)

    def test_unflagged_messages_not_persisted(self):
        """Benign messages (severity==1) should not create AnalyzedEvent rows."""
        from evidence.models import AnalyzedEvent

        ev = self._make_real_evidence()
        raw = [
            {
                'timestamp': datetime(2024, 1, 15, 12, 0, tzinfo=timezone.utc),
                'sender': 'Alice',
                'content': 'Hi, how are you doing today?',
            }
        ]
        events = run_analysis_pipeline(raw, ev)
        self.assertEqual(len(events), 0)

    def test_context_notes_populated_for_flagged(self):
        """Auto-generated context notes should be non-empty for flagged messages."""
        ev = self._make_real_evidence()
        raw = [
            {
                'timestamp': datetime(2024, 1, 15, 12, 0, tzinfo=timezone.utc),
                'sender': 'X',
                'content': 'I will take the kids and you will never see them.',
            }
        ]
        events = run_analysis_pipeline(raw, ev)
        self.assertTrue(len(events) > 0)
        self.assertIn('[Auto]', events[0].user_context_notes)

    def test_new_fields_blank_by_default(self):
        """New identifier fields default to blank when not provided by parser."""
        from evidence.models import AnalyzedEvent

        ev = self._make_real_evidence()
        raw = [
            {
                'timestamp': datetime(2024, 1, 15, 12, 0, tzinfo=timezone.utc),
                'sender': 'X',
                'content': 'You are worthless and I will isolate you.',
            }
        ]
        events = run_analysis_pipeline(raw, ev)
        self.assertEqual(len(events), 1)
        saved = AnalyzedEvent.objects.get(pk=events[0].pk)
        self.assertEqual(saved.sender_id, '')
        self.assertEqual(saved.conversation_id, '')
        self.assertEqual(saved.message_id, '')
        self.assertEqual(saved.source_platform, '')
