import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import type {
  AnalyzedEventRecord,
  AttributionAudit,
  DocumentCategory,
  FlagEntry,
  ForensicEvidenceRecord,
  PartyTokenMapping,
  PiiRedactionCounts,
  PlacementCitation,
  TacticAnalysisEntry,
} from './types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const MAX_FULL_TEXT_INDEX_CHARS = 500_000;
const VAULT_MAGIC = Buffer.from('AOAE', 'ascii');

function resolveDataDir(): string {
  const configured = process.env.EVIDENCE_DATA_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(PROJECT_ROOT, configured);
  }
  return path.join(PROJECT_ROOT, 'data');
}

export const DATA_DIR = resolveDataDir();
export const DB_PATH = path.join(DATA_DIR, 'forensic_evidence.db');
export const VAULT_DIR = path.join(DATA_DIR, 'vault');

fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });

function loadOrCreateVaultKey(): Buffer {
  const envSecret = process.env.APP_SECRET?.trim();
  if (envSecret && envSecret !== 'change-me-in-production' && envSecret.length >= 16) {
    return crypto.scryptSync(envSecret, 'acts-of-abuse-vault-v1', 32);
  }
  const keyFilePath = path.join(DATA_DIR, '.vault.key');
  if (fs.existsSync(keyFilePath)) {
    const hex = fs.readFileSync(keyFilePath, 'utf8').trim();
    if (/^[a-f0-9]{64}$/i.test(hex)) {
      return Buffer.from(hex, 'hex');
    }
  }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(keyFilePath, generated.toString('hex'), { mode: 0o600 });
  return generated;
}

const VAULT_KEY = loadOrCreateVaultKey();

function encryptVaultBuffer(plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', VAULT_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([VAULT_MAGIC, iv, authTag, encrypted]);
}

function decryptVaultBuffer(stored: Buffer): Buffer {
  if (
    stored.length >= 32 &&
    stored.subarray(0, 4).equals(VAULT_MAGIC)
  ) {
    const iv = stored.subarray(4, 16);
    const authTag = stored.subarray(16, 32);
    const ciphertext = stored.subarray(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', VAULT_KEY, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
  // Legacy unencrypted fallback
  return stored;
}

function secureDeleteFile(filePath: string): void {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    const stat = fs.statSync(filePath);
    if (stat.isFile() && stat.size > 0) {
      const zeros = Buffer.alloc(Math.min(stat.size, 65536));
      const fd = fs.openSync(filePath, 'r+');
      try {
        let offset = 0;
        while (offset < stat.size) {
          const chunk = Math.min(zeros.length, stat.size - offset);
          crypto.randomFillSync(zeros, 0, chunk);
          fs.writeSync(fd, zeros, 0, chunk, offset);
          offset += chunk;
        }
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    }
    fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup
  }
}

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_hash TEXT NOT NULL UNIQUE,
    upload_date TEXT NOT NULL,
    detected_platform TEXT NOT NULL,
    document_category TEXT NOT NULL,
    total_messages_parsed INTEGER NOT NULL,
    flagged_events_count INTEGER NOT NULL DEFAULT 0,
    pii_sanitized INTEGER NOT NULL DEFAULT 1,
    pii_redactions_json TEXT NOT NULL,
    ocr_used INTEGER NOT NULL DEFAULT 0,
    ocr_confidence REAL,
    attribution_summary_json TEXT NOT NULL,
    party_tokens_json TEXT NOT NULL,
    vault_path TEXT NOT NULL,
    full_text_index TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS analyzed_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evidence_id INTEGER NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    evidence_filename TEXT NOT NULL,
    timestamp TEXT,
    sender TEXT NOT NULL,
    receiver TEXT NOT NULL,
    content TEXT NOT NULL,
    severity_score INTEGER NOT NULL,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    source_platform TEXT NOT NULL,
    document_category TEXT NOT NULL,
    is_verified INTEGER NOT NULL DEFAULT 0,
    user_context_notes TEXT NOT NULL DEFAULT '',
    all_flags_json TEXT NOT NULL,
    tactics_analyzed_json TEXT NOT NULL,
    matched_indicators_json TEXT NOT NULL,
    placement_citation_json TEXT NOT NULL,
    attribution_audit_json TEXT NOT NULL,
    raw_content_hash TEXT NOT NULL,
    pii_redacted_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_events_evidence_id ON analyzed_events(evidence_id);
  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON analyzed_events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_severity ON analyzed_events(severity_score);
  CREATE INDEX IF NOT EXISTS idx_events_verified ON analyzed_events(is_verified);

  CREATE VIRTUAL TABLE IF NOT EXISTS evidence_fts USING fts5(
    evidence_id UNINDEXED,
    filename,
    detected_platform,
    document_category,
    file_hash,
    party_tokens_text,
    full_text,
    tokenize='porter unicode61'
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
    event_id UNINDEXED,
    evidence_id UNINDEXED,
    evidence_filename,
    sender,
    receiver,
    subject,
    content,
    user_context_notes,
    citation_label,
    tactics_text,
    indicators_text,
    source_platform,
    document_category,
    tokenize='porter unicode61'
  );
`);

// Schema migration guard for pre-existing DBs without full_text_index column
const evidenceCols = db.prepare('PRAGMA table_info(evidence)').all() as Array<{ name: string }>;
if (!evidenceCols.some((c) => c.name === 'full_text_index')) {
  db.exec("ALTER TABLE evidence ADD COLUMN full_text_index TEXT NOT NULL DEFAULT ''");
}

interface EvidenceRow {
  id: number;
  filename: string;
  file_size: number;
  file_hash: string;
  upload_date: string;
  detected_platform: string;
  document_category: string;
  total_messages_parsed: number;
  flagged_events_count: number;
  pii_sanitized: number;
  pii_redactions_json: string;
  ocr_used: number;
  ocr_confidence: number | null;
  attribution_summary_json: string;
  party_tokens_json: string;
  vault_path: string;
  full_text_index?: string;
  search_snippet?: string;
  search_rank?: number;
}

interface AnalyzedEventRow {
  id: number;
  evidence_id: number;
  evidence_filename: string;
  timestamp: string | null;
  sender: string;
  receiver: string;
  content: string;
  severity_score: number;
  sender_id: string;
  receiver_id: string;
  conversation_id: string;
  message_id: string;
  subject: string;
  source_platform: string;
  document_category: string;
  is_verified: number;
  user_context_notes: string;
  all_flags_json: string;
  tactics_analyzed_json: string;
  matched_indicators_json: string;
  placement_citation_json: string;
  attribution_audit_json: string;
  raw_content_hash: string;
  pii_redacted_count: number;
  search_snippet?: string;
  search_rank?: number;
}

function rowToEvidence(row: EvidenceRow): ForensicEvidenceRecord {
  const rec: ForensicEvidenceRecord = {
    id: Number(row.id),
    filename: row.filename,
    file_size: Number(row.file_size),
    file_hash: row.file_hash,
    upload_date: row.upload_date,
    detected_platform: row.detected_platform,
    document_category: row.document_category as DocumentCategory,
    total_messages_parsed: Number(row.total_messages_parsed),
    flagged_events_count: Number(row.flagged_events_count),
    pii_sanitized: Boolean(row.pii_sanitized),
    pii_redactions: JSON.parse(row.pii_redactions_json) as PiiRedactionCounts,
    ocr_used: Boolean(row.ocr_used),
    ocr_confidence: row.ocr_confidence === null ? undefined : Number(row.ocr_confidence),
    attribution_summary: JSON.parse(row.attribution_summary_json) as {
      verified_strict: number;
      inferred_needs_review: number;
      ambiguous_warning: number;
    },
    party_tokens: JSON.parse(row.party_tokens_json) as PartyTokenMapping[],
  };
  if (typeof row.search_snippet === 'string' && row.search_snippet.length > 0) {
    rec.search_snippet = row.search_snippet;
  }
  if (typeof row.search_rank === 'number') {
    rec.search_rank = row.search_rank;
  }
  return rec;
}

function rowToEvent(row: AnalyzedEventRow): AnalyzedEventRecord {
  const rec: AnalyzedEventRecord = {
    id: Number(row.id),
    evidence_id: Number(row.evidence_id),
    evidence_filename: row.evidence_filename,
    timestamp: row.timestamp,
    sender: row.sender,
    receiver: row.receiver,
    content: row.content,
    severity_score: Number(row.severity_score),
    sender_id: row.sender_id,
    receiver_id: row.receiver_id,
    conversation_id: row.conversation_id,
    message_id: row.message_id,
    subject: row.subject,
    source_platform: row.source_platform,
    document_category: row.document_category as DocumentCategory,
    is_verified: Boolean(row.is_verified),
    user_context_notes: row.user_context_notes,
    all_flags: JSON.parse(row.all_flags_json) as FlagEntry[],
    tactics_analyzed: JSON.parse(row.tactics_analyzed_json) as TacticAnalysisEntry[],
    matched_indicators: JSON.parse(row.matched_indicators_json) as string[],
    placement_citation: JSON.parse(row.placement_citation_json) as PlacementCitation,
    attribution_audit: JSON.parse(row.attribution_audit_json) as AttributionAudit,
    raw_content_hash: row.raw_content_hash,
    pii_redacted_count: Number(row.pii_redacted_count),
  };
  if (typeof row.search_snippet === 'string' && row.search_snippet.length > 0) {
    rec.search_snippet = row.search_snippet;
  }
  if (typeof row.search_rank === 'number') {
    rec.search_rank = row.search_rank;
  }
  return rec;
}

function vaultFilePath(fileHash: string): string {
  const safeHash = fileHash.replace(/[^a-fA-F0-9]/g, '');
  return path.join(VAULT_DIR, `${safeHash}.enc`);
}

function legacyVaultFilePath(fileHash: string): string {
  const safeHash = fileHash.replace(/[^a-fA-F0-9]/g, '');
  return path.join(VAULT_DIR, `${safeHash}.bin`);
}

const stmtHasHash = db.prepare('SELECT 1 AS found FROM evidence WHERE file_hash = ? LIMIT 1');
const stmtInsertEvidence = db.prepare(`
  INSERT INTO evidence (
    filename, file_size, file_hash, upload_date, detected_platform,
    document_category, total_messages_parsed, flagged_events_count,
    pii_sanitized, pii_redactions_json, ocr_used, ocr_confidence,
    attribution_summary_json, party_tokens_json, vault_path, full_text_index
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtGetEvidenceById = db.prepare('SELECT * FROM evidence WHERE id = ?');
const stmtListEvidence = db.prepare('SELECT * FROM evidence ORDER BY id DESC');
const stmtDeleteEvidence = db.prepare('DELETE FROM evidence WHERE id = ?');
const stmtUpdateEvidenceFlagCount = db.prepare(
  'UPDATE evidence SET flagged_events_count = ? WHERE id = ?'
);

const stmtInsertEvent = db.prepare(`
  INSERT INTO analyzed_events (
    evidence_id, evidence_filename, timestamp, sender, receiver, content,
    severity_score, sender_id, receiver_id, conversation_id, message_id,
    subject, source_platform, document_category, is_verified, user_context_notes,
    all_flags_json, tactics_analyzed_json, matched_indicators_json,
    placement_citation_json, attribution_audit_json, raw_content_hash, pii_redacted_count
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const stmtGetEventById = db.prepare('SELECT * FROM analyzed_events WHERE id = ?');
const stmtListEvents = db.prepare('SELECT * FROM analyzed_events ORDER BY id ASC');

const stmtDeleteEvidenceFts = db.prepare('DELETE FROM evidence_fts WHERE evidence_id = ?');
const stmtInsertEvidenceFts = db.prepare(`
  INSERT INTO evidence_fts (
    evidence_id, filename, detected_platform, document_category,
    file_hash, party_tokens_text, full_text
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const stmtDeleteEventFtsByEventId = db.prepare('DELETE FROM events_fts WHERE event_id = ?');
const stmtDeleteEventsFtsByEvidenceId = db.prepare('DELETE FROM events_fts WHERE evidence_id = ?');
const stmtInsertEventFts = db.prepare(`
  INSERT INTO events_fts (
    event_id, evidence_id, evidence_filename, sender, receiver, subject,
    content, user_context_notes, citation_label, tactics_text,
    indicators_text, source_platform, document_category
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function upsertEvidenceFts(rec: ForensicEvidenceRecord, fullText: string): void {
  const partyText = (rec.party_tokens || [])
    .map((p) => `${p.role} ${p.token} ${p.original_hint}`)
    .join(' ');
  const boundedText = fullText.slice(0, MAX_FULL_TEXT_INDEX_CHARS);

  stmtDeleteEvidenceFts.run(rec.id);
  stmtInsertEvidenceFts.run(
    rec.id,
    rec.filename,
    rec.detected_platform,
    rec.document_category,
    rec.file_hash,
    partyText,
    boundedText
  );
}

function upsertEventFts(event: AnalyzedEventRecord): void {
  const tacticsText = (event.all_flags || [])
    .map((f) => `${f.wheel} ${f.category}`)
    .join(' | ');
  const indicatorsText = (event.matched_indicators || []).join(' | ');
  const citationLabel = event.placement_citation?.citation_label || event.evidence_filename;

  stmtDeleteEventFtsByEventId.run(event.id);
  stmtInsertEventFts.run(
    event.id,
    event.evidence_id,
    event.evidence_filename,
    event.sender,
    event.receiver,
    event.subject || '',
    event.content,
    event.user_context_notes || '',
    citationLabel,
    tacticsText,
    indicatorsText,
    event.source_platform,
    event.document_category
  );
}

function syncMissingFtsIndexes(): void {
  const missingEvRows = db
    .prepare(
      `SELECT e.* FROM evidence e
       WHERE NOT EXISTS (SELECT 1 FROM evidence_fts f WHERE f.evidence_id = e.id)`
    )
    .all() as unknown as EvidenceRow[];

  if (missingEvRows.length > 0) {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of missingEvRows) {
        upsertEvidenceFts(rowToEvidence(row), row.full_text_index || '');
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  const missingEventRows = db
    .prepare(
      `SELECT ae.* FROM analyzed_events ae
       WHERE NOT EXISTS (SELECT 1 FROM events_fts f WHERE f.event_id = ae.id)`
    )
    .all() as unknown as AnalyzedEventRow[];

  if (missingEventRows.length > 0) {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of missingEventRows) {
        upsertEventFts(rowToEvent(row));
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

syncMissingFtsIndexes();

/**
 * Safely transforms natural user search input into an FTS5 MATCH expression.
 * Supports quoted phrases ("joint account"), OR / NOT / AND boolean operators,
 * and automatic prefix matching (word -> "word"*).
 */
export function buildFtsQuery(rawQuery: string): string | null {
  const trimmed = rawQuery.trim();
  if (!trimmed) return null;

  const tokens: string[] = [];
  const tokenRegex = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(trimmed)) !== null) {
    if (match[1] !== undefined) {
      const phrase = match[1]
        .replace(/[^\p{L}\p{N}\s_-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (phrase) {
        tokens.push(`"${phrase}"`);
      }
      continue;
    }

    const raw = match[2];
    if (raw === 'AND' || raw === 'OR' || raw === 'NOT') {
      tokens.push(raw);
      continue;
    }

    const isNegated = raw.startsWith('-') && raw.length > 1;
    const hasWildcard = raw.endsWith('*');
    const cleaned = (isNegated ? raw.slice(1) : raw).replace(/\*+$/, '');

    // Split on punctuation such as @, ., :, / so emails/hashes tokenize cleanly in unicode61
    const subParts = cleaned
      .split(/[^\p{L}\p{N}_-]+/u)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (subParts.length === 0) continue;

    if (isNegated && tokens.length > 0 && tokens[tokens.length - 1] !== 'NOT') {
      tokens.push('NOT');
    }

    if (subParts.length === 1) {
      const term = subParts[0];
      const usePrefix = hasWildcard || term.length >= 2;
      tokens.push(usePrefix ? `"${term}"*` : `"${term}"`);
    } else {
      const lastIdx = subParts.length - 1;
      subParts.forEach((part, idx) => {
        const usePrefix = (hasWildcard || idx === lastIdx) && part.length >= 2;
        tokens.push(usePrefix ? `"${part}"*` : `"${part}"`);
      });
    }
  }

  // Normalize operators so FTS5 syntax can never be unbalanced
  const cleanedTokens: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === 'AND' || tok === 'OR' || tok === 'NOT') {
      if (cleanedTokens.length === 0) continue;
      const prev = cleanedTokens[cleanedTokens.length - 1];
      if (prev === 'AND' || prev === 'OR' || prev === 'NOT') continue;
      if (i === tokens.length - 1) continue;
      cleanedTokens.push(tok);
    } else {
      cleanedTokens.push(tok);
    }
  }

  while (
    cleanedTokens.length > 0 &&
    (cleanedTokens[cleanedTokens.length - 1] === 'AND' ||
      cleanedTokens[cleanedTokens.length - 1] === 'OR' ||
      cleanedTokens[cleanedTokens.length - 1] === 'NOT')
  ) {
    cleanedTokens.pop();
  }

  if (cleanedTokens.length === 0) return null;
  return cleanedTokens.join(' ');
}

export function rebuildSearchIndex(): { evidence_indexed: number; events_indexed: number } {
  const allEv = db.prepare('SELECT * FROM evidence').all() as unknown as EvidenceRow[];
  const allEvents = db.prepare('SELECT * FROM analyzed_events').all() as unknown as AnalyzedEventRow[];

  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM evidence_fts');
    db.exec('DELETE FROM events_fts');
    for (const row of allEv) {
      upsertEvidenceFts(rowToEvidence(row), row.full_text_index || '');
    }
    for (const row of allEvents) {
      upsertEventFts(rowToEvent(row));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    evidence_indexed: allEv.length,
    events_indexed: allEvents.length,
  };
}

export function hasEvidenceHash(fileHash: string): boolean {
  const row = stmtHasHash.get(fileHash);
  return Boolean(row);
}

export function createEvidence(
  input: Omit<ForensicEvidenceRecord, 'id'>,
  buffer: Buffer,
  fullTextIndex = ''
): ForensicEvidenceRecord {
  fs.mkdirSync(VAULT_DIR, { recursive: true, mode: 0o700 });
  const targetVaultPath = vaultFilePath(input.file_hash);
  const encryptedPayload = encryptVaultBuffer(buffer);
  fs.writeFileSync(targetVaultPath, encryptedPayload, { mode: 0o600 });
  const boundedText = fullTextIndex.slice(0, MAX_FULL_TEXT_INDEX_CHARS);

  try {
    db.exec('BEGIN IMMEDIATE');
    const res = stmtInsertEvidence.run(
      input.filename,
      input.file_size,
      input.file_hash,
      input.upload_date,
      input.detected_platform,
      input.document_category,
      input.total_messages_parsed,
      input.flagged_events_count,
      input.pii_sanitized ? 1 : 0,
      JSON.stringify(input.pii_redactions),
      input.ocr_used ? 1 : 0,
      input.ocr_confidence ?? null,
      JSON.stringify(input.attribution_summary),
      JSON.stringify(input.party_tokens),
      targetVaultPath,
      boundedText
    );
    const id = Number(res.lastInsertRowid);
    const record: ForensicEvidenceRecord = { id, ...input };
    upsertEvidenceFts(record, boundedText);
    db.exec('COMMIT');
    return record;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore rollback if transaction was not active
    }
    secureDeleteFile(targetVaultPath);
    throw err;
  }
}

export function updateEvidenceFlagCount(id: number, count: number): void {
  stmtUpdateEvidenceFlagCount.run(count, id);
}

export function getEvidenceById(id: number): ForensicEvidenceRecord | undefined {
  const row = stmtGetEvidenceById.get(id) as EvidenceRow | undefined;
  return row ? rowToEvidence(row) : undefined;
}

export function getEvidenceBuffer(id: number): Buffer | undefined {
  const row = stmtGetEvidenceById.get(id) as EvidenceRow | undefined;
  if (!row) return undefined;
  const candidates = [
    row.vault_path,
    vaultFilePath(row.file_hash),
    legacyVaultFilePath(row.file_hash),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return decryptVaultBuffer(fs.readFileSync(p));
    }
  }
  return undefined;
}

export function listEvidence(): ForensicEvidenceRecord[] {
  const rows = stmtListEvidence.all() as unknown as EvidenceRow[];
  return rows.map(rowToEvidence);
}

export interface SearchEvidenceParams {
  search?: string;
  document_category?: string;
  detected_platform?: string;
}

export function searchEvidence(params: SearchEvidenceParams = {}): ForensicEvidenceRecord[] {
  const whereClauses: string[] = [];
  const bindValues: Array<string | number> = [];

  if (params.document_category && params.document_category !== 'all') {
    whereClauses.push('e.document_category = ?');
    bindValues.push(params.document_category);
  }
  if (params.detected_platform && params.detected_platform !== 'all') {
    whereClauses.push('e.detected_platform = ?');
    bindValues.push(params.detected_platform);
  }

  const rawSearch = params.search?.trim() || '';
  if (!rawSearch) {
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT e.* FROM evidence e ${whereSql} ORDER BY e.id DESC`)
      .all(...bindValues) as unknown as EvidenceRow[];
    return rows.map(rowToEvidence);
  }

  const ftsQuery = buildFtsQuery(rawSearch);
  if (ftsQuery) {
    try {
      const ftsSql = `
        SELECT e.*,
               snippet(evidence_fts, -1, '[[M]]', '[[/M]]', '...', 20) AS search_snippet,
               bm25(evidence_fts) AS search_rank
        FROM evidence_fts
        JOIN evidence e ON e.id = evidence_fts.evidence_id
        WHERE evidence_fts MATCH ?
        ${whereClauses.length > 0 ? `AND ${whereClauses.join(' AND ')}` : ''}
        ORDER BY search_rank ASC, e.id DESC
      `;
      const rows = db.prepare(ftsSql).all(ftsQuery, ...bindValues) as unknown as EvidenceRow[];
      return rows.map(rowToEvidence);
    } catch {
      // Fallback to LIKE search if an exotic character slips past tokenizer
    }
  }

  const likePattern = `%${rawSearch}%`;
  const fallbackWhere = [
    '(e.filename LIKE ? OR e.file_hash LIKE ? OR e.full_text_index LIKE ? OR e.party_tokens_json LIKE ?)',
    ...whereClauses,
  ];
  const rows = db
    .prepare(`SELECT e.* FROM evidence e WHERE ${fallbackWhere.join(' AND ')} ORDER BY e.id DESC`)
    .all(likePattern, likePattern, likePattern, likePattern, ...bindValues) as unknown as EvidenceRow[];
  return rows.map(rowToEvidence);
}

export function deleteEvidence(id: number): boolean {
  const row = stmtGetEvidenceById.get(id) as EvidenceRow | undefined;
  if (!row) return false;

  db.exec('BEGIN IMMEDIATE');
  try {
    stmtDeleteEventsFtsByEvidenceId.run(id);
    stmtDeleteEvidenceFts.run(id);
    const res = stmtDeleteEvidence.run(id);
    db.exec('COMMIT');
    if (Number(res.changes) === 0) return false;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const candidatePaths = [
    row.vault_path,
    vaultFilePath(row.file_hash),
    legacyVaultFilePath(row.file_hash),
  ].filter(Boolean);
  for (const p of new Set(candidatePaths)) {
    secureDeleteFile(p);
  }
  return true;
}

export function purgeAllData(): { deleted_evidence: number; deleted_events: number } {
  const counts = getStorageCounts();
  const rows = db.prepare('SELECT file_hash, vault_path FROM evidence').all() as Array<{
    file_hash: string;
    vault_path: string;
  }>;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM events_fts');
    db.exec('DELETE FROM evidence_fts');
    db.exec('DELETE FROM analyzed_events');
    db.exec('DELETE FROM evidence');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  for (const row of rows) {
    for (const p of new Set([
      row.vault_path,
      vaultFilePath(row.file_hash),
      legacyVaultFilePath(row.file_hash),
    ])) {
      secureDeleteFile(p);
    }
  }

  if (fs.existsSync(VAULT_DIR)) {
    for (const entry of fs.readdirSync(VAULT_DIR)) {
      secureDeleteFile(path.join(VAULT_DIR, entry));
    }
  }

  return {
    deleted_evidence: counts.evidence_count,
    deleted_events: counts.events_count,
  };
}

function insertSingleEvent(input: Omit<AnalyzedEventRecord, 'id'>): AnalyzedEventRecord {
  const res = stmtInsertEvent.run(
    input.evidence_id,
    input.evidence_filename,
    input.timestamp,
    input.sender,
    input.receiver,
    input.content,
    input.severity_score,
    input.sender_id,
    input.receiver_id,
    input.conversation_id,
    input.message_id,
    input.subject,
    input.source_platform,
    input.document_category,
    input.is_verified ? 1 : 0,
    input.user_context_notes,
    JSON.stringify(input.all_flags),
    JSON.stringify(input.tactics_analyzed),
    JSON.stringify(input.matched_indicators),
    JSON.stringify(input.placement_citation),
    JSON.stringify(input.attribution_audit),
    input.raw_content_hash,
    input.pii_redacted_count
  );
  const created: AnalyzedEventRecord = { id: Number(res.lastInsertRowid), ...input };
  upsertEventFts(created);
  return created;
}

export function createAnalyzedEvent(
  input: Omit<AnalyzedEventRecord, 'id'>
): AnalyzedEventRecord {
  db.exec('BEGIN IMMEDIATE');
  try {
    const created = insertSingleEvent(input);
    db.exec('COMMIT');
    return created;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function createAnalyzedEventsBatch(
  inputs: Omit<AnalyzedEventRecord, 'id'>[]
): AnalyzedEventRecord[] {
  if (inputs.length === 0) return [];
  const created: AnalyzedEventRecord[] = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const item of inputs) {
      created.push(insertSingleEvent(item));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return created;
}

function sortEventsChronologically(events: AnalyzedEventRecord[]): AnalyzedEventRecord[] {
  return events.sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    }
    if (a.timestamp) return -1;
    if (b.timestamp) return 1;
    return a.id - b.id;
  });
}

export function listEvents(): AnalyzedEventRecord[] {
  const rows = stmtListEvents.all() as unknown as AnalyzedEventRow[];
  return sortEventsChronologically(rows.map(rowToEvent));
}

export interface SearchEventsParams {
  search?: string;
  severity?: number;
  is_verified?: boolean;
  source_platform?: string;
  evidence_id?: number;
  date_from?: string;
  date_to?: string;
  wheel?: string;
  document_category?: string;
  attribution_status?: string;
  sort?: 'chronological' | 'relevance';
}

export function searchEvents(params: SearchEventsParams = {}): AnalyzedEventRecord[] {
  const whereClauses: string[] = [];
  const bindValues: Array<string | number> = [];

  if (typeof params.severity === 'number' && !Number.isNaN(params.severity)) {
    whereClauses.push('ae.severity_score = ?');
    bindValues.push(params.severity);
  }
  if (typeof params.is_verified === 'boolean') {
    whereClauses.push('ae.is_verified = ?');
    bindValues.push(params.is_verified ? 1 : 0);
  }
  if (params.source_platform && params.source_platform !== 'all') {
    whereClauses.push('ae.source_platform = ?');
    bindValues.push(params.source_platform);
  }
  if (typeof params.evidence_id === 'number' && !Number.isNaN(params.evidence_id)) {
    whereClauses.push('ae.evidence_id = ?');
    bindValues.push(params.evidence_id);
  }
  if (params.document_category && params.document_category !== 'all') {
    whereClauses.push('ae.document_category = ?');
    bindValues.push(params.document_category);
  }

  const rawSearch = params.search?.trim() || '';
  const ftsQuery = rawSearch ? buildFtsQuery(rawSearch) : null;
  let records: AnalyzedEventRecord[] = [];

  if (rawSearch && ftsQuery) {
    try {
      const ftsSql = `
        SELECT ae.*,
               snippet(events_fts, -1, '[[M]]', '[[/M]]', '...', 20) AS search_snippet,
               bm25(events_fts) AS search_rank
        FROM events_fts
        JOIN analyzed_events ae ON ae.id = events_fts.event_id
        WHERE events_fts MATCH ?
        ${whereClauses.length > 0 ? `AND ${whereClauses.join(' AND ')}` : ''}
        ORDER BY search_rank ASC, ae.id ASC
      `;
      const rows = db.prepare(ftsSql).all(ftsQuery, ...bindValues) as unknown as AnalyzedEventRow[];
      records = rows.map(rowToEvent);
    } catch {
      const likePattern = `%${rawSearch}%`;
      const fallbackWhere = [
        '(ae.content LIKE ? OR ae.sender LIKE ? OR ae.receiver LIKE ? OR ae.user_context_notes LIKE ? OR ae.all_flags_json LIKE ? OR ae.matched_indicators_json LIKE ?)',
        ...whereClauses,
      ];
      const rows = db
        .prepare(`SELECT ae.* FROM analyzed_events ae WHERE ${fallbackWhere.join(' AND ')} ORDER BY ae.id ASC`)
        .all(
          likePattern,
          likePattern,
          likePattern,
          likePattern,
          likePattern,
          likePattern,
          ...bindValues
        ) as unknown as AnalyzedEventRow[];
      records = rows.map(rowToEvent);
    }
  } else if (rawSearch) {
    const likePattern = `%${rawSearch}%`;
    const fallbackWhere = [
      '(ae.content LIKE ? OR ae.sender LIKE ? OR ae.receiver LIKE ? OR ae.user_context_notes LIKE ? OR ae.placement_citation_json LIKE ?)',
      ...whereClauses,
    ];
    const rows = db
      .prepare(`SELECT ae.* FROM analyzed_events ae WHERE ${fallbackWhere.join(' AND ')} ORDER BY ae.id ASC`)
      .all(
        likePattern,
        likePattern,
        likePattern,
        likePattern,
        likePattern,
        ...bindValues
      ) as unknown as AnalyzedEventRow[];
    records = rows.map(rowToEvent);
  } else {
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT ae.* FROM analyzed_events ae ${whereSql} ORDER BY ae.id ASC`)
      .all(...bindValues) as unknown as AnalyzedEventRow[];
    records = rows.map(rowToEvent);
  }

  // Remaining structured filters on nested JSON / ISO timestamps
  if (params.date_from) {
    const fromMs = new Date(params.date_from).getTime();
    if (!Number.isNaN(fromMs)) {
      records = records.filter((e) => e.timestamp && new Date(e.timestamp).getTime() >= fromMs);
    }
  }
  if (params.date_to) {
    const toMs = new Date(params.date_to + 'T23:59:59.999Z').getTime();
    if (!Number.isNaN(toMs)) {
      records = records.filter((e) => e.timestamp && new Date(e.timestamp).getTime() <= toMs);
    }
  }
  if (params.wheel && params.wheel !== 'all') {
    records = records.filter((e) => e.all_flags.some((f) => f.wheel === params.wheel));
  }
  if (params.attribution_status && params.attribution_status !== 'all') {
    records = records.filter((e) => e.attribution_audit.status === params.attribution_status);
  }

  if (rawSearch && params.sort === 'relevance') {
    return records.sort((a, b) => (a.search_rank ?? 0) - (b.search_rank ?? 0));
  }

  return sortEventsChronologically(records);
}

export function unifiedFullTextSearch(
  rawQuery: string,
  options: { scope?: 'all' | 'evidence' | 'events'; limit?: number } = {}
): {
  query: string;
  fts_query: string | null;
  total_hits: number;
  evidence_hits: ForensicEvidenceRecord[];
  event_hits: AnalyzedEventRecord[];
} {
  const scope = options.scope || 'all';
  const limit = Math.max(1, Math.min(200, options.limit ?? 50));
  const ftsQuery = buildFtsQuery(rawQuery);

  const evidence_hits =
    scope === 'all' || scope === 'evidence'
      ? searchEvidence({ search: rawQuery }).slice(0, limit)
      : [];
  const event_hits =
    scope === 'all' || scope === 'events'
      ? searchEvents({ search: rawQuery, sort: 'relevance' }).slice(0, limit)
      : [];

  return {
    query: rawQuery,
    fts_query: ftsQuery,
    total_hits: evidence_hits.length + event_hits.length,
    evidence_hits,
    event_hits,
  };
}

export function getEventById(id: number): AnalyzedEventRecord | undefined {
  const row = stmtGetEventById.get(id) as AnalyzedEventRow | undefined;
  return row ? rowToEvent(row) : undefined;
}

export function updateEvidencePostAnalysis(
  id: number,
  patch: Partial<
    Pick<
      ForensicEvidenceRecord,
      'flagged_events_count' | 'pii_redactions' | 'attribution_summary' | 'party_tokens'
    >
  > & { full_text_index?: string }
): void {
  const row = stmtGetEvidenceById.get(id) as EvidenceRow | undefined;
  if (!row) return;
  const rec = rowToEvidence(row);

  const flaggedCount =
    typeof patch.flagged_events_count === 'number'
      ? patch.flagged_events_count
      : rec.flagged_events_count;
  const piiRedactions = patch.pii_redactions ?? rec.pii_redactions;
  const attrSummary = patch.attribution_summary ?? rec.attribution_summary;
  const partyTokens = patch.party_tokens ?? rec.party_tokens;
  const fullText =
    typeof patch.full_text_index === 'string'
      ? patch.full_text_index.slice(0, MAX_FULL_TEXT_INDEX_CHARS)
      : row.full_text_index || '';

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE evidence
      SET flagged_events_count = ?,
          pii_redactions_json = ?,
          attribution_summary_json = ?,
          party_tokens_json = ?,
          full_text_index = ?
      WHERE id = ?
    `).run(
      flaggedCount,
      JSON.stringify(piiRedactions),
      JSON.stringify(attrSummary),
      JSON.stringify(partyTokens),
      fullText,
      id
    );

    upsertEvidenceFts(
      {
        ...rec,
        flagged_events_count: flaggedCount,
        pii_redactions: piiRedactions,
        attribution_summary: attrSummary,
        party_tokens: partyTokens,
      },
      fullText
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function updateEvent(
  id: number,
  patch: Partial<
    Pick<AnalyzedEventRecord, 'is_verified' | 'user_context_notes' | 'sender' | 'receiver' | 'timestamp'>
  >
): AnalyzedEventRecord | undefined {
  const existing = getEventById(id);
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

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE analyzed_events
      SET is_verified = ?,
          user_context_notes = ?,
          sender = ?,
          receiver = ?,
          timestamp = ?,
          attribution_audit_json = ?
      WHERE id = ?
    `).run(
      existing.is_verified ? 1 : 0,
      existing.user_context_notes,
      existing.sender,
      existing.receiver,
      existing.timestamp,
      JSON.stringify(existing.attribution_audit),
      id
    );

    upsertEventFts(existing);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return existing;
}

export function getStorageCounts(): { evidence_count: number; events_count: number } {
  const evRow = db.prepare('SELECT COUNT(*) AS cnt FROM evidence').get() as { cnt: number };
  const eventRow = db.prepare('SELECT COUNT(*) AS cnt FROM analyzed_events').get() as { cnt: number };
  return {
    evidence_count: Number(evRow.cnt),
    events_count: Number(eventRow.cnt),
  };
}
