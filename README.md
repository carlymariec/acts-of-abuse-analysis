# Acts-of-Abuse Analysis Tool

A private Django-based forensic analysis tool for documenting coercive control,
DARVO (Deny, Attack, Reverse Victim and Offender), and institutional/systems abuse.

> ⚠️ **Private use only.** See [`LICENSE`](LICENSE) for terms.

📚 **[Full documentation is in the `docs/` folder →](docs/README.md)**

---

## Features

| Module | Description |
|--------|-------------|
| `evidence/models.py` | `ForensicEvidence` (uploaded file + SHA-256 chain-of-custody, auto-hashed on save, file-type + size + security validators) and `AnalyzedEvent` (parsed message with severity 1-4, human-in-the-loop `is_verified` flag) |
| `evidence/file_security.py` | Magic-byte detection (PE/ELF/Mach-O/shebang) + injection-pattern scan (XSS/eval/SQL/prototype-pollution) applied to every upload |
| `evidence/parsers/` | Modular parsers for WhatsApp, Facebook Messenger, Discord, PDF, and generic text exports — each exposes `extract_data(file_path)` |
| `evidence/ingestion.py` | SHA-256 hash computation; auto-detects platform from JSON structure or extension; validates parser name against `_ALLOWED_PARSERS` whitelist |
| `evidence/analysis_engine.py` | `CoerciveControlEngine` – fuzzy keyword analysis across three Duluth model wheels (Post-Separation Power & Control, Economic Abuse, Child Abuse), DARVO detection, and systemic/institutional abuse scoring; returns `all_flags` cross-reference list |
| `evidence/views.py` | `generate_timeline()` – Plotly Express interactive HTML timeline of verified events only (null timestamps filtered out; empty-state fallback) |
| `evidence/tests.py` | 49 tests covering all modules: hash, parsers, ingestion, analysis engine, file scanner, timeline |

---

## Local Development Setup

### 1. Prerequisites

- Python 3.11 or later
- `pip`

### 2. Clone and install dependencies

```bash
git clone https://github.com/Carlymarie992/acts-of-abuse-anlysis.git
cd acts-of-abuse-anlysis
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Initialize the database

```bash
python manage.py migrate
python manage.py createsuperuser
```

### 4. Run the development server

```bash
python manage.py runserver
```

Open <http://127.0.0.1:8000/admin/> in your browser and log in with the superuser credentials.

### 5. Verify the setup

```bash
python manage.py check
```

You should see **System check identified no issues**.

---

## iPad + Working Copy Workflow

[Working Copy](https://workingcopyapp.com/) is a Git client for iOS/iPadOS.

1. **Clone** the repository in Working Copy using the HTTPS URL.
2. Edit files using Working Copy's built-in editor or an external editor (e.g. *Textastic*, *GoCoEdit*).
3. **Commit** changes directly in Working Copy.
4. **Push** to GitHub – Working Copy handles authentication via OAuth or SSH key.
5. Pull requests can be raised on [github.com](https://github.com) in Mobile Safari.

> Tip: use *Shortcuts* on iPad to automate "pull → edit → commit → push" sequences.

---

## Project Structure

```
acts-of-abuse-anlysis/
├── manage.py
├── requirements.txt
├── README.md
├── LICENSE                  # Sole-proprietor licence 2024-2026
├── config/                  # Alternative Django project package (scaffold)
│   ├── settings.py
│   └── ...
├── forensic_tool/           # Primary Django project package
│   ├── settings.py          # Hardened: env-var SECRET_KEY, production security headers
│   ├── urls.py
│   └── ...
└── evidence/                # Django app
    ├── models.py            # ForensicEvidence + AnalyzedEvent (hardened)
    ├── admin.py             # Both models registered
    ├── ingestion.py         # SHA-256 hash + platform detection + parser whitelist
    ├── analysis_engine.py   # CoerciveControlEngine (3 Duluth wheels + DARVO)
    ├── file_security.py     # Magic-byte + injection-pattern upload scanner
    ├── views.py             # generate_timeline() (Plotly, verified events only)
    ├── tests.py             # 49 tests
    ├── migrations/
    │   ├── 0001_initial.py
    │   └── 0002_alter_analyzedevent_is_verified_and_more.py
    └── parsers/             # Stub package (evidence/parsers/)
        └── ...
```

---

## Adding a New Parser

1. Create `evidence/parsers/<platform>.py` and implement `extract_data(file_path: str) -> list`.
2. Register the module path in `evidence/parsers/__init__.py` under `PLATFORM_PARSERS`.
3. Add any required extension mapping in `evidence/ingestion._EXTENSION_MAP`.

