"""
WhatsApp .txt export parser.
WhatsApp exports use a line-based format:
  [MM/DD/YYYY, HH:MM:SS] Sender: Message text
Multi-line messages (continuation lines without a timestamp header) are
appended to the previous message's content.
"""
import re
from datetime import datetime

_LINE_PATTERN = re.compile(
    r'^\[?(\d{1,2}/\d{1,2}/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]?\s+-?\s?(.+?):\s(.+)$'
)


def extract_data(file_path):
    """
    Parses a WhatsApp .txt export and returns a list of message dicts.
    Each dict contains: timestamp (datetime), sender (str), content (str).
    Continuation lines (without a timestamp header) are merged into the
    previous message to preserve full message content.
    """
    messages = []
    with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.rstrip('\n')
            stripped = line.strip()
            match = _LINE_PATTERN.match(stripped)
            if match:
                date_str, time_str, sender, content = match.groups()
                try:
                    ts = datetime.strptime(f"{date_str} {time_str}", "%m/%d/%Y %H:%M:%S")
                except ValueError:
                    try:
                        ts = datetime.strptime(f"{date_str} {time_str}", "%m/%d/%Y %H:%M")
                    except ValueError:
                        ts = None
                messages.append({
                    'timestamp': ts,
                    'sender': sender.strip(),
                    'content': content.strip(),
                })
            elif stripped and messages:
                # Continuation line: append to the previous message
                messages[-1]['content'] = messages[-1]['content'] + "\n" + stripped
    return messages
