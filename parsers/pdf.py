"""
PDF parser for evidence documents.
Extracts plain text from each page of a PDF file.
Requires the 'pypdf' package (pure Python, no native dependencies).
"""


def extract_data(file_path):
    """
    Extracts text from a PDF and returns a list of message dicts.
    Each dict contains: timestamp (None), sender ('PDF Page {page_num}'), content (str).
    """
    try:
        from pypdf import PdfReader
    except ImportError as e:
        raise ImportError(
            "pypdf is required to parse PDF files. Install it with: pip install pypdf"
        ) from e

    messages = []
    try:
        reader = PdfReader(file_path)
    except FileNotFoundError as e:
        raise FileNotFoundError(f"PDF file not found: {file_path}") from e
    except PermissionError as e:
        raise PermissionError(f"Permission denied when reading PDF file: {file_path}") from e
    except Exception as e:
        raise ValueError(f"Failed to open or parse PDF file '{file_path}': {e}") from e

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
