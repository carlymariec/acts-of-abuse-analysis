# Acts-of-Abuse Analysis Tool

A private Django-based forensic analysis tool for documenting coercive control,
DARVO (Deny, Attack, Reverse Victim and Offender), and institutional/systems abuse.

> ⚠️ **Private use only.** See [`LICENSE`](LICENSE) for terms.  
> Replace the `LICENSE` placeholder with your own proprietary licence before distributing.

---

## Features

| Module | Description |
|--------|-------------|
| `evidence/models.py` | `ForensicEvidence` (uploaded file + SHA-256) and `AnalyzedEvent` (parsed message with severity) |
| `evidence/parsers/` | Modular parsers for WhatsApp, Facebook, Discord, PDF, and generic text exports |
| `evidence/ingestion.py` | Auto-detects platform and delegates to the correct parser |
| `evidence/analysis_engine.py` | `CoerciveControlEngine` – fuzzy keyword analysis using *thefuzz* |
| `evidence/views.py` | `generate_timeline()` – Plotly Express interactive HTML timeline of verified events |

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

### 3. Initialise the database

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
├── LICENSE                  # ← replace with your licence
├── config/                  # Django project package
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
└── evidence/                # Django app
    ├── __init__.py
    ├── apps.py
    ├── models.py
    ├── admin.py
    ├── ingestion.py
    ├── analysis_engine.py
    ├── views.py
    ├── migrations/
    │   └── __init__.py
    └── parsers/
        ├── __init__.py
        ├── whatsapp.py
        ├── facebook.py
        ├── discord.py
        ├── pdf.py
        └── generic.py
```

---

## Adding a New Parser

1. Create `evidence/parsers/<platform>.py` and implement `extract_data(file_path: str) -> list`.
2. Register the module path in `evidence/parsers/__init__.py` under `PLATFORM_PARSERS`.
3. Add any required extension mapping in `evidence/ingestion._EXTENSION_MAP`.

