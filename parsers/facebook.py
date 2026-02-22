"""
Facebook Messenger JSON export parser.
"""
import json
from datetime import datetime


from datetime import timezone


def extract_data(file_path):
    """
    Parses a Facebook Messenger JSON export and returns a list of message dicts.
    Each dict contains: timestamp (datetime), sender (str), content (str).
    """
    messages = []
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    for msg in data.get('messages', []):
        ts_ms = msg.get('timestamp_ms')
        ts = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc) if ts_ms else None
        content = msg.get('content', '')
        sender = msg.get('sender_name', 'Unknown')
        if content:
            messages.append({
                'timestamp': ts,
                'sender': sender,
                'content': content,
            })
    return messages
