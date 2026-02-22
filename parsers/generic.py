"""
Generic plain-text parser with custom regex patterns.
Used as a fallback when the file format cannot be auto-detected.
"""
import re
from datetime import datetime

# Attempt to match common timestamp patterns at the start of a line
_TIMESTAMP_PATTERN = re.compile(
    r'^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}[\s,T]+\d{1,2}:\d{2}(?::\d{2})?)\s*[-:>]\s*(.+)'
)


def extract_data(file_path):
    """
    Reads a plain-text file line by line and returns a list of message dicts.
    Each dict contains: timestamp (datetime or None), sender ('Unknown'), content (str).
    """
    messages = []
    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            match = _TIMESTAMP_PATTERN.match(line)
            if match:
                ts_str, content = match.groups()
                ts = _parse_timestamp(ts_str)
            else:
                ts = None
                content = line
            messages.append({
                'timestamp': ts,
                'sender': 'Unknown',
                'content': content.strip(),
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
