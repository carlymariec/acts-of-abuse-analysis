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
