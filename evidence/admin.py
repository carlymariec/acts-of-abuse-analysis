from django.contrib import admin

from .models import AnalyzedEvent, ForensicEvidence

admin.site.register(ForensicEvidence)
admin.site.register(AnalyzedEvent)
