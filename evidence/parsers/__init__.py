"""
Parsers package for evidence ingestion.

Each parser module must expose:
    extract_data(file_path: str) -> list[dict]
"""

PLATFORM_PARSERS = {
    "whatsapp": "evidence.parsers.whatsapp",
    "facebook": "evidence.parsers.facebook",
    "discord": "evidence.parsers.discord",
    "pdf": "evidence.parsers.pdf",
    "generic": "evidence.parsers.generic",
}
