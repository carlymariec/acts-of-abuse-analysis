"""
evidence/file_security.py
~~~~~~~~~~~~~~~~~~~~~~~~~
Upload-time safety scanning for evidence files.

Two layers of protection are applied:

1. **Magic-byte detection** — inspects the first 8 bytes of every upload for
   known executable/script file signatures (PE, ELF, Mach-O, shell shebang).
   These file types are categorically rejected regardless of their extension.

2. **Injection-pattern scan** — scans the full text content of .txt and .json
   files for common attack payloads: XSS (<script>), javascript:/vbscript:
   URLs, inline event handlers, eval()/exec() calls, Python __import__(),
   SQL injection (DROP TABLE / DELETE FROM / UNION SELECT), and prototype-
   pollution patterns (__proto__, constructor[]).

Usage: add `validate_file_content` to the `validators=` list of a FileField.
"""
import re

from django.core.exceptions import ValidationError

# ---------------------------------------------------------------------------
# Magic-byte signatures that are never acceptable in evidence uploads.
# Each entry is (byte_prefix, human_readable_description).
# ---------------------------------------------------------------------------
_BLOCKED_SIGNATURES = [
    (b'\x4d\x5a',         'Windows executable (PE / .exe / .dll)'),
    (b'\x7fELF',          'Linux/Unix ELF executable'),
    (b'\xca\xfe\xba\xbe', 'macOS Mach-O fat binary'),
    (b'\xfe\xed\xfa\xce', 'macOS Mach-O 32-bit binary'),
    (b'\xfe\xed\xfa\xcf', 'macOS Mach-O 64-bit binary'),
    (b'#!/',              'shell/interpreter script (shebang)'),
]

# ---------------------------------------------------------------------------
# Injection patterns for text-based evidence files (.txt, .json).
# Each entry is (compiled_regex, human_readable_description).
# ---------------------------------------------------------------------------
_INJECTION_PATTERNS = [
    (re.compile(r'<script[\s>/]', re.IGNORECASE),          'embedded <script> tag (XSS)'),
    (re.compile(r'javascript\s*:',  re.IGNORECASE),        'javascript: URL (XSS)'),
    (re.compile(r'vbscript\s*:',    re.IGNORECASE),        'vbscript: URL'),
    (re.compile(r'on\w+\s*=\s*["\']', re.IGNORECASE),     'inline DOM event handler (e.g. onclick=)'),
    (re.compile(r'\beval\s*\(',     re.IGNORECASE),        'eval() call'),
    (re.compile(r'\bexec\s*\(',     re.IGNORECASE),        'exec() call'),
    (re.compile(r'__import__\s*\(', re.IGNORECASE),        'Python __import__() injection'),
    (re.compile(r';\s*DROP\s+TABLE',  re.IGNORECASE),      'SQL DROP TABLE injection'),
    (re.compile(r';\s*DELETE\s+FROM', re.IGNORECASE),      'SQL DELETE FROM injection'),
    (re.compile(r'\bUNION\s+SELECT\b', re.IGNORECASE),     'SQL UNION SELECT injection'),
    (re.compile(r'__proto__',        re.IGNORECASE),       'prototype pollution (__proto__)'),
    (re.compile(r'constructor\s*\[', re.IGNORECASE),       'prototype pollution (constructor[])'),
]

# Maximum bytes read for the injection scan (4 MB).  Prevents memory exhaustion
# on very large files while still catching payloads at the top of a file.
_SCAN_LIMIT_BYTES = 4 * 1024 * 1024


def validate_file_content(file):
    """
    Django FileField validator — rejects evidence uploads that contain
    dangerous executable signatures or known injection payloads.

    Raises ``ValidationError`` with a descriptive message if a threat is found.
    """
    # ------------------------------------------------------------------
    # Layer 1: magic-byte check (first 8 bytes)
    # ------------------------------------------------------------------
    file.seek(0)
    header = file.read(8)
    file.seek(0)

    for signature, description in _BLOCKED_SIGNATURES:
        if header.startswith(signature):
            raise ValidationError(
                f"Uploaded file was rejected: dangerous file type detected "
                f"({description}). Only plain-text (.txt), JSON (.json), and "
                f"PDF (.pdf) evidence exports are accepted."
            )

    # ------------------------------------------------------------------
    # Layer 2: injection-pattern scan (text / JSON files only)
    # ------------------------------------------------------------------
    file_name = getattr(file, 'name', '') or ''
    if file_name.lower().endswith(('.txt', '.json')):
        file.seek(0)
        try:
            raw = file.read(_SCAN_LIMIT_BYTES)
            content = raw.decode('utf-8', errors='replace')
        finally:
            file.seek(0)

        for pattern, description in _INJECTION_PATTERNS:
            if pattern.search(content):
                raise ValidationError(
                    f"Uploaded file was rejected: potentially malicious content "
                    f"detected ({description}). Please review the file and "
                    f"remove any scripting or injection payloads before uploading."
                )
