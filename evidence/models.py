<<<<<<<-HEAD
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
===
import hashlib

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator, MaxValueValidator, MinValueValidator
from django.db import models

from .file_security import validate_file_content

# Maximum upload size for evidence files (50 MB)
_MAX_EVIDENCE_FILE_SIZE_MB = 50


def validate_file_size(file):
    """Reject evidence uploads that exceed the configured size limit."""
    if file.size > _MAX_EVIDENCE_FILE_SIZE_MB * 1024 * 1024:
        raise ValidationError(
            f"Maximum evidence file size is {_MAX_EVIDENCE_FILE_SIZE_MB} MB."
        )


class ForensicEvidence(models.Model):
    # Secure storage and user account connection
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    file = models.FileField(
        upload_to='evidence_files/',
        validators=[
            FileExtensionValidator(allowed_extensions=['txt', 'json', 'pdf']),
            validate_file_size,
            validate_file_content,
        ],
    )
    # SHA-256 hash for forensic chain of custody; unique prevents duplicate evidence entries
    file_hash = models.CharField(max_length=64, unique=True, db_index=True)
    upload_date = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        """Auto-compute SHA-256 file_hash on first save if not already set."""
        if self.file and not self.file_hash:
            sha256 = hashlib.sha256()
            self.file.open('rb')
            try:
                for chunk in iter(lambda: self.file.read(65536), b''):
                    sha256.update(chunk)
            finally:
                self.file.close()
            self.file_hash = sha256.hexdigest()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Evidence {self.pk} uploaded {self.upload_date}"


class AnalyzedEvent(models.Model):
    evidence = models.ForeignKey(ForensicEvidence, on_delete=models.CASCADE)
    # null=True allows events extracted from formats without timestamps (e.g. PDF pages)
    timestamp = models.DateTimeField(null=True, blank=True, db_index=True)
    sender = models.CharField(max_length=255)
    content = models.TextField()

    # Severity Scoring (1=Low, 4=Critical)
    severity_score = models.IntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(4)],
    )

    # Human-in-the-loop verification
    is_verified = models.BooleanField(default=False, db_index=True)
    user_context_notes = models.TextField(blank=True)

    def __str__(self):
        return f"Event {self.pk} from {self.sender} at {self.timestamp}"
>>>>>>> f77a6ac2faaa6cb7446dfcf73c1266679044e720
