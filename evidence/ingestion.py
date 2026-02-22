import importlib
import hashlib

# Read files in 64 KB chunks to keep memory usage constant for large evidence files
_HASH_CHUNK_SIZE = 65536


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
    """
    try:
        # Uses import_module to dynamically load the specific format parser
        parser_module = importlib.import_module(f'parsers.{platform_name.lower()}')
        return parser_module
    except ImportError as e:
        raise ValueError(f"Parser for {platform_name} not found.") from e


def process_upload(file_path):
    """
    Auto-detection based on file content and structure.
    Returns extracted data from the appropriate parser.
    """
    platform = None
    if file_path.endswith('.json'):
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read(500)
            if 'messages' in content and 'participants' in content:
                platform = 'facebook'  # Facebook Messenger (JSON & HTML)
            elif 'guild' in content:
                platform = 'discord'   # Discord JSON exports
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
