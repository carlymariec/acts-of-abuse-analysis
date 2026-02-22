from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class ForensicEvidence(models.Model):
    """A single uploaded evidence file with integrity metadata."""

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="forensic_evidence",
    )
    file = models.FileField(upload_to="evidence/uploads/")
    sha256_hash = models.CharField(max_length=64)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]
        verbose_name = "Forensic Evidence"
        verbose_name_plural = "Forensic Evidence Records"

    def __str__(self):
        return f"Evidence #{self.pk} – {self.sha256_hash[:12]}…"


class AnalyzedEvent(models.Model):
    """A single parsed communication event derived from a piece of evidence."""

    SEVERITY_CHOICES = [
        (1, "Low"),
        (2, "Moderate"),
        (3, "High"),
        (4, "Severe"),
    ]

    evidence = models.ForeignKey(
        ForensicEvidence,
        on_delete=models.CASCADE,
        related_name="analyzed_events",
    )
    timestamp = models.DateTimeField()
    sender = models.CharField(max_length=255)
    content = models.TextField()
    severity_score = models.PositiveSmallIntegerField(choices=SEVERITY_CHOICES, default=1)
    is_verified = models.BooleanField(default=False)
    user_context_notes = models.TextField(blank=True)

    class Meta:
        ordering = ["timestamp"]
        verbose_name = "Analyzed Event"
        verbose_name_plural = "Analyzed Events"

    def __str__(self):
        return f"Event [{self.timestamp}] from {self.sender} (severity {self.severity_score})"
