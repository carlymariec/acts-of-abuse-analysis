import { useCallback, useEffect, useState } from 'react';
import { Activity, CalendarRange, Download, FileSearch, Scale, Shield, Upload } from 'lucide-react';
import { AnalyzedEventsPanel } from './components/AnalyzedEventsPanel.tsx';
import { ChronologySectionerPanel } from './components/ChronologySectionerPanel.tsx';
import { EvidenceUploadPanel } from './components/EvidenceUploadPanel.tsx';
import {
  EDUCATIONAL_DISCLAIMER_SHORT,
  LegalDisclaimerModal,
} from './components/LegalDisclaimerModal.tsx';
import { MessageAnalyzerPanel } from './components/MessageAnalyzerPanel.tsx';
import { TimelineChart } from './components/TimelineChart.tsx';
import type {
  AnalyzedEventRecord,
  ForensicEvidenceRecord,
  TimelinePoint,
} from './types.ts';

type ActiveTab = 'upload' | 'events' | 'chronology' | 'timeline' | 'analyzer';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [evidenceList, setEvidenceList] = useState<ForensicEvidenceRecord[]>([]);
  const [events, setEvents] = useState<AnalyzedEventRecord[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [timeline, setTimeline] = useState<{
    empty: boolean;
    message?: string;
    points: TimelinePoint[];
  }>({ empty: true, message: 'No verified events available to display timeline.', points: [] });

  const [filters, setFilters] = useState({
    severity: 'all',
    is_verified: 'all',
    source_platform: 'all',
    wheel: 'all',
    document_category: 'all',
    attribution_status: 'all',
    date_from: '',
    date_to: '',
    search: '',
  });

  const fetchEvidence = useCallback(async () => {
    const res = await fetch('/api/evidence');
    if (res.ok) {
      const data = await res.json();
      setEvidenceList(data.evidence || []);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.severity !== 'all') params.set('severity', filters.severity);
    if (filters.is_verified !== 'all') params.set('is_verified', filters.is_verified);
    if (filters.source_platform !== 'all') params.set('source_platform', filters.source_platform);
    if (filters.wheel !== 'all') params.set('wheel', filters.wheel);
    if (filters.document_category !== 'all') {
      params.set('document_category', filters.document_category);
    }
    if (filters.attribution_status !== 'all') {
      params.set('attribution_status', filters.attribution_status);
    }
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to) params.set('date_to', filters.date_to);
    if (filters.search) params.set('search', filters.search);

    const res = await fetch(`/api/events?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events || []);
    }
  }, [filters]);

  const fetchTimeline = useCallback(async () => {
    const res = await fetch('/api/timeline');
    if (res.ok) {
      const data = await res.json();
      setTimeline(data);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchEvidence(), fetchEvents(), fetchTimeline()]);
    setRefreshTrigger((n) => n + 1);
  }, [fetchEvidence, fetchEvents, fetchTimeline]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const verifiedCount = events.filter((e) => e.is_verified).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-white">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Acts of Abuse Analysis
              </h1>
              <p className="text-xs text-slate-500">
                Forensic Multi-Format Evidence, OCR, PII Attribution &amp; Chronology Workbench
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDisclaimerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              <Scale className="h-3.5 w-3.5" />
              Legal &amp; Safety Disclaimers
            </button>

            <a
              href="/api/export/verified"
              download="verified_events.json"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <Download className="h-3.5 w-3.5" />
              Export Verified JSON ({verifiedCount})
            </a>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
              activeTab === 'upload'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="h-4 w-4" />
            Evidence &amp; Chain of Custody ({evidenceList.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('events')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
              activeTab === 'events'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSearch className="h-4 w-4" />
            Analyzed Events Review ({events.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chronology')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
              activeTab === 'chronology'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarRange className="h-4 w-4" />
            Event Sectioner &amp; Chronology
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('timeline')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
              activeTab === 'timeline'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="h-4 w-4" />
            Verified Timeline ({timeline.points.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analyzer')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
              activeTab === 'analyzer'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield className="h-4 w-4" />
            Analysis Engine
          </button>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold">Educational &amp; Personal Use Disclaimer:</span>{' '}
            {EDUCATIONAL_DISCLAIMER_SHORT}
          </div>
          <button
            type="button"
            onClick={() => setDisclaimerOpen(true)}
            className="font-semibold underline hover:text-amber-800 whitespace-nowrap"
          >
            Read Full Disclaimers
          </button>
        </div>

        <div className="mb-5 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Human-in-the-Loop Verification:</span>{' '}
          Automated flags, OCR transcriptions, and inferred attributions are screening aids only. Verify sender/receiver attribution and context citations before marking events verified.
        </div>

        {activeTab === 'upload' && (
          <EvidenceUploadPanel
            evidenceList={evidenceList}
            onUploaded={refreshAll}
            onDeleted={refreshAll}
          />
        )}

        {activeTab === 'events' && (
          <AnalyzedEventsPanel
            events={events}
            filters={filters}
            onFiltersChange={setFilters}
            onEventUpdated={refreshAll}
          />
        )}

        {activeTab === 'chronology' && (
          <ChronologySectionerPanel refreshTrigger={refreshTrigger} />
        )}

        {activeTab === 'timeline' && (
          <TimelineChart
            empty={timeline.empty}
            message={timeline.message}
            points={timeline.points}
          />
        )}

        {activeTab === 'analyzer' && <MessageAnalyzerPanel />}
      </main>

      <footer className="mt-10 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 text-xs text-slate-500 space-y-1.5">
          <p>
            <strong className="text-slate-700">Notice &amp; Limitation of Liability:</strong> This application is an educational and personal documentation aid grounded in peer-reviewed research and the DAIP Duluth Model Power and Control Wheels (not affiliated with or endorsed by DAIP). It does not provide legal, medical, psychological, or expert forensic advice and creates no professional relationship. Provided &ldquo;AS IS&rdquo; without warranty or liability for damages or legal outcomes.
          </p>
          <p>
            If you are in immediate danger, call <strong>911</strong>. National Domestic Violence Hotline (U.S.): <strong>1-800-799-SAFE (7233)</strong> or text <strong>START</strong> to <strong>88788</strong>.
          </p>
        </div>
      </footer>

      <LegalDisclaimerModal open={disclaimerOpen} onClose={() => setDisclaimerOpen(false)} />
    </div>
  );
}
