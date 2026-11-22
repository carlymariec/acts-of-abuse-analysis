import { useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Lock,
  ScanText,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { ForensicEvidenceRecord } from '../types.ts';

interface EvidenceUploadPanelProps {
  evidenceList: ForensicEvidenceRecord[];
  onUploaded: () => Promise<void>;
  onDeleted: () => Promise<void>;
}

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Australia/Sydney',
];

const ACCEPTED_FILE_ATTR =
  '.txt,.json,.eml,.csv,.xml,.pdf,.docx,.rtf,.md,.log,.html,.htm,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff';

export function EvidenceUploadPanel({
  evidenceList,
  onUploaded,
  onDeleted,
}: EvidenceUploadPanelProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tzName, setTzName] = useState('UTC');
  const [windowSize, setWindowSize] = useState(5);
  const [sanitizePii, setSanitizePii] = useState(true);
  const [selfParty, setSelfParty] = useState('');
  const [counterParty, setCounterParty] = useState('');
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [hashCheckStatus, setHashCheckStatus] = useState<Record<number, string>>({});

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please choose an evidence file or screenshot to upload.');
      return;
    }

    setUploading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('tz_name', tzName);
      formData.append('window_size', String(windowSize));
      formData.append('sanitize_pii', String(sanitizePii));
      if (selfParty.trim()) formData.append('self_party', selfParty.trim());
      if (counterParty.trim()) formData.append('counter_party', counterParty.trim());

      const res = await fetch('/api/evidence/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Evidence upload failed.');
      } else {
        const ev = data.evidence as ForensicEvidenceRecord;
        const piiTotal = Object.values(ev.pii_redactions || {}).reduce(
          (sum, v) => sum + Number(v || 0),
          0
        );
        const ocrNote = ev.ocr_used
          ? ` | OCR confidence: ${ev.ocr_confidence ?? 0}%`
          : '';
        setSuccessMsg(
          `Ingested "${ev.filename}" (${ev.detected_platform} / ${ev.document_category.replace(/_/g, ' ')}): ${ev.total_messages_parsed} items parsed, ${data.events_created} flagged events queued. PII redactions: ${piiTotal}${ocrNote}. Attribution audit: ${ev.attribution_summary.verified_strict} strict, ${ev.attribution_summary.inferred_needs_review} inferred, ${ev.attribution_summary.ambiguous_warning} warnings.`
        );
        setSelectedFile(null);
        await onUploaded();
      }
    } catch (err) {
      setErrorMsg((err as Error).message || 'Network error during upload.');
    } finally {
      setUploading(false);
    }
  }

  async function handleVerifyHash(id: number) {
    try {
      const res = await fetch(`/api/evidence/${id}/verify-hash`);
      const data = await res.json();
      if (res.ok) {
        setHashCheckStatus((prev) => ({
          ...prev,
          [id]: data.verified
            ? `OK — SHA-256 matches (${data.computed_hash.slice(0, 12)}...)`
            : 'WARNING — Hash mismatch!',
        }));
      }
    } catch {
      setHashCheckStatus((prev) => ({ ...prev, [id]: 'Verification request failed' }));
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/evidence/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await onDeleted();
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-lg font-semibold text-slate-900">
          Multi-Format Evidence Upload, OCR &amp; PII Sanitization
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Upload emails (<code className="rounded bg-slate-100 px-1">.eml</code>), spreadsheets/logs (<code className="rounded bg-slate-100 px-1">.csv</code>), SMS/structured backups (<code className="rounded bg-slate-100 px-1">.xml</code>), chat exports (<code className="rounded bg-slate-100 px-1">.txt</code>, <code className="rounded bg-slate-100 px-1">.json</code>), court &amp; medical documents (<code className="rounded bg-slate-100 px-1">.pdf</code>, <code className="rounded bg-slate-100 px-1">.docx</code>, <code className="rounded bg-slate-100 px-1">.rtf</code>, <code className="rounded bg-slate-100 px-1">.html</code>), and screenshots (<code className="rounded bg-slate-100 px-1">.png</code>, <code className="rounded bg-slate-100 px-1">.jpg</code>, <code className="rounded bg-slate-100 px-1">.webp</code>, <code className="rounded bg-slate-100 px-1">.tiff</code>) up to 50 MB.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-slate-700">
                Evidence File or Screenshot
              </label>
              <input
                type="file"
                accept={ACCEPTED_FILE_ATTR}
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-800 hover:file:bg-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Local Timezone (for day-slicing)
              </label>
              <select
                value={tzName}
                onChange={(e) => setTzName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                Context Window Size (messages)
              </label>
              <input
                type="number"
                min={1}
                max={25}
                value={windowSize}
                onChange={(e) => setWindowSize(Number.parseInt(e.target.value || '5', 10))}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              />
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sanitizePii}
                  onChange={(e) => setSanitizePii(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <Lock className="h-4 w-4 text-slate-600" />
                Enable PII Sanitization with Role-Locked Sender/Receiver Attribution Check
              </label>
              <span className="text-xs text-slate-500">
                Masks SSNs, phones, emails, addresses, DOBs, financial &amp; medical IDs while keeping distinct party tokens
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Optional Self / Account Owner Label (for SMS XML / CSV direction resolution)
                </label>
                <input
                  type="text"
                  value={selfParty}
                  onChange={(e) => setSelfParty(e.target.value)}
                  placeholder="e.g. Petitioner / Client"
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Optional Counterparty Label (for single-party screenshots/docs)
                </label>
                <input
                  type="text"
                  value={counterParty}
                  onChange={(e) => setCounterParty(e.target.value)}
                  placeholder="e.g. Respondent"
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
                />
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <FileUp className="h-4 w-4" />
            {uploading ? 'Scanning, OCR & Attributing...' : 'Ingest, Sanitize & Analyze Evidence'}
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-900">
            Forensic Evidence Chain of Custody ({evidenceList.length})
          </h3>
        </div>

        {evidenceList.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No evidence files ingested yet. Upload an email, spreadsheet, court/medical document, chat export, or screenshot above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">File &amp; Classification</th>
                  <th className="px-4 py-3">Parsed / Flagged</th>
                  <th className="px-4 py-3">PII &amp; Attribution Audit</th>
                  <th className="px-4 py-3">SHA-256 Chain of Custody</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {evidenceList.map((ev) => {
                  const piiTotal = Object.values(ev.pii_redactions || {}).reduce(
                    (acc, v) => acc + Number(v || 0),
                    0
                  );
                  return (
                    <tr key={ev.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <div>{ev.filename}</div>
                        <div className="mt-0.5 text-xs font-normal text-slate-500">
                          <span className="capitalize">{ev.detected_platform}</span> &middot;{' '}
                          <span className="capitalize">
                            {ev.document_category.replace(/_/g, ' ')}
                          </span>{' '}
                          &middot; {(ev.file_size / 1024).toFixed(1)} KB
                        </div>
                        {ev.ocr_used && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-700">
                            <ScanText className="h-3 w-3" />
                            Local OCR ({ev.ocr_confidence ?? 0}% conf)
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {ev.total_messages_parsed} items /{' '}
                        <span className="font-semibold text-slate-900">
                          {ev.flagged_events_count} flagged
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 space-y-1">
                        <div>
                          <span className="font-semibold text-slate-800">PII:</span>{' '}
                          {ev.pii_sanitized ? `${piiTotal} redacted` : 'Sanitization disabled'}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-800">Attribution:</span>{' '}
                          <span className="text-emerald-700">
                            {ev.attribution_summary?.verified_strict ?? 0} strict
                          </span>
                          ,{' '}
                          <span className="text-amber-700">
                            {ev.attribution_summary?.inferred_needs_review ?? 0} inferred
                          </span>
                          ,{' '}
                          <span className="text-red-700">
                            {ev.attribution_summary?.ambiguous_warning ?? 0} warn
                          </span>
                        </div>
                        {ev.party_tokens && ev.party_tokens.length > 0 && (
                          <div className="text-slate-500">
                            Tokens: {ev.party_tokens.map((p) => `${p.token}=${p.original_hint}`).join('; ')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        <div className="break-all">{ev.file_hash}</div>
                        {hashCheckStatus[ev.id] && (
                          <div className="mt-1 font-sans text-xs font-medium text-emerald-700">
                            {hashCheckStatus[ev.id]}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleVerifyHash(ev.id)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Verify Hash
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(ev.id)}
                            className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
