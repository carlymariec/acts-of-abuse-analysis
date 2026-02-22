import importlib
import hashlib
import json

# Read files in 64 KB chunks to keep memory usage constant for large evidence files
_HASH_CHUNK_SIZE = 65536

# Whitelist of allowed parser module names to prevent module-injection attacks
_ALLOWED_PARSERS = frozenset({'whatsapp', 'facebook', 'discord', 'pdf', 'generic'})


def compute_file_hash(file_path):
    """
    Computes the SHA-256 hash of a file for forensic chain of custody.
    """
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(_HASH_CHUNK_SIZE), b''):
            sha256.update(chunk)
    return sha256.hexdigest()


def import_parser(platform_name):
    """
    Dynamically imports the correct parser module using importlib.
    Only modules from the pre-approved whitelist are allowed.
    """
    name = platform_name.lower()
    if name not in _ALLOWED_PARSERS:
        raise ValueError(
            f"'{platform_name}' is not a recognised parser. "
            f"Allowed parsers: {sorted(_ALLOWED_PARSERS)}"
        )
    # Try the canonical evidence.parsers namespace first; fall back to the
    # top-level parsers package for backward compatibility.
    for module_path in (f'evidence.parsers.{name}', f'parsers.{name}'):
        try:
            return importlib.import_module(module_path)
        except ImportError:
            continue
    raise ValueError(f"Parser for {platform_name} not found.")


def _detect_json_platform(file_path):
    """
    Parse the JSON structure to reliably identify the export platform.
    Returns 'facebook', 'discord', or None.
    """
    try:
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return None

    if not isinstance(data, dict):
        return None

    # Facebook Messenger exports have top-level 'participants' and 'messages' keys
    if 'participants' in data and 'messages' in data:
        return 'facebook'

    # Discord exports (DiscordChatExporter) have a top-level 'guild' or 'channel' key
    if 'guild' in data or 'channel' in data:
        return 'discord'

    return None


def process_upload(file_path):
    """
    Auto-detection based on file content and structure.
    Returns extracted data from the appropriate parser.
    """
    platform = None
    if file_path.endswith('.json'):
        platform = _detect_json_platform(file_path)
    elif file_path.endswith('.txt'):
        platform = 'whatsapp'  # WhatsApp txt exports
    elif file_path.endswith('.pdf'):
        platform = 'pdf'       # PDF format

    if platform:
        # Dynamically load and execute the parser
        parser = import_parser(platform)
        return parser.extract_data(file_path)
    else:
        # Fallback to Generic text with custom regex patterns
        generic_parser = import_parser('generic')
        return generic_parser.extract_data(file_path)
