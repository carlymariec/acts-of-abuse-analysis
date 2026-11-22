import { CoerciveControlEngine } from './analysisEngine.ts';
import {
  buildContextWindow,
  localDayBounds,
  mergeWindows,
  normalizeMessages,
} from './normalization.ts';
import { sanitizeAndVerifyBatch, type BatchSanitizationOutput } from './piiSanitizer.ts';
import { createAnalyzedEventsBatch } from './store.ts';
import type {
  AnalyzedEventRecord,
  ForensicEvidenceRecord,
  PlacementCitation,
  RawMessage,
} from './types.ts';

const engine = new CoerciveControlEngine();

export interface PipelineOptions {
  tzName?: string;
  windowSize?: number;
  sanitizePii?: boolean;
  selfParty?: string;
  counterParty?: string;
}

export interface PipelineResult {
  events: AnalyzedEventRecord[];
  sanitization: BatchSanitizationOutput;
  full_text_index: string;
}

export function runAnalysisPipeline(
  rawMessages: RawMessage[],
  evidenceObj: ForensicEvidenceRecord,
  options: PipelineOptions = {}
): PipelineResult {
  const tzName = options.tzName || 'UTC';
  const windowSize = options.windowSize ?? 5;

  if (rawMessages.length === 0) {
    return {
      events: [],
      sanitization: {
        items: [],
        pii_redactions: {
          emails: 0,
          phones: 0,
          ssn: 0,
          financial: 0,
          medical_ids: 0,
          addresses: 0,
          dob: 0,
        },
        party_tokens: [],
        attribution_summary: {
          verified_strict: 0,
          inferred_needs_review: 0,
          ambiguous_warning: 0,
        },
      },
      full_text_index: '',
    };
  }

  // 1. Run PII Sanitization & Strict Sender/Receiver Attribution Verification
  const sanitization = sanitizeAndVerifyBatch(rawMessages, {
    sanitizePii: options.sanitizePii,
    selfParty: options.selfParty,
    counterParty: options.counterParty,
  });

  const sanitizedMsgs = sanitization.items.map((item) => item.message);
  const normalized = normalizeMessages(sanitizedMsgs);

  const fullTextIndex = sanitization.items
    .map((item, idx) => {
      const m = item.message;
      const citation = rawMessages[idx]?.placement?.citation_label || '';
      const subj = item.subject ? `Subject: ${item.subject} ` : '';
      return `[${m.sender} -> ${item.receiver}] ${subj}${citation} ${m.content}`.trim();
    })
    .join('\n');

  // 2. Analyze sanitized content across all 62 corpus tactics
  const analysisResults = normalized.map((msg) => engine.analyzeMessage(msg.content));
  const flaggedIndices = analysisResults
    .map((res, idx) => (res.severity > 1 ? idx : -1))
    .filter((idx) => idx !== -1);

  if (flaggedIndices.length === 0) {
    return { events: [], sanitization, full_text_index: fullTextIndex };
  }

  const windows = flaggedIndices.map((idx) =>
    buildContextWindow(normalized.length, idx, windowSize)
  );
  const merged = mergeWindows(windows);

  const findWindow = (idx: number): [number, number] => {
    for (const [winStart, winEnd] of merged) {
      if (winStart <= idx && idx <= winEnd) {
        return [winStart, winEnd];
      }
    }
    return [idx, idx];
  };

  const hashShort = evidenceObj.file_hash.slice(0, 8);
  const pendingEvents: Omit<AnalyzedEventRecord, 'id'>[] = [];

  for (const i of flaggedIndices) {
    const msg = normalized[i];
    const sanItem = sanitization.items[i];
    const rawOriginal = rawMessages[i];
    const result = analysisResults[i];
    const ts = msg.timestamp;

    let daySliceCount = 0;
    if (ts !== null) {
      const [dayStartMs, dayEndMs] = localDayBounds(ts, tzName);
      daySliceCount = normalized.filter((m) => {
        if (m.timestamp === null) return false;
        const t = new Date(m.timestamp).getTime();
        return t >= dayStartMs && t < dayEndMs;
      }).length;
    }

    const [winStart, winEnd] = findWindow(i);
    const windowCount = winEnd - winStart + 1;

    const basePlacement: PlacementCitation = rawOriginal.placement
      ? {
          ...rawOriginal.placement,
          evidence_id: evidenceObj.id,
          file_hash_short: hashShort,
          citation_label: `${rawOriginal.placement.citation_label} [sha256:${hashShort}]`,
        }
      : {
          evidence_id: evidenceObj.id,
          filename: evidenceObj.filename,
          file_hash_short: hashShort,
          platform: msg.source_platform || evidenceObj.detected_platform,
          document_category: rawOriginal.document_category || evidenceObj.document_category,
          citation_label: `${evidenceObj.filename} · Item #${i + 1} [sha256:${hashShort}]`,
        };

    const flagsSummary = result.all_flags
      .map((f) => `${f.wheel}: ${f.category}`)
      .join(', ');
    const indicatorsSummary = result.matched_indicators.slice(0, 8).join('; ');
    const contextNotes = flagsSummary
      ? `[Auto] Citation: ${basePlacement.citation_label}; Attribution: ${sanItem.attribution_audit.status} (${msg.sender} -> ${sanItem.receiver}); Tactics (${result.tactics_analyzed.length}): ${flagsSummary}; indicators=[${indicatorsSummary}]; day_slice=${daySliceCount} msgs; window=[${winStart},${winEnd}] (${windowCount} msgs)`
      : '';

    pendingEvents.push({
      evidence_id: evidenceObj.id,
      evidence_filename: evidenceObj.filename,
      timestamp: ts,
      sender: msg.sender,
      receiver: sanItem.receiver,
      content: msg.content,
      severity_score: result.severity,
      sender_id: msg.sender_id,
      receiver_id: sanItem.receiver_id,
      conversation_id: msg.conversation_id,
      message_id: msg.message_id,
      subject: sanItem.subject,
      source_platform: msg.source_platform || evidenceObj.detected_platform,
      document_category: rawOriginal.document_category || evidenceObj.document_category,
      is_verified: false,
      user_context_notes: contextNotes,
      all_flags: result.all_flags,
      tactics_analyzed: result.tactics_analyzed,
      matched_indicators: result.matched_indicators,
      placement_citation: basePlacement,
      attribution_audit: sanItem.attribution_audit,
      raw_content_hash: sanItem.raw_content_hash,
      pii_redacted_count: sanItem.pii_redacted_count,
    });
  }

  const persisted = createAnalyzedEventsBatch(pendingEvents);
  return { events: persisted, sanitization, full_text_index: fullTextIndex };
}
