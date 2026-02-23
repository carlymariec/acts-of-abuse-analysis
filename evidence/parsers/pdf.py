"""
PDF parser for evidence documents.
Extracts plain text from each page of a PDF file.
Requires the 'pypdf' package (pure Python, no native dependencies).
"""
from datetime import datetime


def extract_data(file_path):
    """
    Extracts text from a PDF and returns a list of message dicts.
    Each dict contains: timestamp (None), sender ('PDF Document'), content (str).
    """
    try:
        from pypdf import PdfReader
    except ImportError as e:
        raise ImportError(
            "pypdf is required to parse PDF files. Install it with: pip install pypdf"
        ) from e

    messages = []
    reader = PdfReader(file_path)
    for page_num, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ''
        text = text.strip()
        if text:
            messages.append({
                'timestamp': None,
                'sender': f'PDF Page {page_num}',
                'content': text,
            })
    return messages
