import type { AnalyzedEventRecord, ForensicEvidenceRecord } from './types.ts';

let nextEvidenceId = 1;
let nextEventId = 1;

const evidenceMap = new Map<number, ForensicEvidenceRecord>();
const evidenceBuffers = new Map<number, Buffer>();
const hashSet = new Set<string>();
const eventsMap = new Map<number, AnalyzedEventRecord>();

export function hasEvidenceHash(fileHash: string): boolean {
  return hashSet.has(fileHash);
}

export function createEvidence(
  input: Omit<ForensicEvidenceRecord, 'id'>,
  buffer: Buffer
): ForensicEvidenceRecord {
  const id = nextEvidenceId++;
  const record: ForensicEvidenceRecord = { id, ...input };
  evidenceMap.set(id, record);
  evidenceBuffers.set(id, buffer);
  hashSet.add(record.file_hash);
  return record;
}

export function updateEvidenceFlagCount(id: number, count: number): void {
  const rec = evidenceMap.get(id);
  if (rec) {
    rec.flagged_events_count = count;
  }
}

export function getEvidenceById(id: number): ForensicEvidenceRecord | undefined {
  return evidenceMap.get(id);
}

export function getEvidenceBuffer(id: number): Buffer | undefined {
  return evidenceBuffers.get(id);
}

export function listEvidence(): ForensicEvidenceRecord[] {
  return Array.from(evidenceMap.values()).sort((a, b) => b.id - a.id);
}

export function deleteEvidence(id: number): boolean {
  const rec = evidenceMap.get(id);
  if (!rec) return false;
  hashSet.delete(rec.file_hash);
  evidenceMap.delete(id);
  evidenceBuffers.delete(id);
  for (const [evId, ev] of eventsMap.entries()) {
    if (ev.evidence_id === id) {
      eventsMap.delete(evId);
    }
  }
  return true;
}

export function createAnalyzedEvent(
  input: Omit<AnalyzedEventRecord, 'id'>
): AnalyzedEventRecord {
  const id = nextEventId++;
  const record: AnalyzedEventRecord = { id, ...input };
  eventsMap.set(id, record);
  return record;
}

export function listEvents(): AnalyzedEventRecord[] {
  return Array.from(eventsMap.values()).sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    }
    if (a.timestamp) return -1;
    if (b.timestamp) return 1;
    return a.id - b.id;
  });
}

export function getEventById(id: number): AnalyzedEventRecord | undefined {
  return eventsMap.get(id);
}

export function updateEvidencePostAnalysis(
  id: number,
  patch: Partial<
    Pick<
      ForensicEvidenceRecord,
      'flagged_events_count' | 'pii_redactions' | 'attribution_summary' | 'party_tokens'
    >
  >
): void {
  const rec = evidenceMap.get(id);
  if (!rec) return;
  if (typeof patch.flagged_events_count === 'number') {
    rec.flagged_events_count = patch.flagged_events_count;
  }
  if (patch.pii_redactions) rec.pii_redactions = patch.pii_redactions;
  if (patch.attribution_summary) rec.attribution_summary = patch.attribution_summary;
  if (patch.party_tokens) rec.party_tokens = patch.party_tokens;
}

export function updateEvent(
  id: number,
  patch: Partial<
    Pick<AnalyzedEventRecord, 'is_verified' | 'user_context_notes' | 'sender' | 'receiver' | 'timestamp'>
  >
): AnalyzedEventRecord | undefined {
  const existing = eventsMap.get(id);
  if (!existing) return undefined;

  if (typeof patch.is_verified === 'boolean') {
    existing.is_verified = patch.is_verified;
  }
  if (typeof patch.user_context_notes === 'string') {
    existing.user_context_notes = patch.user_context_notes;
  }
  if (typeof patch.sender === 'string' && patch.sender.trim()) {
    existing.sender = patch.sender.trim();
    existing.attribution_audit = {
      ...existing.attribution_audit,
      sender: existing.sender,
      status:
        existing.attribution_audit.receiver &&
        existing.sender.toLowerCase() !== existing.attribution_audit.receiver.toLowerCase()
          ? 'verified_strict'
          : 'ambiguous_warning',
      method: 'manual_reviewer_verified',
      notes: 'Sender attribution manually verified/updated by reviewer.',
    };
  }
  if (typeof patch.receiver === 'string' && patch.receiver.trim()) {
    existing.receiver = patch.receiver.trim();
    existing.attribution_audit = {
      ...existing.attribution_audit,
      receiver: existing.receiver,
      status:
        existing.attribution_audit.sender &&
        existing.receiver.toLowerCase() !== existing.attribution_audit.sender.toLowerCase()
          ? 'verified_strict'
          : 'ambiguous_warning',
      method: 'manual_reviewer_verified',
      notes: 'Receiver attribution manually verified/updated by reviewer.',
    };
  }
  if (patch.timestamp !== undefined) {
    existing.timestamp = patch.timestamp;
  }
  return existing;
}
