import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoerciveControlEngine } from './server/analysisEngine.ts';
import { buildChronologySections, type SectionByMode } from './server/chronologyEngine.ts';
import { CORPUS_CITATIONS } from './server/corpusTaxonomy.ts';
import { runAnalysisPipeline } from './server/analysisPipeline.ts';
import {
  FileValidationError,
  MAX_EVIDENCE_FILE_SIZE_BYTES,
  validateEvidenceUpload,
} from './server/fileSecurity.ts';
import { computeFileHash, processUpload } from './server/parsers.ts';
import {
  createEvidence,
  deleteEvidence,
  getEvidenceBuffer,
  getEvidenceById,
  hasEvidenceHash,
  listEvidence,
  listEvents,
  updateEvent,
  updateEvidencePostAnalysis,
} from './server/store.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production';

const LEGAL_DISCLAIMER =
  'EDUCATIONAL & PERSONAL USE ONLY: Screening output based on peer-reviewed scientific literature and the DAIP Duluth Model Power & Control Wheels. Not legal, medical, or expert forensic advice. Provided "AS IS" without warranty or liability; all attributions, OCR outputs, and citations must be independently verified by the user.';

const app = express();
const engine = new CoerciveControlEngine();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EVIDENCE_FILE_SIZE_BYTES },
});

app.use(express.json({ limit: '2mb' }));

// Security headers matching Django hardened settings
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/evidence', (_req, res) => {
  res.json({ evidence: listEvidence() });
});

app.post('/api/evidence/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No evidence file provided.' });
      return;
    }

    const { originalname, buffer, size } = req.file;
    const tzName = typeof req.body?.tz_name === 'string' && req.body.tz_name.trim()
      ? req.body.tz_name.trim()
      : 'UTC';
    const windowSizeRaw = Number.parseInt(String(req.body?.window_size ?? '5'), 10);
    const windowSize = Number.isNaN(windowSizeRaw) ? 5 : Math.max(1, Math.min(25, windowSizeRaw));
    const sanitizePii = String(req.body?.sanitize_pii ?? 'true').toLowerCase() !== 'false';
    const selfParty = typeof req.body?.self_party === 'string' ? req.body.self_party.trim() : '';
    const counterParty =
      typeof req.body?.counter_party === 'string' ? req.body.counter_party.trim() : '';

    validateEvidenceUpload(originalname, buffer);

    const fileHash = computeFileHash(buffer);
    if (hasEvidenceHash(fileHash)) {
      res.status(409).json({
        error: `Duplicate evidence file detected (SHA-256 ${fileHash.slice(0, 12)}... already exists in chain of custody).`,
      });
      return;
    }

    const { platform, documentCategory, messages, ocrUsed, ocrConfidence } = await processUpload(
      originalname,
      buffer
    );

    const evidence = createEvidence(
      {
        filename: originalname,
        file_size: size,
        file_hash: fileHash,
        upload_date: new Date().toISOString(),
        detected_platform: platform,
        document_category: documentCategory,
        total_messages_parsed: messages.length,
        flagged_events_count: 0,
        pii_sanitized: sanitizePii,
        pii_redactions: {
          emails: 0,
          phones: 0,
          ssn: 0,
          financial: 0,
          medical_ids: 0,
          addresses: 0,
          dob: 0,
        },
        ocr_used: ocrUsed,
        ocr_confidence: ocrConfidence,
        attribution_summary: {
          verified_strict: 0,
          inferred_needs_review: 0,
          ambiguous_warning: 0,
        },
        party_tokens: [],
      },
      buffer
    );

    const { events: persistedEvents, sanitization } = runAnalysisPipeline(messages, evidence, {
      tzName,
      windowSize,
      sanitizePii,
      selfParty,
      counterParty,
    });

    updateEvidencePostAnalysis(evidence.id, {
      flagged_events_count: persistedEvents.length,
      pii_redactions: sanitization.pii_redactions,
      attribution_summary: sanitization.attribution_summary,
      party_tokens: sanitization.party_tokens,
    });

    res.status(201).json({
      evidence: getEvidenceById(evidence.id),
      events_created: persistedEvents.length,
      events: persistedEvents,
      sanitization_summary: sanitization.pii_redactions,
      attribution_summary: sanitization.attribution_summary,
    });
  } catch (err) {
    if (err instanceof FileValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(400).json({
      error: (err as Error).message || 'Failed to ingest evidence file.',
    });
  }
});

app.get('/api/evidence/:id/verify-hash', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const evidence = getEvidenceById(id);
  const buffer = getEvidenceBuffer(id);

  if (!evidence || !buffer) {
    res.status(404).json({ error: 'Evidence record not found.' });
    return;
  }

  const currentHash = computeFileHash(buffer);
  const matches = currentHash === evidence.file_hash;
  res.json({
    id: evidence.id,
    filename: evidence.filename,
    stored_hash: evidence.file_hash,
    computed_hash: currentHash,
    verified: matches,
  });
});

app.delete('/api/evidence/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!deleteEvidence(id)) {
    res.status(404).json({ error: 'Evidence record not found.' });
    return;
  }
  res.json({ deleted: true, id });
});

app.get('/api/events', (req, res) => {
  let events = listEvents();

  const severityParam = typeof req.query.severity === 'string' ? req.query.severity : '';
  if (severityParam && severityParam !== 'all') {
    const sev = Number.parseInt(severityParam, 10);
    if (!Number.isNaN(sev)) {
      events = events.filter((e) => e.severity_score === sev);
    }
  }

  const verifiedParam = typeof req.query.is_verified === 'string' ? req.query.is_verified : '';
  if (verifiedParam === 'true') {
    events = events.filter((e) => e.is_verified);
  } else if (verifiedParam === 'false') {
    events = events.filter((e) => !e.is_verified);
  }

  const platformParam = typeof req.query.source_platform === 'string' ? req.query.source_platform : '';
  if (platformParam && platformParam !== 'all') {
    events = events.filter((e) => e.source_platform === platformParam);
  }

  const evidenceIdParam = typeof req.query.evidence_id === 'string' ? req.query.evidence_id : '';
  if (evidenceIdParam && evidenceIdParam !== 'all') {
    const evId = Number.parseInt(evidenceIdParam, 10);
    if (!Number.isNaN(evId)) {
      events = events.filter((e) => e.evidence_id === evId);
    }
  }

  const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from : '';
  if (dateFrom) {
    const fromMs = new Date(dateFrom).getTime();
    if (!Number.isNaN(fromMs)) {
      events = events.filter((e) => e.timestamp && new Date(e.timestamp).getTime() >= fromMs);
    }
  }

  const dateTo = typeof req.query.date_to === 'string' ? req.query.date_to : '';
  if (dateTo) {
    const toMs = new Date(dateTo + 'T23:59:59.999Z').getTime();
    if (!Number.isNaN(toMs)) {
      events = events.filter((e) => e.timestamp && new Date(e.timestamp).getTime() <= toMs);
    }
  }

  const wheelParam = typeof req.query.wheel === 'string' ? req.query.wheel : '';
  if (wheelParam && wheelParam !== 'all') {
    events = events.filter((e) => e.all_flags.some((f) => f.wheel === wheelParam));
  }

  const docCatParam =
    typeof req.query.document_category === 'string' ? req.query.document_category : '';
  if (docCatParam && docCatParam !== 'all') {
    events = events.filter((e) => e.document_category === docCatParam);
  }

  const attrParam =
    typeof req.query.attribution_status === 'string' ? req.query.attribution_status : '';
  if (attrParam && attrParam !== 'all') {
    events = events.filter((e) => e.attribution_audit.status === attrParam);
  }

  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  if (search) {
    events = events.filter(
      (e) =>
        e.content.toLowerCase().includes(search) ||
        e.sender.toLowerCase().includes(search) ||
        e.receiver.toLowerCase().includes(search) ||
        e.placement_citation.citation_label.toLowerCase().includes(search) ||
        e.user_context_notes.toLowerCase().includes(search) ||
        e.matched_indicators.some((ind) => ind.toLowerCase().includes(search)) ||
        e.all_flags.some(
          (f) =>
            f.wheel.toLowerCase().includes(search) ||
            f.category.toLowerCase().includes(search)
        )
    );
  }

  res.json({ events });
});

app.patch('/api/events/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const { is_verified, user_context_notes, sender, receiver, timestamp } = req.body ?? {};
  const updated = updateEvent(id, {
    is_verified: typeof is_verified === 'boolean' ? is_verified : undefined,
    user_context_notes: typeof user_context_notes === 'string' ? user_context_notes : undefined,
    sender: typeof sender === 'string' ? sender : undefined,
    receiver: typeof receiver === 'string' ? receiver : undefined,
    timestamp: timestamp === null || typeof timestamp === 'string' ? timestamp : undefined,
  });

  if (!updated) {
    res.status(404).json({ error: 'Analyzed event not found.' });
    return;
  }

  res.json({ event: updated });
});

app.get('/api/chronology', (req, res) => {
  const sectionByRaw = typeof req.query.section_by === 'string' ? req.query.section_by : 'day';
  const validModes: SectionByMode[] = ['day', 'month', 'source', 'framework'];
  const sectionBy: SectionByMode = validModes.includes(sectionByRaw as SectionByMode)
    ? (sectionByRaw as SectionByMode)
    : 'day';

  let events = listEvents();

  if (req.query.verified_only === 'true') {
    events = events.filter((e) => e.is_verified);
  }
  const docCat =
    typeof req.query.document_category === 'string' ? req.query.document_category : '';
  if (docCat && docCat !== 'all') {
    events = events.filter((e) => e.document_category === docCat);
  }
  const evidenceIdParam = typeof req.query.evidence_id === 'string' ? req.query.evidence_id : '';
  if (evidenceIdParam && evidenceIdParam !== 'all') {
    const evId = Number.parseInt(evidenceIdParam, 10);
    if (!Number.isNaN(evId)) {
      events = events.filter((e) => e.evidence_id === evId);
    }
  }

  const chronology = buildChronologySections(events, sectionBy);
  res.json({ legal_disclaimer: LEGAL_DISCLAIMER, section_by: sectionBy, ...chronology });
});

app.get('/api/timeline', (_req, res) => {
  const verifiedPoints = listEvents()
    .filter((event) => event.is_verified && event.timestamp !== null)
    .map((event) => ({
      id: event.id,
      time: event.timestamp as string,
      sender: event.sender,
      receiver: event.receiver,
      severity: event.severity_score,
      context: event.user_context_notes,
      content: event.content,
      source_platform: event.source_platform,
      all_flags: event.all_flags,
      tactics_analyzed: event.tactics_analyzed,
      matched_indicators: event.matched_indicators,
      placement_citation: event.placement_citation,
      attribution_audit: event.attribution_audit,
    }));

  if (verifiedPoints.length === 0) {
    res.json({
      empty: true,
      message: 'No verified events available to display timeline.',
      points: [],
    });
    return;
  }

  res.json({
    empty: false,
    points: verifiedPoints,
  });
});

app.get('/api/export/verified', (_req, res) => {
  const verified = listEvents()
    .filter((e) => e.is_verified)
    .map((e) => ({
      timestamp: e.timestamp,
      sender: e.sender,
      receiver: e.receiver,
      subject: e.subject,
      content: e.content,
      severity_score: e.severity_score,
      source_platform: e.source_platform,
      document_category: e.document_category,
      sender_id: e.sender_id,
      receiver_id: e.receiver_id,
      conversation_id: e.conversation_id,
      message_id: e.message_id,
      raw_content_hash: e.raw_content_hash,
      pii_redacted_count: e.pii_redacted_count,
      placement_citation: e.placement_citation,
      attribution_audit: e.attribution_audit,
      user_context_notes: e.user_context_notes,
      all_flags: e.all_flags,
      tactics_analyzed: e.tactics_analyzed,
      matched_indicators: e.matched_indicators,
      legal_disclaimer: LEGAL_DISCLAIMER,
    }));

  res.setHeader('X-Legal-Disclaimer', LEGAL_DISCLAIMER);
  res.setHeader('Content-Disposition', 'attachment; filename="verified_events.json"');
  res.json(verified);
});

app.get('/api/tactics', (_req, res) => {
  const tactics = engine.getTacticsCatalog();
  res.json({
    legal_disclaimer: LEGAL_DISCLAIMER,
    total_tactics: tactics.length,
    frameworks: Array.from(new Set(tactics.map((t) => t.wheel))),
    citations: CORPUS_CITATIONS,
    tactics,
  });
});

app.post('/api/analyze', (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  if (!text.trim()) {
    res.status(400).json({ error: 'Message text is required.' });
    return;
  }
  const result = engine.analyzeMessage(text);
  res.json({ legal_disclaimer: LEGAL_DISCLAIMER, result });
});

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }
  next(err);
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Acts of Abuse Analysis server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
