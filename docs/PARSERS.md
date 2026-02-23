# Parsers Reference

This document describes each supported evidence parser, the file formats they accept, and how to add a new parser to the platform.

---

## Contents

1. [Parser Interface Contract](#1-parser-interface-contract)
2. [WhatsApp Parser](#2-whatsapp-parser)
3. [Facebook Messenger Parser](#3-facebook-messenger-parser)
4. [Discord Parser](#4-discord-parser)
5. [PDF Parser](#5-pdf-parser)
6. [Generic Text Parser](#6-generic-text-parser)
7. [Parser Whitelist](#7-parser-whitelist)
8. [Adding a New Parser](#8-adding-a-new-parser)

---

## 1. Parser Interface Contract

Every parser **must** expose a single public function:

```python
def extract_data(file_path: str) -> list[dict]:
    ...
```

Each dict in the returned list must contain:

| Key | Type | Required | Notes |
|-----|------|----------|-------|
| `timestamp` | `datetime` or `None` | Yes | `None` if the format has no timestamp |
| `sender` | `str` | Yes | Display name of the message author |
| `content` | `str` | Yes | Full message text |

Additional optional keys (`sender_id`, `conversation_id`, `message_id`) may be included if the format provides them.

---

## 2. WhatsApp Parser

**File:** `evidence/parsers/whatsapp.py`  
**Accepts:** `.txt` exports

### Export format

WhatsApp chat exports use this line format:

```
[DD/MM/YYYY, HH:MM:SS] Sender Name: Message text here
```

or (older format):

```
MM/DD/YYYY, HH:MM - Sender Name: Message text
```

### How to export from WhatsApp

1. Open the chat you want to export.
2. Tap ⋮ (Android) or the contact/group name (iOS).
3. Select **More** → **Export Chat** → **Without Media**.
4. Save the `.txt` file and upload it to the tool.

### Notes

- Multiline messages are supported — continuation lines are appended to the previous message.
- System messages (e.g. *"Sender was added"*) are skipped.
- Messages from unknown senders (no colon separator) fall through to the Generic parser logic.

---

## 3. Facebook Messenger Parser

**File:** `evidence/parsers/facebook.py`  
**Accepts:** `.json` exports

### Export format

Facebook's data download produces a JSON file with this top-level structure:

```json
{
  "participants": [{"name": "Alice"}, {"name": "Bob"}],
  "messages": [
    {
      "sender_name": "Alice",
      "timestamp_ms": 1700000000000,
      "content": "Message text"
    }
  ]
}
```

### How to export from Facebook

1. Go to **facebook.com** → **Settings & Privacy** → **Settings**.
2. Select **Your Facebook Information** → **Download Your Information**.
3. Choose **Messages** and set the **Format** to **JSON**.
4. Request the download, wait for the email, then download the ZIP.
5. Extract the ZIP and locate the `message_1.json` file for the conversation you need.

### Notes

- Timestamps are in milliseconds since epoch and are converted to UTC `datetime` objects.
- Only messages with `"content"` are included; photo/file/reaction-only messages are skipped.

---

## 4. Discord Parser

**File:** `evidence/parsers/discord.py`  
**Accepts:** `.json` exports (via DiscordChatExporter)

### Export format

[DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter) produces JSON with this structure:

```json
{
  "guild": {"name": "Server Name"},
  "channel": {"name": "channel-name"},
  "messages": [
    {
      "id": "1234567890",
      "timestamp": "2024-01-15T10:30:00+00:00",
      "author": {"name": "Username"},
      "content": "Message text"
    }
  ]
}
```

### How to export from Discord

1. Download and run [DiscordChatExporter](https://github.com/Tyrrrz/DiscordChatExporter) (open source, Windows/macOS/Linux).
2. Log in with your Discord token.
3. Select the server and channel.
4. Export as **JSON** format.

### Notes

- `id` is stored as `message_id` for auditability.
- Timestamps include timezone info and are parsed to timezone-aware `datetime` objects.
- Only messages with non-empty `content` are included.

---

## 5. PDF Parser

**File:** `evidence/parsers/pdf.py`  
**Accepts:** `.pdf` files

### Use cases

- Court documents
- Email thread PDF exports
- Screenshots converted to PDF
- Any document printed to PDF

### Notes

- The PDF parser extracts raw text from each page using `pdfplumber` (or `PyPDF2`).
- Since PDFs rarely contain structured metadata, `timestamp` is typically `None` and `sender` is set to `'PDF Document'`.
- Each page of the PDF is treated as a separate event.
- Scanned (image-only) PDFs will produce empty content — ensure PDFs contain selectable text, or use an OCR tool first.

---

## 6. Generic Text Parser

**File:** `evidence/parsers/generic.py`  
**Accepts:** `.txt` files (fallback for unrecognised formats)

### Sender detection

The generic parser attempts to detect `"Name: message"` patterns on each line, with and without timestamps:

```
Alice: This is a message
2024-01-15 10:30 Bob: Another message
```

If no sender is detected, it falls back to `'Unknown'`.

> **Security note:** Senders extracted by the generic parser are not validated. Any extracted sender name should be reviewed and confirmed via the `is_verified` flag before being treated as factual.

### When to use

- Exported chat logs from platforms not natively supported.
- Email exports in plain-text format.
- Notes or transcripts you have typed yourself.
- Any `.txt` file that does not match the WhatsApp format.

---

## 7. Parser Whitelist

To prevent module-injection attacks, `ingestion.import_parser()` validates the requested parser name against a hardcoded whitelist before calling `importlib.import_module`:

```python
_ALLOWED_PARSERS = frozenset({'whatsapp', 'facebook', 'discord', 'pdf', 'generic'})
```

Any request for a parser not in this set raises `ValueError`. **Adding a new parser requires updating this whitelist.**

---

## 8. Adding a New Parser

### Step 1 — Create the parser module

Create `evidence/parsers/<platform>.py`:

```python
# evidence/parsers/myplatform.py

from datetime import datetime


def extract_data(file_path: str) -> list[dict]:
    """
    Parse a MyPlatform export file and return a list of message dicts.
    """
    messages = []

    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            # Your parsing logic here
            messages.append({
                'timestamp': None,         # datetime or None
                'sender':    'Unknown',    # str
                'content':   line,         # str
            })

    return messages
```

### Step 2 — Register in the parsers package

Add an import to `evidence/parsers/__init__.py`:

```python
from . import myplatform  # noqa: F401
```

### Step 3 — Add to the whitelist

In `evidence/ingestion.py`, update `_ALLOWED_PARSERS`:

```python
_ALLOWED_PARSERS = frozenset({'whatsapp', 'facebook', 'discord', 'pdf', 'generic', 'myplatform'})
```

### Step 4 — Add platform detection (optional)

If the format has a unique file extension or JSON structure, add detection logic in `ingestion.process_upload()`:

```python
elif file_path.endswith('.myext'):
    platform = 'myplatform'
```

### Step 5 — Write tests

Add test cases to `evidence/tests.py` covering:
- Normal message extraction.
- Messages with no timestamp.
- Messages with no sender.
- Empty file.
- File with only system messages.

---

## See Also

- [How to Use the App](USAGE.md)
- [Architecture Overview](ARCHITECTURE.md)
- [Analysis Engine Reference](ANALYSIS_ENGINE.md)
