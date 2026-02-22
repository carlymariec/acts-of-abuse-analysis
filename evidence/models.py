from django.db import models
from django.conf import settings


class ForensicEvidence(models.Model):
    # Secure storage and user account connection
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    file = models.FileField(upload_to='evidence_files/')
    file_hash = models.CharField(max_length=64)  # SHA-256 hash for forensic chain of custody
    upload_date = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Evidence {self.pk} uploaded {self.upload_date}"


class AnalyzedEvent(models.Model):
    evidence = models.ForeignKey(ForensicEvidence, on_delete=models.CASCADE)
    timestamp = models.DateTimeField()  # For the chronological timeline
    sender = models.CharField(max_length=255)
    content = models.TextField()

    # Severity Scoring (1=Low, 4=Critical)
    severity_score = models.IntegerField(default=1)

    # Human-in-the-loop verification
    is_verified = models.BooleanField(default=False)
    user_context_notes = models.TextField(blank=True)

    def __str__(self):
        return f"Event {self.pk} from {self.sender} at {self.timestamp}"
