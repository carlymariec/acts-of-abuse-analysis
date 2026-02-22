"""
Generic plain-text parser with custom regex patterns.
Used as a fallback when the file format cannot be auto-detected.

Sender detection is best-effort: the parser attempts to extract a sender name
from "Sender: message" patterns commonly found in chat exports, email threads,
and court document transcripts.  Because the generic format has no strict schema
the extracted sender MUST be reviewed and confirmed by the user via the
human-in-the-loop is_verified workflow before being included in reports or
timelines.
"""
import re
from datetime import datetime

# Attempt to match common timestamp patterns at the start of a line
_TIMESTAMP_PATTERN = re.compile(
    r'^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}[\s,T]+\d{1,2}:\d{2}(?::\d{2})?)\s*[-:>]\s*(.+)'
)

# Try to extract "Sender: message" from the content portion of a line.
# Sender: must start with a letter, be at most 50 chars, and may contain
# letters, digits, spaces, hyphens, underscores, or periods.
# This is a heuristic — always verify extracted senders with is_verified.
_SENDER_CONTENT_PATTERN = re.compile(
    r'^([A-Za-z][A-Za-z0-9 ._-]{0,49}):\s+(.+)$',
    re.DOTALL,
)


def _extract_sender_and_content(raw_content):
    """
    Attempt to extract a sender name from content in "Sender: message" format.

    Returns (sender, content). Falls back to ('Unknown', raw_content) when no
    recognisable sender pattern is found.

    This is a best-effort heuristic.  The extracted sender MUST be confirmed
    via the human-in-the-loop is_verified workflow before being used in reports.
    """
    match = _SENDER_CONTENT_PATTERN.match(raw_content.strip())
    if match:
        sender, content = match.groups()
        return sender.strip(), content.strip()
    return 'Unknown', raw_content.strip()


def extract_data(file_path):
    """
    Reads a plain-text file line by line and returns a list of message dicts.
    Each dict contains: timestamp (datetime or None), sender (str), content (str).

    Sender extraction is attempted for every line via _extract_sender_and_content().
    Extracted senders are best-effort and should be confirmed through the
    human-in-the-loop is_verified workflow before being used in reports or timelines.
    """
    messages = []
    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            match = _TIMESTAMP_PATTERN.match(line)
            if match:
                ts_str, raw_content = match.groups()
                ts = _parse_timestamp(ts_str)
                sender, content = _extract_sender_and_content(raw_content)
            else:
                ts = None
                sender, content = _extract_sender_and_content(line)
            messages.append({
                'timestamp': ts,
                'sender': sender,
                'content': content,
            })
    return messages


def _parse_timestamp(ts_str):
    formats = [
        '%m/%d/%Y %H:%M:%S',
        '%m/%d/%Y %H:%M',
        '%m-%d-%Y %H:%M:%S',
        '%m-%d-%Y %H:%M',
        '%Y-%m-%dT%H:%M:%S',
        '%Y-%m-%d %H:%M:%S',
    ]
    for fmt in formats:
        try:
            return datetime.strptime(ts_str.strip(), fmt)
        except ValueError:
            continue
    return None
