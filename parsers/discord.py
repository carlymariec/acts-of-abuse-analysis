"""
Discord JSON export parser.
Compatible with exports produced by DiscordChatExporter.
"""
import json
from datetime import datetime


def extract_data(file_path):
    """
    Parses a Discord JSON export and returns a list of message dicts.
    Each dict contains: timestamp (datetime), sender (str), content (str).
    """
    messages = []
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    for msg in data.get('messages', []):
        ts_str = msg.get('timestamp', '')
        try:
            ts = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            ts = None
        sender = msg.get('author', {}).get('name', 'Unknown')
        content = msg.get('content', '')
        if content:
            messages.append({
                'timestamp': ts,
                'sender': sender,
                'content': content,
            })
    return messages
