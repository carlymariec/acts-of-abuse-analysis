"""
Coercive control analysis engine.

Uses thefuzz (preferred over the older fuzzywuzzy) for fuzzy keyword matching
against known patterns of coercive control, DARVO, and institutional abuse.
"""
from __future__ import annotations

from dataclasses import dataclass, field

try:
    from thefuzz import fuzz  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover – optional at import time
    fuzz = None  # type: ignore[assignment]

# ---------------------------------------------------------------------------
# Keyword banks (extend these as needed)
# ---------------------------------------------------------------------------

_COERCIVE_KEYWORDS: list[str] = [
    "you will do as I say",
    "I know where you live",
    "no one will believe you",
    "you are nothing without me",
    "I will take the children",
    "you made me do this",
    "look what you made me do",
    "I am watching you",
    "do not tell anyone",
    "this is your fault",
]

_DARVO_KEYWORDS: list[str] = [
    "you are the abuser",
    "I am the victim here",
    "you always twist things",
    "I never did anything",
    "why are you attacking me",
    "you are crazy",
    "stop lying",
    "you are manipulating me",
]

_INSTITUTIONAL_KEYWORDS: list[str] = [
    "the court will side with me",
    "my lawyer will destroy you",
    "child services will take them",
    "I will report you",
    "I have friends in the police",
]

_MATCH_THRESHOLD = 75  # minimum fuzz ratio (0-100) to count as a match


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class AnalysisResult:
    categories: list[str] = field(default_factory=list)
    darvo_flags: list[str] = field(default_factory=list)
    institutional_abuse_flag: bool = False
    severity: int = 1  # 1-4


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class CoerciveControlEngine:
    """Analyse a list of event content strings for coercive control patterns."""

    def __init__(self, threshold: int = _MATCH_THRESHOLD) -> None:
        if fuzz is None:
            raise ImportError(
                "thefuzz is required for analysis. Install it with: pip install thefuzz"
            )
        self.threshold = threshold

    def _matches(self, text: str, keywords: list[str]) -> list[str]:
        """Return the subset of *keywords* that fuzzy-match *text*."""
        text_lower = text.lower()
        matched = []
        for kw in keywords:
            if fuzz.partial_ratio(kw, text_lower) >= self.threshold:
                matched.append(kw)
        return matched

    def analyse(self, events: list[dict]) -> AnalysisResult:
        """Analyse *events* and return an :class:`AnalysisResult`.

        Parameters
        ----------
        events:
            List of dicts, each with at minimum a ``content`` key (str).
        """
        result = AnalysisResult()
        all_text = " ".join(e.get("content", "") for e in events)

        coercive_matches = self._matches(all_text, _COERCIVE_KEYWORDS)
        if coercive_matches:
            result.categories.extend(coercive_matches)

        darvo_matches = self._matches(all_text, _DARVO_KEYWORDS)
        result.darvo_flags.extend(darvo_matches)

        institutional_matches = self._matches(all_text, _INSTITUTIONAL_KEYWORDS)
        result.institutional_abuse_flag = bool(institutional_matches)

        # Derive a simple severity score (1-4)
        total_flags = len(coercive_matches) + len(darvo_matches) + int(result.institutional_abuse_flag)
        if total_flags == 0:
            result.severity = 1
        elif total_flags <= 2:
            result.severity = 2
        elif total_flags <= 5:
            result.severity = 3
        else:
            result.severity = 4

        return result
