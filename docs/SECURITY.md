# Security Policy

This document describes the security architecture of Acts of Abuse Analysis, how to report a vulnerability, and the responsibilities of anyone running an instance of this software.

---

## Contents

1. [Security Philosophy](#1-security-philosophy)
2. [Upload Security (File Scanning)](#2-upload-security-file-scanning)
3. [Forensic Chain of Custody](#3-forensic-chain-of-custody)
4. [Injection and Tampering Prevention](#4-injection-and-tampering-prevention)
5. [Authentication and Access Control](#5-authentication-and-access-control)
6. [Django Hardening](#6-django-hardening)
7. [Parser Whitelist](#7-parser-whitelist)
8. [Human-in-the-Loop Verification](#8-human-in-the-loop-verification)
9. [Data Storage](#9-data-storage)
10. [Responsible Disclosure](#10-responsible-disclosure)
11. [Supported Versions](#11-supported-versions)

---

## 1. Security Philosophy

This tool handles highly sensitive evidence related to domestic abuse and coercive control. Any security failure could:

- Expose private communications to an abuser.
- Allow evidence to be tampered with, invalidating it in legal proceedings.
- Put a survivor's safety at risk.

Security is therefore treated as a first-class concern, not an afterthought. Every layer of the system — from file upload to data display — includes explicit safety controls.

---

## 2. Upload Security (File Scanning)

Every uploaded file passes through a two-layer scanner (`evidence/file_security.py`) **before** it touches the database.

### Layer 1: Magic-byte detection

The first 8 bytes of every file are checked against known executable signatures:

| Signature | Blocked file type |
|-----------|------------------|
| `\x4d\x5a` | Windows executable (PE / .exe / .dll) |
| `\x7fELF` | Linux/Unix ELF executable |
| `\xca\xfe\xba\xbe` | macOS Mach-O fat binary |
| `\xfe\xed\xfa\xce` | macOS Mach-O 32-bit binary |
| `\xfe\xed\xfa\xcf` | macOS Mach-O 64-bit binary |
| `#!/` | Shell/interpreter script (shebang) |

These types are rejected regardless of their file extension. Renaming a `.exe` to `.txt` does not bypass this check.

### Layer 2: Injection-pattern scan

Text-based uploads (`.txt` and `.json`) are scanned for 12 known attack patterns:

| Pattern | Attack type |
|---------|------------|
| `<script>` tags | Cross-site scripting (XSS) |
| `javascript:` URLs | XSS via URL |
| `vbscript:` URLs | XSS via URL |
| Inline DOM event handlers (`onclick=`, etc.) | XSS |
| `eval()` calls | Code injection |
| `exec()` calls | Code injection |
| `__import__()` | Python code injection |
| `; DROP TABLE` | SQL injection |
| `; DELETE FROM` | SQL injection |
| `UNION SELECT` | SQL injection |
| `__proto__` | Prototype pollution |
| `constructor[]` | Prototype pollution |

Up to 4 MB of each file is scanned. If any pattern is found, the upload is rejected with a descriptive error message.

---

## 3. Forensic Chain of Custody

Every uploaded file receives a **SHA-256 hash** the moment it is saved to the database. The hash is:

- Computed using 64 KB streaming chunks (constant memory usage for large files).
- Stored in `ForensicEvidence.file_hash` (unique, indexed).
- Used to detect any subsequent tampering with the stored file.

To verify the integrity of all stored evidence:

```python
from evidence.models import ForensicEvidence
from evidence.ingestion import compute_file_hash

for ev in ForensicEvidence.objects.all():
    current = compute_file_hash(ev.file.path)
    status = "OK" if current == ev.file_hash else "HASH MISMATCH — possible tampering"
    print(f"[{status}] {ev.file.name}")
```

A hash mismatch means the file on disk no longer matches the file that was originally uploaded. This should be investigated immediately.

The uniqueness constraint on `file_hash` also prevents the same file from being uploaded twice, eliminating duplicate evidence records.

---

## 4. Injection and Tampering Prevention

In addition to the upload scanner:

- **Parser whitelist:** `import_parser()` validates the platform name against a `frozenset` of allowed parser names before calling `importlib.import_module`. Arbitrary module names cannot be loaded.
- **File extension whitelist:** Only `.txt`, `.json`, and `.pdf` extensions are accepted, enforced by Django's `FileExtensionValidator`.
- **File size limit:** Uploads are capped at 50 MB to prevent resource exhaustion.

---

## 5. Authentication and Access Control

- All evidence is linked to a Django `User` via a ForeignKey. Users can only see their own evidence.
- The Django admin is the primary interface. Only superusers have access.
- **You should create a strong, unique password** for your superuser account and not reuse it anywhere else.
- Never share your admin credentials with anyone.

---

## 6. Django Hardening

The `forensic_tool/settings.py` configuration includes:

- `SECRET_KEY` read from an environment variable — never hard-coded.
- `DEBUG = False` in production.
- Standard HTTP security headers:
  - `SECURE_BROWSER_XSS_FILTER`
  - `X_FRAME_OPTIONS = 'DENY'`
  - `SECURE_CONTENT_TYPE_NOSNIFF`
  - `CSRF_COOKIE_HTTPONLY`
  - `SESSION_COOKIE_HTTPONLY`

### Production deployment checklist

Before deploying to any server accessible over a network:

- [ ] Set `DEBUG = False`.
- [ ] Set a strong `SECRET_KEY` environment variable.
- [ ] Set `ALLOWED_HOSTS` to your domain name only.
- [ ] Serve over HTTPS only (set `SECURE_SSL_REDIRECT = True`, `SESSION_COOKIE_SECURE = True`, `CSRF_COOKIE_SECURE = True`).
- [ ] Use a production-grade database (PostgreSQL) not SQLite.
- [ ] Store `MEDIA_ROOT` outside the web-server's document root.
- [ ] Run behind a reverse proxy (nginx, Caddy) — never expose `manage.py runserver` to the internet.

---

## 7. Parser Whitelist

See [Parsers Reference — Parser Whitelist](PARSERS.md#7-parser-whitelist).

---

## 8. Human-in-the-Loop Verification

The analysis engine produces flags automatically, but **no event is presented as verified evidence until a human reviewer marks it as such** by setting `is_verified = True`. This design ensures:

- No false positive can appear in a timeline or report without human confirmation.
- The survivor, not the algorithm, remains the expert on their own situation.
- Any errors in the analysis engine are caught before they reach a legal proceeding.

---

## 9. Data Storage

- Uploaded evidence files are stored in `MEDIA_ROOT/evidence_files/`.
- The database stores the SHA-256 hash, metadata, and extracted text — not a copy of the original file.
- **Back up both the database and `MEDIA_ROOT` regularly.** Loss of either breaks the chain-of-custody verification.
- Store backups in an encrypted location that the abuser cannot access.

---

## 10. Responsible Disclosure

If you discover a security vulnerability in this project:

1. **Do not open a public GitHub issue** — this could expose the vulnerability before it is fixed.
2. Contact the repository owner privately via the email address listed on their GitHub profile.
3. Include a description of the vulnerability, steps to reproduce, and any proof-of-concept.
4. Allow reasonable time for a fix before public disclosure.

---

## 11. Supported Versions

Only the latest commit on the `main` branch receives security fixes. If you are running an older version, update to `main`.

---

## See Also

- [Architecture Overview](ARCHITECTURE.md)
- [Legal Notices](LEGAL.md)
- [Privacy Policy](PRIVACY.md)
- [How to Use the App](USAGE.md)
