# Architecture Overview

A technical reference for developers and contributors who want to understand how the codebase is structured and how its components fit together.

---

## Contents

1. [Repository Layout](#1-repository-layout)
2. [Django Project Structure](#2-django-project-structure)
3. [Data Flow: Upload → Analysis → Timeline](#3-data-flow-upload--analysis--timeline)
4. [Key Components](#4-key-components)
5. [Database Schema](#5-database-schema)
6. [Parser Architecture](#6-parser-architecture)
7. [Settings and Configuration](#7-settings-and-configuration)
8. [Running Tests](#8-running-tests)
9. [Adding a New Parser](#9-adding-a-new-parser)

---

## 1. Repository Layout

```
acts-of-abuse-anlysis/
├── manage.py                   # Django management entry point
├── requirements.txt            # Python dependencies
├── README.md                   # Quick-start reference
├── LICENSE                     # Sole-proprietor licence
├── docs/                       # ← You are here
│   ├── VISION.md
│   ├── USAGE.md
│   ├── ARCHITECTURE.md
│   ├── ANALYSIS_ENGINE.md
│   ├── PARSERS.md
│   ├── SECURITY.md
│   ├── LEGAL.md
│   ├── PRIVACY.md
│   └── SPREAD_THE_WORD.md
├── forensic_tool/              # Primary Django project package
│   ├── settings.py             # Hardened settings (env-var SECRET_KEY, security headers)
│   ├── urls.py
│   └── wsgi.py / asgi.py
├── config/                     # Alternative Django project scaffold (not active)
└── evidence/                   # Core Django application
    ├── models.py               # ForensicEvidence + AnalyzedEvent
    ├── admin.py                # Admin registrations
    ├── apps.py
    ├── ingestion.py            # Hash computation + platform detection + parser dispatch
    ├── analysis_engine.py      # CoerciveControlEngine (3 Duluth wheels + DARVO)
    ├── analysis_pipeline.py    # Orchestration: ingest → analyse → persist
    ├── file_security.py        # Upload scanner (magic bytes + injection patterns)
    ├── normalization.py        # Text normalisation helpers
    ├── views.py                # generate_timeline() (Plotly)
    ├── tests.py                # 49 unit + integration tests
    ├── migrations/
    │   ├── 0001_initial.py
    │   └── 0002_alter_analyzedevent_is_verified_and_more.py
    └── parsers/                # evidence.parsers namespace
        ├── __init__.py
        ├── whatsapp.py
        ├── facebook.py
        ├── discord.py
        ├── pdf.py
        └── generic.py
```

---

## 2. Django Project Structure

The active Django project is **`forensic_tool/`**. `config/` is a legacy scaffold and is not used by default.

```
DJANGO_SETTINGS_MODULE = forensic_tool.settings
```

Settings are hardened:
- `SECRET_KEY` is read from the `SECRET_KEY` environment variable (never hard-coded).
- `DEBUG = False` in production.
- Standard security headers (`SECURE_BROWSER_XSS_FILTER`, `X_FRAME_OPTIONS`, etc.) are enabled.

---

## 3. Data Flow: Upload → Analysis → Timeline

```
User uploads file via Django admin
          │
          ▼
   file_security.validate_file_content()
   ┌─ Layer 1: magic-byte check (first 8 bytes)
   └─ Layer 2: injection-pattern scan (.txt / .json)
          │
          ▼ (file accepted)
   ForensicEvidence.save()
   └─ SHA-256 hash computed and stored (chain of custody)
          │
          ▼
   ingestion.process_upload(file_path)
   ├─ _detect_json_platform()  ← for .json files
   ├─ platform = 'whatsapp'    ← for .txt files
   ├─ platform = 'pdf'         ← for .pdf files
   └─ import_parser(platform)  ← whitelist-validated dynamic import
          │
          ▼
   parser.extract_data(file_path)
   └─ returns list of {timestamp, sender, content} dicts
          │
          ▼
   analysis_pipeline  (per message)
   └─ CoerciveControlEngine.analyze_message(content)
      ├─ Post-Separation Power & Control wheel
      ├─ Post-Separation Economic Abuse wheel
      ├─ Child Abuse wheel
      ├─ DARVO detection
      └─ Systemic/Institutional abuse detection
          │
          ▼
   AnalyzedEvent saved to database
   (is_verified = False by default)
          │
          ▼
   Human reviewer opens admin
   └─ Reviews flags, adds context notes, sets is_verified = True
          │
          ▼
   generate_timeline(verified_events)
   └─ Plotly scatter plot (Time × Severity × Sender)
```

---

## 4. Key Components

### `evidence/models.py` — Data models

| Model | Purpose |
|-------|---------|
| `ForensicEvidence` | One record per uploaded file. Stores file, SHA-256 hash, upload date, and user FK. Auto-computes hash on first save. |
| `AnalyzedEvent` | One record per extracted message/event. Stores sender, timestamp, content, severity, verification status, and context notes. |

### `evidence/ingestion.py` — Ingestion pipeline

| Function | Purpose |
|----------|---------|
| `compute_file_hash(file_path)` | SHA-256 hash with 64 KB streaming chunks. |
| `import_parser(platform_name)` | Whitelist-validated dynamic import via `importlib`. |
| `_detect_json_platform(file_path)` | Inspects JSON structure to distinguish Facebook from Discord exports. |
| `process_upload(file_path)` | Orchestrates platform detection → parser dispatch → `extract_data()`. |

### `evidence/analysis_engine.py` — Pattern matching

| Class / Method | Purpose |
|----------------|---------|
| `CoerciveControlEngine` | Holds all keyword lists for the three Duluth wheels, DARVO, and systemic abuse. |
| `_match_wheel(wheel, text_lower)` | Fuzzy partial-ratio match across a single wheel dict. |
| `analyze_message(text)` | Returns full results dict including `all_flags` cross-reference. |

### `evidence/file_security.py` — Upload security

| Layer | What it checks |
|-------|----------------|
| Magic-byte detection | First 8 bytes against PE, ELF, Mach-O, and shebang signatures. |
| Injection-pattern scan | 12 regex patterns covering XSS, JavaScript URLs, eval/exec, SQL injection, and prototype pollution. |

### `evidence/views.py` — Visualisation

| Function | Purpose |
|----------|---------|
| `generate_timeline(case_events)` | Creates Plotly Express scatter plot of verified events only. Returns HTML string. |

---

## 5. Database Schema

### `ForensicEvidence`

| Column | Type | Notes |
|--------|------|-------|
| `id` | AutoField | Primary key |
| `user_id` | FK → AUTH_USER_MODEL | Cascade delete |
| `file` | FileField | `upload_to='evidence_files/'`; validators: extension, size, content |
| `file_hash` | CharField(64) | SHA-256 hex; unique + db_index |
| `upload_date` | DateTimeField | `auto_now_add=True` |

### `AnalyzedEvent`

| Column | Type | Notes |
|--------|------|-------|
| `id` | AutoField | Primary key |
| `evidence_id` | FK → ForensicEvidence | Cascade delete |
| `timestamp` | DateTimeField | `null=True, blank=True, db_index=True` |
| `sender` | CharField(255) | |
| `content` | TextField | Full message text |
| `severity_score` | IntegerField | 1–4; validated by Min/MaxValueValidator |
| `sender_id` | CharField(255) | Platform user ID; blank=True |
| `conversation_id` | CharField(255) | blank=True |
| `message_id` | CharField(255) | blank=True |
| `source_platform` | CharField(64) | blank=True |
| `is_verified` | BooleanField | default=False; db_index=True |
| `user_context_notes` | TextField | blank=True |

---

## 6. Parser Architecture

All parsers live under `evidence/parsers/` and must implement a single interface:

```python
def extract_data(file_path: str) -> list[dict]:
    """
    Parse the file at file_path and return a list of message dicts.
    Each dict must contain at minimum:
        {
            'timestamp': datetime | None,
            'sender':    str,
            'content':   str,
        }
    """
```

Platform detection and parser dispatch happens in `ingestion.process_upload()`. The parser whitelist is defined as:

```python
_ALLOWED_PARSERS = frozenset({'whatsapp', 'facebook', 'discord', 'pdf', 'generic'})
```

See [Parsers Reference](PARSERS.md) for full details on each parser and how to add a new one.

---

## 7. Settings and Configuration

| Setting | Where set | Notes |
|---------|-----------|-------|
| `SECRET_KEY` | Environment variable | Never commit to source control |
| `DEBUG` | `forensic_tool/settings.py` | Must be `False` in production |
| `DATABASES` | `forensic_tool/settings.py` | SQLite by default; swap for PostgreSQL in production |
| `MEDIA_ROOT` | `forensic_tool/settings.py` | Where uploaded evidence files are stored |
| `ALLOWED_HOSTS` | `forensic_tool/settings.py` | Set to your domain in production |

---

## 8. Running Tests

```bash
python manage.py test evidence
```

The test suite covers:
- SHA-256 hash computation
- All five parsers
- Ingestion pipeline (platform detection, parser whitelist)
- Analysis engine (all three wheels, DARVO, institutional abuse, severity scoring)
- File security scanner (magic bytes, injection patterns)
- Timeline generation (verified events only, empty-state fallback)

---

## 9. Adding a New Parser

1. Create `evidence/parsers/<platform>.py` implementing `extract_data(file_path)`.
2. Add the platform name to `_ALLOWED_PARSERS` in `evidence/ingestion.py`.
3. Register the module in `evidence/parsers/__init__.py`.
4. Add an extension mapping in `ingestion.process_upload()` if needed.
5. Write tests in `evidence/tests.py`.

See [Parsers Reference](PARSERS.md) for a full walkthrough.

---

## See Also

- [How to Use the App](USAGE.md)
- [Analysis Engine Reference](ANALYSIS_ENGINE.md)
- [Parsers Reference](PARSERS.md)
- [Security Policy](SECURITY.md)
