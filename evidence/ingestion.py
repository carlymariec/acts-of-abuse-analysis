"""
Evidence ingestion module.

Detects the source platform of an uploaded file and delegates parsing to the
appropriate parser module using dynamic import.
"""
import importlib
import os

from evidence.parsers import PLATFORM_PARSERS

# Map file extensions to platform keys
_EXTENSION_MAP: dict[str, str] = {
    ".txt": "whatsapp",  # WhatsApp exports are plain .txt
    ".json": "facebook",  # Facebook / Discord exports are JSON
    ".pdf": "pdf",
}

# Lightweight content sniffs: (platform_key, bytes_to_search_for)
_CONTENT_SNIFFS: list[tuple[str, bytes]] = [
    ("whatsapp", b"WhatsApp"),
    ("discord", b'"guild"'),
    ("facebook", b'"messages"'),
]


def _detect_platform(file_path: str) -> str:
    """Return the platform key for *file_path*.

    Strategy:
    1. Read the first 4 KB and look for known byte signatures.
    2. Fall back to extension mapping.
    3. Default to 'generic'.
    """
    try:
        with open(file_path, "rb") as fh:
            header = fh.read(4096)
        for platform_key, signature in _CONTENT_SNIFFS:
            if signature in header:
                return platform_key
    except OSError:
        pass

    ext = os.path.splitext(file_path)[1].lower()
    return _EXTENSION_MAP.get(ext, "generic")


def _load_parser(platform_key: str):
    """Dynamically import and return the parser module for *platform_key*."""
    module_path = PLATFORM_PARSERS.get(platform_key, PLATFORM_PARSERS["generic"])
    return importlib.import_module(module_path)


def process_upload(file_path: str) -> list:
    """Detect the platform, load the appropriate parser, and return extracted events.

    Parameters
    ----------
    file_path:
        Absolute or relative path to the uploaded evidence file.

    Returns
    -------
    list[dict]
        A list of raw event dicts produced by the parser.  Each dict contains
        at minimum ``timestamp``, ``sender``, and ``content`` keys.
    """
    platform = _detect_platform(file_path)
    parser = _load_parser(platform)
    return parser.extract_data(file_path)
