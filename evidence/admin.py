from django.contrib import admin

from .models import ForensicEvidence, AnalyzedEvent

# Register your models here.
admin.site.register(ForensicEvidence)
admin.site.register(AnalyzedEvent)
