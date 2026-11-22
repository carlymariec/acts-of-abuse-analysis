import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CalendarRange,
  Download,
  FileSearch,
  FileText,
  Scale,
  Search,
  Shield,
  Upload,
  X,
} from 'lucide-react';
import { AnalyzedEventsPanel, type EventFilters } from './components/AnalyzedEventsPanel.tsx';
import { ChronologySectionerPanel } from './components/ChronologySectionerPanel.tsx';
import {
  EvidenceUploadPanel,
  type EvidenceFilters,
} from './components/EvidenceUploadPanel.tsx';
import { HighlightedSnippet } from './components/HighlightedSnippet.tsx';
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

  const [evidenceFilters, setEvidenceFilters] = useState<EvidenceFilters>({
    search: '',
    document_category: 'all',
  });

  const [filters, setFilters] = useState<EventFilters>({
    severity: 'all',
    is_verified: 'all',
    source_platform: 'all',
    wheel: 'all',
    document_category: 'all',
    attribution_status: 'all',
    date_from: '',
    date_to: '',
    search: '',
    sort: 'chronological',
  });

  const [globalQuery, setGlobalQuery] = useState('');
  const [globalResults, setGlobalResults] = useState<{
    query: string;
    total_hits: number;
    evidence_hits: ForensicEvidenceRecord[];
    event_hits: AnalyzedEventRecord[];
  } | null>(null);

  const fetchEvidence = useCallback(async () => {
    const params = new URLSearchParams();
    if (evidenceFilters.search.trim()) params.set('search', evidenceFilters.search.trim());
    if (evidenceFilters.document_category !== 'all') {
      params.set('document_category', evidenceFilters.document_category);
    }
    const qs = params.toString();
    const res = await fetch(qs ? `/api/evidence?${qs}` : '/api/evidence');
    if (res.ok) {
      const data = await res.json();
      setEvidenceList(data.evidence || []);
    }
  }, [evidenceFilters]);

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
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.sort !== 'chronological') params.set('sort', filters.sort);

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
    const timer = window.setTimeout(() => {
      void fetchEvidence();
    }, evidenceFilters.search ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [fetchEvidence, evidenceFilters.search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchEvents();
    }, filters.search ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [fetchEvents, filters.search]);

  useEffect(() => {
    void fetchTimeline();
  }, [fetchTimeline]);

  useEffect(() => {
    const trimmed = globalQuery.trim();
    if (!trimmed) {
      setGlobalResults(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=12`);
      if (res.ok) {
        const data = await res.json();
        setGlobalResults(data);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [globalQuery, refreshTrigger]);

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

        <div className="mb-5 rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              placeholder='Global Full-Text Index Search across all uploaded files &amp; analyzed events (e.g. "joint account", passport*, CPS OR custody)...'
              className="block w-full rounded-md border border-slate-300 bg-slate-50 py-2 pl-9 pr-9 text-sm text-slate-900 focus:bg-white"
            />
            {globalQuery && (
              <button
                type="button"
                onClick={() => {
                  setGlobalQuery('');
                  setGlobalResults(null);
                }}
                aria-label="Clear global search"
                className="absolute right-2.5 top-2 rounded p-0.5 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {globalResults && (
            <div className="mt-3 border-t border-slate-200 pt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span>
                  Indexed matches for <strong>&ldquo;{globalResults.query}&rdquo;</strong>:{' '}
                  <strong>{globalResults.evidence_hits.length}</strong> documents,{' '}
                  <strong>{globalResults.event_hits.length}</strong> flagged events
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEvidenceFilters((prev) => ({ ...prev, search: globalResults.query }));
                      setActiveTab('upload');
                    }}
                    className="font-medium text-slate-800 underline hover:text-slate-950"
                  >
                    Filter Evidence Tab
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilters((prev) => ({
                        ...prev,
                        search: globalResults.query,
                        sort: 'relevance',
                      }));
                      setActiveTab('events');
                    }}
                    className="font-medium text-slate-800 underline hover:text-slate-950"
                  >
                    Filter Events Tab
                  </button>
                </div>
              </div>

              {globalResults.total_hits === 0 ? (
                <p className="text-xs text-slate-500">
                  No indexed evidence files or analyzed events matched that query.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Uploaded Documents ({globalResults.evidence_hits.length})
                    </div>
                    {globalResults.evidence_hits.length === 0 ? (
                      <p className="text-xs text-slate-400">No document matches.</p>
                    ) : (
                      globalResults.evidence_hits.slice(0, 5).map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => {
                            setEvidenceFilters((prev) => ({ ...prev, search: globalResults.query }));
                            setActiveTab('upload');
                          }}
                          className="block w-full rounded border border-slate-200 bg-slate-50 p-2 text-left text-xs hover:bg-slate-100"
                        >
                          <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                            <FileText className="h-3.5 w-3.5 text-slate-500" />
                            <span>{ev.filename}</span>
                            <span className="font-normal text-slate-500">
                              ({ev.detected_platform})
                            </span>
                          </div>
                          {ev.search_snippet && (
                            <div className="mt-1 text-slate-600">
                              <HighlightedSnippet snippet={ev.search_snippet} />
                            </div>
                          )}
                        </button>
                      ))
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Flagged Events ({globalResults.event_hits.length})
                    </div>
                    {globalResults.event_hits.length === 0 ? (
                      <p className="text-xs text-slate-400">No flagged event matches.</p>
                    ) : (
                      globalResults.event_hits.slice(0, 5).map((evt) => (
                        <button
                          key={evt.id}
                          type="button"
                          onClick={() => {
                            setFilters((prev) => ({
                              ...prev,
                              search: globalResults.query,
                              sort: 'relevance',
                            }));
                            setActiveTab('events');
                          }}
                          className="block w-full rounded border border-slate-200 bg-slate-50 p-2 text-left text-xs hover:bg-slate-100"
                        >
                          <div className="flex items-center justify-between gap-2 font-semibold text-slate-900">
                            <span>
                              {evt.sender} &rarr; {evt.receiver}
                            </span>
                            <span className="font-mono text-[11px] font-normal text-slate-500">
                              {evt.evidence_filename}
                            </span>
                          </div>
                          <div className="mt-1 text-slate-600">
                            {evt.search_snippet ? (
                              <HighlightedSnippet snippet={evt.search_snippet} />
                            ) : (
                              evt.content.slice(0, 140)
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {activeTab === 'upload' && (
          <EvidenceUploadPanel
            evidenceList={evidenceList}
            evidenceFilters={evidenceFilters}
            onEvidenceFiltersChange={setEvidenceFilters}
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
