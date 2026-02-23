# How to Use Acts of Abuse Analysis

This guide walks you through every step, from first install to generating a verified timeline report.

---

## Contents

1. [First-Time Setup](#1-first-time-setup)
2. [Uploading Evidence Files](#2-uploading-evidence-files)
3. [Reviewing Analyzed Events](#3-reviewing-analyzed-events)
4. [Verifying Events (Human-in-the-Loop)](#4-verifying-events-human-in-the-loop)
5. [Generating a Timeline](#5-generating-a-timeline)
6. [Adding Context Notes](#6-adding-context-notes)
7. [Supported File Formats](#7-supported-file-formats)
8. [Using on iPad (Working Copy)](#8-using-on-ipad-working-copy)
9. [Exporting Your Data](#9-exporting-your-data)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. First-Time Setup

### Prerequisites

- Python 3.11 or later
- `pip` (comes with Python)
- A terminal / command prompt

### Install

```bash
git clone https://github.com/Carlymarie992/acts-of-abuse-anlysis.git
cd acts-of-abuse-anlysis
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Initialise the database

```bash
python manage.py migrate
python manage.py createsuperuser   # choose a strong username + password
```

### Start the server

```bash
python manage.py runserver
```

Open **http://127.0.0.1:8000/admin/** and log in with the superuser credentials you just created.

> **Security note:** The development server is for local use only. Never expose it to the internet without a proper production deployment (HTTPS, `DEBUG=False`, reverse proxy).

---

## 2. Uploading Evidence Files

Evidence is uploaded through the Django admin at **Evidence → Forensic evidence → Add**.

| Field | What to enter |
|-------|---------------|
| **User** | Your superuser account |
| **File** | Export file from the supported platform (see [§7](#7-supported-file-formats)) |
| **File hash** | Leave blank — the SHA-256 hash is computed automatically on save |

Once you click **Save**, the tool:

1. Validates the file type and size (≤ 50 MB, `.txt` / `.json` / `.pdf` only).
2. Scans for malicious content (executable signatures, injection payloads).
3. Computes and stores the SHA-256 hash for chain-of-custody.
4. Runs the ingestion pipeline to extract individual messages/events.
5. Runs the `CoerciveControlEngine` analysis on each extracted message.
6. Creates `AnalyzedEvent` records for every message that contains a pattern match.

---

## 3. Reviewing Analyzed Events

Navigate to **Evidence → Analyzed events** in the admin.

Each event shows:

| Column | Meaning |
|--------|---------|
| **Sender** | Who sent the message (extracted from the file) |
| **Timestamp** | When the message was sent (if available) |
| **Content** | The full message text |
| **Severity score** | 1 = Low, 2 = Moderate, 3 = High, 4 = Critical |
| **Source platform** | WhatsApp / Facebook / Discord / PDF / Generic |
| **Is verified** | ✗ = awaiting your review, ✓ = you have confirmed this event |
| **User context notes** | Your personal annotation |

Use the **filter sidebar** to narrow events by:
- Severity score
- Verification status
- Source platform
- Date range

---

## 4. Verifying Events (Human-in-the-Loop)

> The tool flags *potential* patterns. Only you know your situation. Verification is your confirmation that the flagged content accurately reflects what happened.

To verify an event:

1. Open the event record.
2. Read the **Content** and the analysis flags shown.
3. If the flag is accurate, tick **Is verified** and click **Save**.
4. Optionally add a note in **User context notes** explaining why this event is significant (e.g. *"This text was sent one hour after the court hearing, violating the no-contact order"*).

Only verified events appear in the timeline.

### What the analysis engine flags

The engine checks every message against three Duluth model wheels and additional tactics:

| Flag type | Examples |
|-----------|---------|
| **Post-Separation Power & Control** | Coercion & Threats, Intimidation, Emotional Abuse, Isolation, Minimizing/Denying/Blaming, Legal System Abuse, Stalking & Harassment, Using Children as Pawns |
| **Post-Separation Economic Abuse** | Sabotaging Employment, Withholding Financial Support, Controlling Assets, Ruining Credit |
| **Child Abuse Wheel** | Visitation Manipulation, Using Children as Messengers, Undermining Parenting, Direct Harm or Neglect |
| **DARVO** | Deny, Attack, Reverse Victim and Offender |
| **Systemic / Institutional Abuse** | Mentions of CPS, court, judge, police, social worker in a coercive context |

See the [Analysis Engine Reference](ANALYSIS_ENGINE.md) for the full keyword lists.

---

## 5. Generating a Timeline

The `generate_timeline()` function in `evidence/views.py` creates an interactive Plotly scatter plot:

- **X axis** — time
- **Y axis** — severity score (1–4)
- **Colour** — sender (different colours for different abusers / institutions)
- **Hover** — your context notes

To generate a timeline in code:

```python
from evidence.models import AnalyzedEvent
from evidence.views import generate_timeline

events = AnalyzedEvent.objects.filter(evidence__user=request.user)
html = generate_timeline(events)
# `html` is a self-contained HTML string you can save or render in a template
```

The timeline automatically excludes:
- Events where `is_verified = False`
- Events with no timestamp

---

## 6. Adding Context Notes

Context notes are your voice in the record. Use them to:

- Explain the background of a specific message.
- Note which legal proceeding this evidence relates to.
- Record your emotional response at the time.
- Flag inconsistencies between what was said and what was done.

Notes are stored in `AnalyzedEvent.user_context_notes` and appear as hover tooltips on the timeline.

---

## 7. Supported File Formats

| Platform | File type | How to export |
|----------|-----------|---------------|
| **WhatsApp** | `.txt` | Open the chat → ⋮ → More → Export chat → Without media |
| **Facebook Messenger** | `.json` | facebook.com → Settings → Your Facebook Information → Download your information → Messages → JSON format |
| **Discord** | `.json` | Use [DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter) (open source), export to JSON |
| **PDF** | `.pdf` | Any PDF export of messages, emails, or court documents |
| **Generic** | `.txt` | Any plain-text file with one message per line; the parser attempts to extract sender names in `Name: message` format |

### Size limit

Maximum file size is **50 MB** per upload. Split larger exports into multiple files.

---

## 8. Using on iPad (Working Copy)

[Working Copy](https://workingcopyapp.com/) is a Git client for iOS/iPadOS that lets you manage this repository directly from your iPad.

1. Install Working Copy from the App Store.
2. Clone the repository using the HTTPS URL.
3. Edit files using Working Copy's built-in editor or link to an external editor (e.g. *Textastic*, *GoCoEdit*).
4. Commit and push changes directly from Working Copy.

> **Tip:** Use the iOS *Shortcuts* app to automate a "pull → edit → commit → push" workflow.

For running the Django server on iPad you will need a Python environment such as [Pyto](https://pyto.app/) or [a-Shell](https://holzschu.github.io/a-Shell_iOS/).

---

## 9. Exporting Your Data

### Export via Django admin

Django admin's built-in export options are limited. For a full CSV/JSON export, use Django's management shell:

```bash
python manage.py shell
```

```python
import json
from evidence.models import AnalyzedEvent

events = list(
    AnalyzedEvent.objects
    .filter(is_verified=True)
    .values(
        'timestamp', 'sender', 'content',
        'severity_score', 'source_platform',
        'user_context_notes',
    )
)
with open('/tmp/verified_events.json', 'w') as f:
    json.dump(events, f, indent=2, default=str)
print(f"Exported {len(events)} events")
```

### Chain-of-custody hash verification

To confirm that a file has not been tampered with since it was ingested:

```bash
python manage.py shell
```

```python
from evidence.models import ForensicEvidence
from evidence.ingestion import compute_file_hash

for ev in ForensicEvidence.objects.all():
    current_hash = compute_file_hash(ev.file.path)
    if current_hash == ev.file_hash:
        print(f"[OK]      {ev.file.name}")
    else:
        print(f"[WARNING] {ev.file.name} — hash mismatch! File may have been modified.")
```

---

## 10. Troubleshooting

### "System check identified issues"

Run `python manage.py check` and read the output. Common causes:
- Missing environment variable `SECRET_KEY` — set it in your shell or a `.env` file.
- Database not migrated — run `python manage.py migrate`.

### File upload rejected

The upload scanner will reject files that:
- Are not `.txt`, `.json`, or `.pdf`.
- Exceed 50 MB.
- Contain executable magic bytes (PE, ELF, Mach-O, shebang).
- Contain injection payloads (XSS, SQL injection, prototype pollution).

If a legitimate file is rejected, inspect it for hidden content (e.g. copy-paste from a web page into a `.txt` file can sometimes include HTML tags).

### Parser returns no events

- For WhatsApp: confirm the export uses the standard *"[date, time] Sender: message"* format. Older exports and some regional formats differ slightly.
- For Facebook: confirm the JSON file has top-level `participants` and `messages` keys.
- For Discord: confirm the JSON was exported with [DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter).
- For any format: try renaming to `.txt` and using the Generic parser.

### No events appear in timeline

- Ensure events have `is_verified = True` (tick the checkbox in admin and save).
- Ensure events have a non-null `timestamp`. PDF and generic events may lack timestamps.

---

## See Also

- [Project Vision & Mission](VISION.md)
- [Analysis Engine Reference](ANALYSIS_ENGINE.md)
- [Architecture Overview](ARCHITECTURE.md)
- [Security Policy](SECURITY.md)
- [Legal Notices](LEGAL.md)
