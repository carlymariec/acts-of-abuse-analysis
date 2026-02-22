import hashlib
import json
import os
import tempfile
from datetime import datetime

from django.test import TestCase

from evidence.analysis_engine import CoerciveControlEngine
from evidence.ingestion import compute_file_hash, import_parser, process_upload
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
        self.assertTrue(len(r['child_abuse_flags']) > 0)

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
