"""
Analysis pipeline: normalize parser output, detect coercive-control indicators,
extract local-day and context-window slices, and persist AnalyzedEvent records.
"""

from .analysis_engine import CoerciveControlEngine
from .normalization import (
    build_context_window,
    local_day_bounds,
    merge_windows,
    normalize_messages,
)

_engine = CoerciveControlEngine()


def run_analysis_pipeline(raw_messages, evidence_obj, tz_name='UTC', window_size=5):
    """
    Full analysis pipeline for a single evidence upload.

    Steps:
    1. Normalise *raw_messages* to canonical message dicts.
    2. Run :class:`CoerciveControlEngine` on every message.
    3. For each flagged message (severity > 1):
       - Compute the full local-day conversation slice.
       - Compute a context window of *window_size* messages on each side.
    4. Merge overlapping context windows and persist one
       :class:`~evidence.models.AnalyzedEvent` per flagged message with
       ``is_verified=False`` and a brief auto-generated context note.

    Parameters
    ----------
    raw_messages : list[dict]
        Parser output – each dict must have ``timestamp``, ``sender``,
        ``content`` keys (as returned by any ``extract_data()`` parser).
    evidence_obj : ForensicEvidence
        The :class:`~evidence.models.ForensicEvidence` instance to associate
        with every created event.
    tz_name : str
        IANA timezone name used for local-day slicing (default ``'UTC'``).
    window_size : int
        Number of messages to include before and after each flagged message
        as neighbouring context (default ``5``).

    Returns
    -------
    list[AnalyzedEvent]
        The newly persisted :class:`~evidence.models.AnalyzedEvent` instances.
    """
    # Import here to avoid circular imports at module load time.
    from .models import AnalyzedEvent

    messages = normalize_messages(raw_messages)
    if not messages:
        return []

    # Analyse every message and record which ones are flagged.
    analysis_results = [_engine.analyze_message(msg['content']) for msg in messages]
    flagged_indices = [i for i, r in enumerate(analysis_results) if r['severity'] > 1]

    if not flagged_indices:
        return []

    # Build and merge context windows so we can record neighbouring context.
    windows = [build_context_window(messages, i, window_size) for i in flagged_indices]
    merged = merge_windows(windows)

    # Map each flagged index to the merged window that covers it.
    def _find_window(idx):
        for win_start, win_end in merged:
            if win_start <= idx <= win_end:
                return (win_start, win_end)
        return (idx, idx)

    persisted = []
    for i in flagged_indices:
        msg = messages[i]
        result = analysis_results[i]
        ts = msg['timestamp']

        # Collect messages in the same local calendar day for context.
        day_slice_count = 0
        if ts is not None:
            day_start, day_end = local_day_bounds(ts, tz_name)
            day_slice_count = sum(
                1 for m in messages
                if m['timestamp'] is not None
                and day_start <= m['timestamp'] < day_end
            )

        win_start, win_end = _find_window(i)
        window_count = win_end - win_start + 1

        # Compact human-readable flag summary for the context note.
        flags_summary = ', '.join(
            f"{f['wheel']}: {f['category']}" for f in result['all_flags'][:3]
        )
        extra = ' [+more]' if len(result['all_flags']) > 3 else ''
        context_notes = (
            f"[Auto] Flags: {flags_summary}{extra}; "
            f"day_slice={day_slice_count} msgs; window=[{win_start},{win_end}] ({window_count} msgs)"
            if flags_summary else ''
        )

        event = AnalyzedEvent(
            evidence=evidence_obj,
            timestamp=ts,
            sender=msg['sender'],
            content=msg['content'],
            severity_score=result['severity'],
            is_verified=False,
            user_context_notes=context_notes,
            # Universal identifiers – populated from raw message if present,
            # otherwise left blank for manual enrichment.
            sender_id=msg.get('sender_id', ''),
            conversation_id=msg.get('conversation_id', ''),
            message_id=msg.get('message_id', ''),
            source_platform=msg.get('source_platform', ''),
        )
        event.save()
        persisted.append(event)

    return persisted
