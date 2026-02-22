from django.contrib import admin
from .models import ForensicEvidence, AnalyzedEvent


@admin.register(ForensicEvidence)
class ForensicEvidenceAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "sha256_hash", "uploaded_at")
    readonly_fields = ("sha256_hash", "uploaded_at")
    search_fields = ("sha256_hash", "user__username")


@admin.register(AnalyzedEvent)
class AnalyzedEventAdmin(admin.ModelAdmin):
    list_display = ("id", "evidence", "timestamp", "sender", "severity_score", "is_verified")
    list_filter = ("severity_score", "is_verified")
    search_fields = ("sender", "content")
