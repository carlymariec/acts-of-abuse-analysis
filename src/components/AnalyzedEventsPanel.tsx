import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  HelpCircle,
  Save,
  Search,
  X,
} from 'lucide-react';
import type { AnalyzedEventRecord, AttributionStatus } from '../types.ts';
import { HighlightedSnippet } from './HighlightedSnippet.tsx';

export interface EventFilters {
  severity: string;
  is_verified: string;
  source_platform: string;
  wheel: string;
  document_category: string;
  attribution_status: string;
  date_from: string;
  date_to: string;
  search: string;
  sort: 'chronological' | 'relevance';
}

interface AnalyzedEventsPanelProps {
  events: AnalyzedEventRecord[];
  filters: EventFilters;
  onFiltersChange: (next: EventFilters) => void;
  onEventUpdated: () => Promise<void>;
}

const WHEEL_OPTIONS = [
  'Post-Separation Power & Control',
  'Post-Separation Economic Abuse',
  'Child Abuse',
  'Legal Abuse Scale (LAS)',
  'Technology-Facilitated Abuse',
  'DARVO',
  'Mesosystem Abuse',
  'Systemic/Institutional Abuse',
  'Institutional Betrayal (IBQ)',
  'Proactive Aggression & Contempt',
  'Lethality & Fundamental Needs Risk',
];

const SEVERITY_STYLES: Record<number, { label: string; classes: string }> = {
  1: { label: '1 - Low', classes: 'bg-slate-100 text-slate-700 border-slate-300' },
  2: { label: '2 - Moderate', classes: 'bg-amber-50 text-amber-800 border-amber-300' },
  3: { label: '3 - High', classes: 'bg-orange-50 text-orange-800 border-orange-300' },
  4: { label: '4 - Critical', classes: 'bg-red-50 text-red-800 border-red-300' },
};

const ATTRIBUTION_STYLES: Record<
  AttributionStatus,
  { label: string; classes: string }
> = {
  verified_strict: {
    label: 'Strict Attribution Verified',
    classes: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  inferred_needs_review: {
    label: 'Inferred (Verify Parties)',
    classes: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  ambiguous_warning: {
    label: 'Attribution Warning',
    classes: 'border-red-200 bg-red-50 text-red-800',
  },
};

export function AnalyzedEventsPanel({
  events,
  filters,
  onFiltersChange,
  onEventUpdated,
}: AnalyzedEventsPanelProps) {
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [senderDraft, setSenderDraft] = useState<Record<number, string>>({});
  const [receiverDraft, setReceiverDraft] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  async function toggleVerify(event: AnalyzedEventRecord) {
    setSavingId(event.id);
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_verified: !event.is_verified }),
      });
      if (res.ok) {
        await onEventUpdated();
      }
    } finally {
      setSavingId(null);
    }
  }

  async function saveEventEdits(event: AnalyzedEventRecord) {
    const nextNotes = notesDraft[event.id] ?? event.user_context_notes;
    const nextSender = senderDraft[event.id] ?? event.sender;
    const nextReceiver = receiverDraft[event.id] ?? event.receiver;
    setSavingId(event.id);
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_context_notes: nextNotes,
          sender: nextSender,
          receiver: nextReceiver,
        }),
      });
      if (res.ok) {
        await onEventUpdated();
      }
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter Sidebar/Bar */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-600">
              Full-Text Search (FTS5: <code className="text-[11px]">"phrase"</code>, <code>OR</code>, <code>NOT</code>, <code>word*</code>)
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
                placeholder="Search content, sender, citation, tactic, notes..."
                className="block w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-8 text-sm text-slate-800"
              />
              {filters.search && (
                <button
                  type="button"
                  onClick={() => onFiltersChange({ ...filters, search: '' })}
                  aria-label="Clear event search"
                  className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">Severity Score</label>
            <select
              value={filters.severity}
              onChange={(e) => onFiltersChange({ ...filters, severity: e.target.value })}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
            >
              <option value="all">All Severities</option>
              <option value="4">4 - Critical</option>
              <option value="3">3 - High</option>
              <option value="2">2 - Moderate</option>
              <option value="1">1 - Low</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">Framework / Wheel</label>
            <select
              value={filters.wheel}
              onChange={(e) => onFiltersChange({ ...filters, wheel: e.target.value })}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
            >
              <option value="all">All Frameworks</option>
              {WHEEL_OPTIONS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">Document Category</label>
            <select
              value={filters.document_category}
              onChange={(e) =>
                onFiltersChange({ ...filters, document_category: e.target.value })
              }
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
            >
              <option value="all">All Document Types</option>
              <option value="email">Emails (.eml)</option>
              <option value="court_document">Court Documents</option>
              <option value="medical_document">Medical Documents</option>
              <option value="personal_communication">Personal Communications</option>
              <option value="spreadsheet_log">Spreadsheet Logs (.csv)</option>
              <option value="screenshot_ocr">OCR Screenshots</option>
              <option value="generic_document">General Documents</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">Verification Status</label>
            <select
              value={filters.is_verified}
              onChange={(e) => onFiltersChange({ ...filters, is_verified: e.target.value })}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
            >
              <option value="all">All</option>
              <option value="false">Unverified (Awaiting Review)</option>
              <option value="true">Verified</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-xs font-medium text-slate-600">Attribution Check</label>
            <select
              value={filters.attribution_status}
              onChange={(e) =>
                onFiltersChange({ ...filters, attribution_status: e.target.value })
              }
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
            >
              <option value="all">All Attribution States</option>
              <option value="verified_strict">Strict Attribution Verified</option>
              <option value="inferred_needs_review">Inferred (Needs Review)</option>
              <option value="ambiguous_warning">Ambiguous / Conflict Warning</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">Source Platform</label>
            <select
              value={filters.source_platform}
              onChange={(e) =>
                onFiltersChange({ ...filters, source_platform: e.target.value })
              }
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
            >
              <option value="all">All Platforms</option>
              <option value="eml">Email (.eml)</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="facebook">Facebook</option>
              <option value="discord">Discord</option>
              <option value="sms_xml">SMS XML</option>
              <option value="csv">CSV Log</option>
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
              <option value="ocr">OCR Screenshot</option>
              <option value="generic">Generic</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">From Date</label>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => onFiltersChange({ ...filters, date_from: e.target.value })}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">To Date</label>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => onFiltersChange({ ...filters, date_to: e.target.value })}
              className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">Sort Order</label>
            <select
              value={filters.sort}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  sort: e.target.value === 'relevance' ? 'relevance' : 'chronological',
                })
              }
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800"
            >
              <option value="chronological">Chronological</option>
              <option value="relevance">Search Relevance (BM25)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Events List */}
      {events.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No analyzed events match the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const sev = SEVERITY_STYLES[event.severity_score] || SEVERITY_STYLES[1];
            const attrStyle =
              ATTRIBUTION_STYLES[event.attribution_audit?.status || 'inferred_needs_review'];
            const currentNotes = notesDraft[event.id] ?? event.user_context_notes;
            const currentSender = senderDraft[event.id] ?? event.sender;
            const currentReceiver = receiverDraft[event.id] ?? event.receiver;
            const modified =
              (notesDraft[event.id] !== undefined &&
                notesDraft[event.id] !== event.user_context_notes) ||
              (senderDraft[event.id] !== undefined && senderDraft[event.id] !== event.sender) ||
              (receiverDraft[event.id] !== undefined &&
                receiverDraft[event.id] !== event.receiver);

            return (
              <div
                key={event.id}
                className={`rounded-lg border bg-white p-5 shadow-xs ${
                  event.is_verified ? 'border-emerald-300' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                        <span>{event.sender}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-slate-700">{event.receiver}</span>
                      </span>
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${sev.classes}`}
                      >
                        {sev.label}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${attrStyle.classes}`}
                      >
                        {event.attribution_audit?.status === 'verified_strict' && (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        {event.attribution_audit?.status === 'inferred_needs_review' && (
                          <HelpCircle className="h-3 w-3" />
                        )}
                        {event.attribution_audit?.status === 'ambiguous_warning' && (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        {attrStyle.label}
                      </span>
                      {event.source_platform && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-700">
                          {event.source_platform}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        {event.timestamp
                          ? new Date(event.timestamp).toUTCString()
                          : 'No timestamp'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-700">
                        <FileText className="h-3 w-3 shrink-0" />
                        {event.placement_citation?.citation_label || event.evidence_filename}
                      </span>
                      {event.pii_redacted_count > 0 && (
                        <span>&middot; {event.pii_redacted_count} PII redacted</span>
                      )}
                      {event.message_id && <span>&middot; msg_id: {event.message_id}</span>}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={savingId === event.id}
                    onClick={() => toggleVerify(event)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${
                      event.is_verified
                        ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {event.is_verified ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Verified
                      </>
                    ) : (
                      <>
                        <X className="h-3.5 w-3.5" />
                        Mark Verified
                      </>
                    )}
                  </button>
                </div>

                {event.attribution_audit?.notes && (
                  <div className="mt-2 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">Attribution Check:</span>{' '}
                    {event.attribution_audit.notes}
                  </div>
                )}

                <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 whitespace-pre-wrap">
                  {event.content}
                </div>

                {event.search_snippet && (
                  <div className="mt-2 rounded border border-amber-200 bg-amber-50/70 px-3 py-1.5 text-xs text-slate-700">
                    <span className="font-semibold text-amber-900">Search Match: </span>
                    <HighlightedSnippet snippet={event.search_snippet} />
                  </div>
                )}

                {event.all_flags.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {event.all_flags.map((flag, idx) => (
                        <span
                          key={idx}
                          className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                        >
                          <span className="font-medium">{flag.wheel}:</span> {flag.category}
                        </span>
                      ))}
                    </div>
                    {event.matched_indicators && event.matched_indicators.length > 0 && (
                      <div className="text-xs text-slate-500">
                        <span className="font-medium text-slate-600">Matched indicators:</span>{' '}
                        {event.matched_indicators.join(' | ')}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600">
                      Verify / Lock Sender
                    </label>
                    <input
                      type="text"
                      value={currentSender}
                      onChange={(e) =>
                        setSenderDraft((prev) => ({ ...prev, [event.id]: e.target.value }))
                      }
                      className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">
                      Verify / Lock Receiver
                    </label>
                    <input
                      type="text"
                      value={currentReceiver}
                      onChange={(e) =>
                        setReceiverDraft((prev) => ({ ...prev, [event.id]: e.target.value }))
                      }
                      className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-800"
                    />
                  </div>
                </div>

                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-600">
                      User Context Notes (Human-in-the-Loop Annotation)
                    </label>
                    <textarea
                      rows={2}
                      value={currentNotes}
                      onChange={(e) =>
                        setNotesDraft((prev) => ({ ...prev, [event.id]: e.target.value }))
                      }
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-800"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={savingId === event.id || !modified}
                    onClick={() => saveEventEdits(event)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Attribution &amp; Notes
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
