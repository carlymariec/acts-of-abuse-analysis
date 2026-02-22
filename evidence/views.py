"""
Evidence views – Django HTTP views and helper utilities.

``generate_timeline`` creates an interactive Plotly Express HTML snippet
showing verified events on a timeline.
"""
from __future__ import annotations

try:
    import plotly.express as px  # type: ignore[import-untyped]
    import pandas as pd  # plotly express requires pandas for DataFrame input
    _PLOTLY_AVAILABLE = True
except ImportError:
    _PLOTLY_AVAILABLE = False

from django.shortcuts import render  # noqa: F401  – re-exported for convenience


def generate_timeline(case_events: list) -> str:
    """Render a Plotly Express timeline of verified events as an HTML string.

    Parameters
    ----------
    case_events:
        Iterable of :class:`evidence.models.AnalyzedEvent` instances (or dicts
        with at minimum ``timestamp``, ``sender``, and ``severity_score`` keys).

    Returns
    -------
    str
        An HTML ``<div>`` string containing the interactive Plotly chart, or a
        plain-text message when Plotly is not installed.
    """
    if not _PLOTLY_AVAILABLE:
        return "<p>Plotly is not installed. Run: pip install plotly</p>"

    rows = []
    for event in case_events:
        if isinstance(event, dict):
            ts = event.get("timestamp")
            sender = event.get("sender", "Unknown")
            severity = event.get("severity_score", 1)
            verified = event.get("is_verified", False)
        else:
            ts = getattr(event, "timestamp", None)
            sender = getattr(event, "sender", "Unknown")
            severity = getattr(event, "severity_score", 1)
            verified = getattr(event, "is_verified", False)

        if not verified:
            continue  # only show verified events on the public timeline
        rows.append({"Timestamp": ts, "Sender": sender, "Severity": severity})

    if not rows:
        return "<p>No verified events to display.</p>"

    df = pd.DataFrame(rows)
    fig = px.scatter(
        df,
        x="Timestamp",
        y="Sender",
        color="Severity",
        title="Verified Events Timeline",
        labels={"Timestamp": "Date / Time", "Sender": "Sender"},
    )
    return fig.to_html(full_html=False, include_plotlyjs="cdn")
