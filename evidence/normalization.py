"""
Message normalization and context-window utilities for abuse-indicator extraction.

Provides:
  - normalize_messages(): canonical message dicts from raw parser output.
  - local_day_bounds(): DST-safe UTC start/end of a local calendar day.
  - build_context_window(): index range for N messages before/after a flagged index.
  - merge_windows(): collapse overlapping/adjacent index windows.
"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


def normalize_messages(raw_messages):
    """
    Normalize raw parser output to canonical message dicts.

    Each input dict must have at minimum the keys ``timestamp``, ``sender``,
    ``content`` as produced by any parser's ``extract_data()`` function.
    Naive datetimes are interpreted as UTC.

    Parameters
    ----------
    raw_messages : list[dict]
        Parser output.

    Returns
    -------
    list[dict]
        Each dict has keys: ``timestamp`` (datetime or None),
        ``sender`` (str), ``content`` (str).
    """
    normalized = []
    for msg in raw_messages:
        ts = msg.get('timestamp')
        if isinstance(ts, datetime) and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        # Start with a copy so that any extra keys (e.g. sender_id,
        # conversation_id, message_id, source_platform) are preserved.
        entry = dict(msg)
        entry['timestamp'] = ts
        entry['sender'] = msg.get('sender', 'Unknown')
        entry['content'] = msg.get('content', '')
        normalized.append(entry)
    return normalized


def local_day_bounds(dt, tz_name):
    """
    Return the UTC start and end of the local calendar day containing *dt*.

    Computation is DST-safe via :mod:`zoneinfo`.

    Parameters
    ----------
    dt : datetime
        A timezone-aware datetime (naive datetimes are treated as UTC).
    tz_name : str
        IANA timezone name, e.g. ``'America/New_York'``.

    Returns
    -------
    tuple[datetime, datetime]
        ``(day_start_utc, day_end_utc)`` – both are timezone-aware UTC
        datetimes.  ``day_end_utc`` is the first instant of the *next*
        local calendar day (i.e. the half-open interval
        ``[day_start_utc, day_end_utc)``).
    """
    tz = ZoneInfo(tz_name)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    local_dt = dt.astimezone(tz)
    day_start_local = local_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    # Adding a timedelta rather than replace(day=...) keeps DST folds correct.
    day_end_local = day_start_local + timedelta(days=1)
    return (
        day_start_local.astimezone(timezone.utc),
        day_end_local.astimezone(timezone.utc),
    )


def build_context_window(messages, flagged_idx, window_size=5):
    """
    Return the ``(start_index, end_index)`` inclusive range for a context
    window of *window_size* messages before and after *flagged_idx*.

    Parameters
    ----------
    messages : list
        The full message list.
    flagged_idx : int
        Index of the flagged message.
    window_size : int
        Number of messages to include on each side.

    Returns
    -------
    tuple[int, int]
        Inclusive ``(start, end)`` index pair clamped to the list bounds.
    """
    start = max(0, flagged_idx - window_size)
    end = min(len(messages) - 1, flagged_idx + window_size)
    return (start, end)


def merge_windows(windows):
    """
    Merge a list of potentially overlapping or adjacent index windows.

    Parameters
    ----------
    windows : list[tuple[int, int]]
        Inclusive ``(start, end)`` index pairs.

    Returns
    -------
    list[tuple[int, int]]
        Sorted, non-overlapping merged windows.
    """
    if not windows:
        return []
    sorted_windows = sorted(windows)
    merged = [sorted_windows[0]]
    for start, end in sorted_windows[1:]:
        prev_start, prev_end = merged[-1]
        if start <= prev_end + 1:
            merged[-1] = (prev_start, max(prev_end, end))
        else:
            merged.append((start, end))
    return merged
