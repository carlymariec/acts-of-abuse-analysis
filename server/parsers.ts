import crypto from 'node:crypto';
import path from 'node:path';
import { parse as parseCsvSync } from 'csv-parse/sync';
import { XMLParser } from 'fast-xml-parser';
import { simpleParser } from 'mailparser';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';
import { IMAGE_OCR_EXTENSIONS } from './fileSecurity.ts';
import { runOcrOnImage } from './ocrEngine.ts';
import type { DocumentCategory, PlacementCitation, RawMessage } from './types.ts';

export const ALLOWED_PARSERS = new Set([
  'whatsapp',
  'facebook',
  'discord',
  'pdf',
  'eml',
  'csv',
  'xml',
  'docx',
  'ocr',
  'generic',
]);

export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function classifyDocumentCategory(
  filename: string,
  ext: string,
  platform: string,
  sampleText: string
): DocumentCategory {
  if (ext === '.eml' || platform === 'eml') return 'email';
  if (IMAGE_OCR_EXTENSIONS.has(ext) || platform === 'ocr') return 'screenshot_ocr';
  if (ext === '.csv') return 'spreadsheet_log';
  if (platform === 'whatsapp' || platform === 'facebook' || platform === 'discord' || platform === 'sms_xml') {
    return 'personal_communication';
  }

  const combined = `${filename} ${sampleText.slice(0, 2000)}`.toLowerCase();
  if (
    /\b(court|docket|plaintiff|defendant|petitioner|respondent|motion|affidavit|custody\s+order|restraining\s+order|subpoena|case\s+no|your\s+honor|superior\s+court|family\s+court|circuit\s+court)\b/.test(
      combined
    )
  ) {
    return 'court_document';
  }
  if (
    /\b(medical|hospital|clinic|patient|diagnosis|discharge|emergency\s+room|physician|pediatrician|therapy|psychiatrist|prescription|mrn|clinical\s+note)\b/.test(
      combined
    )
  ) {
    return 'medical_document';
  }
  if (ext === '.xml') return 'personal_communication';
  return 'generic_document';
}

function tryParseAnyTimestamp(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const dt = new Date(ms);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  const str = String(raw).trim();
  if (!str) return null;

  if (/^\d{10,13}$/.test(str)) {
    const num = Number.parseInt(str, 10);
    const ms = str.length === 10 ? num * 1000 : num;
    const dt = new Date(ms);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  const slashOrDash = str.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[\s,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AaPp][Mm]))?)?$/
  );
  if (slashOrDash) {
    const first = Number.parseInt(slashOrDash[1], 10);
    const second = Number.parseInt(slashOrDash[2], 10);
    let year = Number.parseInt(slashOrDash[3], 10);
    if (year < 100) year += 2000;
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    let hour = slashOrDash[4] ? Number.parseInt(slashOrDash[4], 10) : 12;
    const min = slashOrDash[5] ? Number.parseInt(slashOrDash[5], 10) : 0;
    const sec = slashOrDash[6] ? Number.parseInt(slashOrDash[6], 10) : 0;
    const ampm = slashOrDash[7]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    const dt = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function makePlacement(
  filename: string,
  platform: string,
  documentCategory: DocumentCategory,
  extra: Omit<PlacementCitation, 'filename' | 'platform' | 'document_category' | 'citation_label'>,
  labelDetail: string
): PlacementCitation {
  return {
    filename,
    platform,
    document_category: documentCategory,
    ...extra,
    citation_label: `${filename} · ${labelDetail}`,
  };
}

function parseSlashDateTime(dateStr: string, timeStr: string): string | null {
  return tryParseAnyTimestamp(`${dateStr} ${timeStr}`);
}

const WHATSAPP_LINE_PATTERN =
  /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]?\s+-?\s?(.+?):\s(.+)$/;

export function parseWhatsapp(text: string, filename = 'whatsapp.txt'): RawMessage[] {
  const messages: RawMessage[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, idx) => {
    const lineNum = idx + 1;
    const stripped = rawLine.trim();
    const match = WHATSAPP_LINE_PATTERN.exec(stripped);
    if (match) {
      const [, dateStr, timeStr, sender, content] = match;
      messages.push({
        timestamp: parseSlashDateTime(dateStr, timeStr),
        sender: sender.trim(),
        receiver: 'Chat Thread Participant(s)',
        content: content.trim(),
        source_platform: 'whatsapp',
        document_category: 'personal_communication',
        attribution_method: 'explicit_chat_metadata',
        placement: makePlacement(
          filename,
          'whatsapp',
          'personal_communication',
          { line_start: lineNum, line_end: lineNum },
          `Line ${lineNum}`
        ),
      });
    } else if (stripped && messages.length > 0) {
      const last = messages[messages.length - 1];
      last.content += '\n' + stripped;
      if (last.placement) {
        last.placement.line_end = lineNum;
        last.placement.citation_label = `${filename} · Lines ${last.placement.line_start}–${lineNum}`;
      }
    }
  });

  // If 2 unique senders exist, strictly attribute receiver as the other participant
  const senders = Array.from(new Set(messages.map((m) => m.sender).filter(Boolean)));
  if (senders.length === 2) {
    for (const msg of messages) {
      msg.receiver = msg.sender === senders[0] ? senders[1] : senders[0];
    }
  }

  return messages;
}

export function parseFacebook(text: string, filename = 'facebook.json'): RawMessage[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON in Facebook export file: ${(err as Error).message}`);
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Unexpected JSON structure in Facebook export file: expected a JSON object at the top level.');
  }

  const obj = data as Record<string, unknown>;
  const participants = Array.isArray(obj.participants)
    ? obj.participants
        .map((p) =>
          p && typeof p === 'object' && typeof (p as Record<string, unknown>).name === 'string'
            ? String((p as Record<string, unknown>).name)
            : ''
        )
        .filter(Boolean)
    : [];

  const rawMsgs = Array.isArray(obj.messages) ? obj.messages : [];
  const messages: RawMessage[] = [];

  rawMsgs.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const msg = item as Record<string, unknown>;
    const content = typeof msg.content === 'string' ? msg.content : '';
    if (!content) return;

    const tsMs = typeof msg.timestamp_ms === 'number' ? msg.timestamp_ms : null;
    const ts = tsMs !== null ? new Date(tsMs).toISOString() : null;
    const sender = typeof msg.sender_name === 'string' ? msg.sender_name : 'Unknown';
    const others = participants.filter((p) => p !== sender);
    const receiver =
      others.length === 1
        ? others[0]
        : others.length > 1
          ? others.join(', ')
          : 'Facebook Thread Participant(s)';

    messages.push({
      timestamp: ts,
      sender,
      receiver,
      content,
      source_platform: 'facebook',
      document_category: 'personal_communication',
      attribution_method: others.length > 0 ? 'explicit_chat_metadata' : 'inferred_from_structure',
      placement: makePlacement(
        filename,
        'facebook',
        'personal_communication',
        { json_index: idx },
        `JSON messages[${idx}]`
      ),
    });
  });

  return messages;
}

export function parseDiscord(text: string, filename = 'discord.json'): RawMessage[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid Discord export JSON file: ${(err as Error).message}`);
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Unexpected JSON structure in Discord export file: expected a JSON object.');
  }

  const obj = data as Record<string, unknown>;
  const channel =
    obj.channel && typeof obj.channel === 'object' ? (obj.channel as Record<string, unknown>) : null;
  const conversationId = channel && typeof channel.id === 'string' ? channel.id : '';
  const channelName = channel && typeof channel.name === 'string' ? channel.name : '';
  const rawMsgs = Array.isArray(obj.messages) ? obj.messages : [];
  const messages: RawMessage[] = [];

  rawMsgs.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const msg = item as Record<string, unknown>;
    const content = typeof msg.content === 'string' ? msg.content : '';
    if (!content) return;

    const ts = tryParseAnyTimestamp(msg.timestamp);
    const author =
      msg.author && typeof msg.author === 'object' ? (msg.author as Record<string, unknown>) : {};
    const sender = typeof author.name === 'string' ? author.name : 'Unknown';
    const senderId = typeof author.id === 'string' ? author.id : '';
    const messageId = typeof msg.id === 'string' ? msg.id : '';

    messages.push({
      timestamp: ts,
      sender,
      receiver: channelName ? `Channel #${channelName}` : 'Discord Channel Recipient',
      content,
      sender_id: senderId,
      conversation_id: conversationId,
      message_id: messageId,
      source_platform: 'discord',
      document_category: 'personal_communication',
      attribution_method: 'explicit_chat_metadata',
      placement: makePlacement(
        filename,
        'discord',
        'personal_communication',
        { json_index: idx },
        `JSON messages[${idx}]${messageId ? ` (id: ${messageId})` : ''}`
      ),
    });
  });

  return messages;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function parseEml(buffer: Buffer, filename = 'email.eml'): Promise<RawMessage[]> {
  const parsed = await simpleParser(buffer);

  const fromText = parsed.from?.text?.trim() || 'Unknown';
  const toList: string[] = [];
  if (parsed.to) {
    const arr = Array.isArray(parsed.to) ? parsed.to : [parsed.to];
    for (const addr of arr) {
      if (addr.text) toList.push(addr.text.trim());
    }
  }
  if (parsed.cc) {
    const arr = Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc];
    for (const addr of arr) {
      if (addr.text) toList.push(`CC: ${addr.text.trim()}`);
    }
  }

  const receiver = toList.length > 0 ? toList.join('; ') : 'Unstated Recipient';
  const subject = (parsed.subject || '').trim();
  const baseTimestamp = parsed.date ? parsed.date.toISOString() : null;
  const messageId = (parsed.messageId || '').trim();
  const inReplyTo = typeof parsed.inReplyTo === 'string' ? parsed.inReplyTo : '';

  const rawText = (parsed.text || '').trim()
    ? (parsed.text || '').trim()
    : typeof parsed.html === 'string'
      ? stripHtmlTags(parsed.html)
      : '';

  if (!rawText && !subject) return [];

  // Split forwarded/quoted sub-messages when explicit email header blocks appear inline
  const lines = rawText.split(/\r?\n/);
  const headerBlockStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (
      /^\s*From:\s*.+/i.test(lines[i]) &&
      i + 1 < lines.length &&
      /^\s*(Sent|Date|To|Subject):/i.test(lines[i + 1])
    ) {
      headerBlockStarts.push(i);
    }
  }

  const messages: RawMessage[] = [];

  if (headerBlockStarts.length === 0) {
    const bodyWithSubj = subject ? `Subject: ${subject}\n\n${rawText}`.trim() : rawText;
    messages.push({
      timestamp: baseTimestamp,
      sender: fromText,
      receiver,
      content: bodyWithSubj,
      subject,
      message_id: messageId,
      conversation_id: inReplyTo || messageId,
      source_platform: 'eml',
      document_category: 'email',
      attribution_method:
        toList.length > 0 && fromText !== 'Unknown'
          ? 'explicit_email_header'
          : 'inferred_from_structure',
      placement: makePlacement(
        filename,
        'eml',
        'email',
        { section: 'Primary Message', line_start: 1, line_end: Math.max(1, lines.length) },
        `Email Primary Body (Lines 1–${Math.max(1, lines.length)})`
      ),
    });
    return messages;
  }

  // Primary message before first quoted header block
  const firstQuoteIdx = headerBlockStarts[0];
  const primaryBody = lines.slice(0, firstQuoteIdx).join('\n').trim();
  if (primaryBody || subject) {
    messages.push({
      timestamp: baseTimestamp,
      sender: fromText,
      receiver,
      content: subject ? `Subject: ${subject}\n\n${primaryBody}`.trim() : primaryBody,
      subject,
      message_id: messageId,
      conversation_id: inReplyTo || messageId,
      source_platform: 'eml',
      document_category: 'email',
      attribution_method:
        toList.length > 0 && fromText !== 'Unknown'
          ? 'explicit_email_header'
          : 'inferred_from_structure',
      placement: makePlacement(
        filename,
        'eml',
        'email',
        { section: 'Primary Message', line_start: 1, line_end: Math.max(1, firstQuoteIdx) },
        `Email Top Message (Lines 1–${Math.max(1, firstQuoteIdx)})`
      ),
    });
  }

  // Each quoted/forwarded block gets its own strictly attributed From/To/Date extraction
  for (let b = 0; b < headerBlockStarts.length; b++) {
    const startIdx = headerBlockStarts[b];
    const endIdx = b + 1 < headerBlockStarts.length ? headerBlockStarts[b + 1] : lines.length;
    const blockLines = lines.slice(startIdx, endIdx);

    let qFrom = 'Unknown';
    let qTo = 'Unstated Recipient';
    let qDate: string | null = null;
    let qSubj = subject;
    let bodyStart = 0;

    for (let k = 0; k < Math.min(8, blockLines.length); k++) {
      const l = blockLines[k].trim();
      if (/^From:\s*/i.test(l)) {
        qFrom = l.replace(/^From:\s*/i, '').trim();
        bodyStart = k + 1;
      } else if (/^To:\s*/i.test(l)) {
        qTo = l.replace(/^To:\s*/i, '').trim();
        bodyStart = k + 1;
      } else if (/^(Sent|Date):\s*/i.test(l)) {
        qDate = tryParseAnyTimestamp(l.replace(/^(Sent|Date):\s*/i, '').trim());
        bodyStart = k + 1;
      } else if (/^Subject:\s*/i.test(l)) {
        qSubj = l.replace(/^Subject:\s*/i, '').trim();
        bodyStart = k + 1;
      } else if (l === '') {
        bodyStart = k + 1;
        break;
      }
    }

    const qBody = blockLines.slice(bodyStart).join('\n').trim();
    if (qBody) {
      messages.push({
        timestamp: qDate,
        sender: qFrom,
        receiver: qTo,
        content: qSubj ? `Subject: ${qSubj}\n\n${qBody}` : qBody,
        subject: qSubj,
        conversation_id: inReplyTo || messageId,
        source_platform: 'eml',
        document_category: 'email',
        attribution_method:
          qFrom !== 'Unknown' && qTo !== 'Unstated Recipient'
            ? 'explicit_email_header'
            : 'inferred_from_structure',
        placement: makePlacement(
          filename,
          'eml',
          'email',
          {
            section: `Quoted Thread #${b + 1}`,
            line_start: startIdx + 1,
            line_end: endIdx,
          },
          `Quoted Thread #${b + 1} (Lines ${startIdx + 1}–${endIdx})`
        ),
      });
    }
  }

  return messages;
}

function findCsvColumn(headers: string[], candidates: string[]): string | null {
  const lowerMap = new Map(headers.map((h) => [h.toLowerCase().trim(), h]));
  for (const cand of candidates) {
    const match = lowerMap.get(cand);
    if (match) return match;
  }
  for (const h of headers) {
    const hl = h.toLowerCase();
    if (candidates.some((cand) => hl.includes(cand))) {
      return h;
    }
  }
  return null;
}

export function parseCsv(text: string, filename = 'evidence.csv'): RawMessage[] {
  const records = parseCsvSync(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  }) as Array<Record<string, string>>;

  if (records.length === 0) return [];
  const headers = Object.keys(records[0]);

  const tsCol = findCsvColumn(headers, [
    'timestamp',
    'datetime',
    'date_sent',
    'sent_at',
    'message_date',
    'date',
    'time',
    'created_at',
  ]);
  const senderCol = findCsvColumn(headers, [
    'sender',
    'from',
    'sender_name',
    'from_address',
    'author',
    'speaker',
  ]);
  const receiverCol = findCsvColumn(headers, [
    'receiver',
    'recipient',
    'to',
    'to_address',
    'recipient_name',
  ]);
  const partyCol = findCsvColumn(headers, ['contact', 'party', 'name', 'phone_number', 'number']);
  const directionCol = findCsvColumn(headers, ['direction', 'type', 'status']);
  const contentCol = findCsvColumn(headers, [
    'content',
    'body',
    'message',
    'text',
    'statement',
    'description',
    'notes',
    'entry',
  ]);
  const subjectCol = findCsvColumn(headers, ['subject', 'title', 'topic']);
  const platformCol = findCsvColumn(headers, ['platform', 'source', 'app', 'channel']);
  const idCol = findCsvColumn(headers, ['message_id', 'id', 'guid']);

  const messages: RawMessage[] = [];

  records.forEach((row, idx) => {
    const csvRowNum = idx + 2; // +1 for 1-based, +1 for header row
    const content = contentCol
      ? (row[contentCol] || '').trim()
      : Object.entries(row)
          .filter(([, v]) => Boolean(v))
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ');
    if (!content) return;

    const ts = tsCol ? tryParseAnyTimestamp(row[tsCol]) : null;
    let sender = senderCol ? (row[senderCol] || '').trim() : '';
    let receiver = receiverCol ? (row[receiverCol] || '').trim() : '';
    const direction = directionCol ? (row[directionCol] || '').trim().toLowerCase() : '';
    const otherParty = partyCol ? (row[partyCol] || '').trim() : '';

    let method = 'inferred_from_structure';
    if (sender && receiver) {
      method = 'explicit_csv_columns';
    } else if (direction && otherParty) {
      if (/^(in|incoming|received|rx)/.test(direction)) {
        sender = sender || otherParty;
        receiver = receiver || 'Account Owner (Inferred)';
        method = 'explicit_csv_columns';
      } else if (/^(out|outgoing|sent|tx)/.test(direction)) {
        sender = sender || 'Account Owner (Inferred)';
        receiver = receiver || otherParty;
        method = 'explicit_csv_columns';
      }
    }

    const subject = subjectCol ? (row[subjectCol] || '').trim() : '';
    const rowPlatform = platformCol ? (row[platformCol] || '').trim().toLowerCase() : 'csv';
    const messageId = idCol ? (row[idCol] || '').trim() : '';
    const docCat = classifyDocumentCategory(filename, '.csv', rowPlatform || 'csv', content);

    messages.push({
      timestamp: ts,
      sender: sender || 'Unknown',
      receiver: receiver || 'Unstated Recipient',
      content: subject ? `Subject: ${subject}\n${content}` : content,
      subject,
      message_id: messageId,
      source_platform: rowPlatform || 'csv',
      document_category: docCat,
      attribution_method: method,
      placement: makePlacement(
        filename,
        rowPlatform || 'csv',
        docCat,
        { row: csvRowNum },
        `CSV Row ${csvRowNum}`
      ),
    });
  });

  return messages;
}

function asArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

export function parseXml(text: string, filename = 'evidence.xml'): RawMessage[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: true,
  });

  const parsed = parser.parse(text) as Record<string, unknown>;
  const messages: RawMessage[] = [];

  // 1. Android SMS Backup & Restore (<smses><sms .../></smses>)
  const smsesRoot = parsed.smses as Record<string, unknown> | undefined;
  if (smsesRoot) {
    const smsList = asArray(smsesRoot.sms as Record<string, unknown> | Record<string, unknown>[]);
    smsList.forEach((sms, idx) => {
      const body = String(sms['@_body'] ?? sms.body ?? '').trim();
      if (!body) return;
      const typeVal = String(sms['@_type'] ?? '');
      const contact = String(sms['@_contact_name'] || sms['@_address'] || 'Unknown Contact').trim();
      const ts = tryParseAnyTimestamp(sms['@_date']);

      // type 1 = received, type 2 = sent
      const isReceived = typeVal === '1';
      const isSent = typeVal === '2';
      const sender = isReceived ? contact : isSent ? 'Account Owner (Self)' : contact;
      const receiver = isReceived ? 'Account Owner (Self)' : isSent ? contact : 'Unstated Recipient';

      messages.push({
        timestamp: ts,
        sender,
        receiver,
        content: body,
        source_platform: 'sms_xml',
        document_category: 'personal_communication',
        attribution_method: isReceived || isSent ? 'explicit_xml_direction' : 'inferred_from_structure',
        placement: makePlacement(
          filename,
          'sms_xml',
          'personal_communication',
          { xml_path: `/smses/sms[${idx + 1}]` },
          `XML /smses/sms[${idx + 1}]`
        ),
      });
    });

    if (messages.length > 0) return messages;
  }

  // 2. Generic XML record arrays (<message>, <email>, <event>, <record>, <entry>, <item>)
  const walkXml = (node: unknown, currentPath: string): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item, idx) => walkXml(item, `${currentPath}[${idx + 1}]`));
      return;
    }

    const rec = node as Record<string, unknown>;
    const body =
      rec.body ?? rec.content ?? rec.text ?? rec.message ?? rec.description ?? rec['@_body'];
    if (typeof body === 'string' && body.trim()) {
      const sender = String(
        rec.sender ?? rec.from ?? rec.author ?? rec['@_sender'] ?? rec['@_from'] ?? 'Unknown'
      ).trim();
      const receiver = String(
        rec.receiver ?? rec.recipient ?? rec.to ?? rec['@_receiver'] ?? rec['@_to'] ?? 'Unstated Recipient'
      ).trim();
      const ts = tryParseAnyTimestamp(
        rec.timestamp ?? rec.date ?? rec.sent_at ?? rec['@_date'] ?? rec['@_timestamp']
      );
      const subject = typeof rec.subject === 'string' ? rec.subject.trim() : '';
      const hasExplicit = sender !== 'Unknown' && receiver !== 'Unstated Recipient';
      const docCat = classifyDocumentCategory(filename, '.xml', 'xml', body);

      messages.push({
        timestamp: ts,
        sender,
        receiver,
        content: subject ? `Subject: ${subject}\n${body.trim()}` : body.trim(),
        subject,
        source_platform: 'xml',
        document_category: docCat,
        attribution_method: hasExplicit ? 'explicit_xml_direction' : 'inferred_from_structure',
        placement: makePlacement(
          filename,
          'xml',
          docCat,
          { xml_path: currentPath },
          `XML ${currentPath}`
        ),
      });
      return;
    }

    for (const [key, val] of Object.entries(rec)) {
      if (!key.startsWith('@_') && key !== '#text') {
        walkXml(val, `${currentPath}/${key}`);
      }
    }
  };

  walkXml(parsed, '');
  return messages;
}

function segmentDocumentParagraphs(
  text: string,
  filename: string,
  platform: string,
  ext: string,
  pageNumber?: number
): RawMessage[] {
  const lines = text.split(/\r?\n/);
  const docCat = classifyDocumentCategory(filename, ext, platform, text);

  // Split into meaningful paragraph/section blocks tracking exact line numbers
  const blocks: Array<{ startLine: number; endLine: number; text: string }> = [];
  let curLines: string[] = [];
  let curStart = 1;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln) {
      if (curLines.length > 0) {
        blocks.push({ startLine: curStart, endLine: i, text: curLines.join('\n') });
        curLines = [];
      }
      curStart = i + 2;
    } else {
      if (curLines.length === 0) curStart = i + 1;
      curLines.push(ln);
    }
  }
  if (curLines.length > 0) {
    blocks.push({ startLine: curStart, endLine: lines.length, text: curLines.join('\n') });
  }

  return blocks.map((blk, idx) => {
    const paraNum = idx + 1;
    // Detect inline From:/To:/Speaker:/Date: metadata inside document blocks
    const fromMatch = blk.text.match(/(?:^|\n)\s*From:\s*([^\n]+)/i);
    const toMatch = blk.text.match(/(?:^|\n)\s*To:\s*([^\n]+)/i);
    const dateMatch = blk.text.match(
      /(?:^|\n)\s*(?:Date|Filed|Sent|Entered):\s*([^\n]+)/i
    );
    const speakerMatch = blk.text.match(/^([A-Z][A-Za-z0-9 ._-]{1,40}):\s+(.+)$/s);

    const sender = fromMatch
      ? fromMatch[1].trim()
      : speakerMatch
        ? speakerMatch[1].trim()
        : pageNumber
          ? `Document Author (Page ${pageNumber})`
          : 'Document Author (Inferred)';

    const receiver = toMatch ? toMatch[1].trim() : 'Document Subject / Court Record';
    const ts = dateMatch ? tryParseAnyTimestamp(dateMatch[1]) : null;
    const hasExplicit = Boolean(fromMatch && toMatch);

    const locDesc = pageNumber
      ? `Page ${pageNumber}, Para ${paraNum} (Lines ${blk.startLine}–${blk.endLine})`
      : `Section/Para ${paraNum} (Lines ${blk.startLine}–${blk.endLine})`;

    return {
      timestamp: ts,
      sender,
      receiver,
      content: blk.text,
      source_platform: platform,
      document_category: docCat,
      attribution_method: hasExplicit ? 'explicit_transcript_header' : 'inferred_from_structure',
      placement: makePlacement(
        filename,
        platform,
        docCat,
        {
          page: pageNumber,
          paragraph: paraNum,
          line_start: blk.startLine,
          line_end: blk.endLine,
        },
        locDesc
      ),
    };
  });
}

export async function parsePdf(buffer: Buffer, filename = 'document.pdf'): Promise<RawMessage[]> {
  const result = await extractText(new Uint8Array(buffer), { mergePages: false });
  const pages = Array.isArray(result.text) ? result.text : [String(result.text || '')];
  const messages: RawMessage[] = [];

  pages.forEach((pageText, index) => {
    const trimmed = (pageText || '').trim();
    if (!trimmed) return;
    const blocks = segmentDocumentParagraphs(trimmed, filename, 'pdf', '.pdf', index + 1);
    messages.push(...blocks);
  });

  return messages;
}

export async function parseDocx(buffer: Buffer, filename = 'document.docx'): Promise<RawMessage[]> {
  const result = await mammoth.extractRawText({ buffer });
  const text = (result.value || '').trim();
  if (!text) return [];
  return segmentDocumentParagraphs(text, filename, 'docx', '.docx');
}

export async function parseOcrImage(
  buffer: Buffer,
  filename = 'screenshot.png'
): Promise<{ messages: RawMessage[]; ocrConfidence: number }> {
  const ocr = await runOcrOnImage(buffer);
  const lines = ocr.lines;
  if (lines.length === 0) {
    return { messages: [], ocrConfidence: ocr.confidence };
  }

  // Try parsing line-level chat or timestamp patterns inside OCR text first
  const parsedMsgs: RawMessage[] = [];
  const fullText = lines.map((l) => l.text).join('\n');

  // Check if OCR text matches WhatsApp/chat format
  const whatsappAttempt = parseWhatsapp(fullText, filename);
  if (whatsappAttempt.length > 0) {
    for (const msg of whatsappAttempt) {
      msg.source_platform = 'ocr';
      msg.document_category = 'screenshot_ocr';
      msg.ocr_confidence = ocr.confidence;
      if (msg.placement) {
        msg.placement.platform = 'ocr';
        msg.placement.document_category = 'screenshot_ocr';
        msg.placement.ocr_confidence = ocr.confidence;
        msg.placement.citation_label = `${filename} · OCR Lines ${msg.placement.line_start}–${msg.placement.line_end} (Conf: ${ocr.confidence}%)`;
      }
    }
    return { messages: whatsappAttempt, ocrConfidence: ocr.confidence };
  }

  // Otherwise group OCR lines into coherent blocks (preserving From:/To:/Speaker: if recognized)
  const blocks = segmentDocumentParagraphs(fullText, filename, 'ocr', '.png');
  for (const blk of blocks) {
    blk.document_category = 'screenshot_ocr';
    blk.ocr_confidence = ocr.confidence;
    if (blk.sender.startsWith('Document Author')) {
      blk.sender = 'OCR Screenshot Speaker (Review Attribution)';
    }
    if ((blk.receiver || '').startsWith('Document Subject')) {
      blk.receiver = 'Screenshot Recipient (Inferred)';
    }
    if (blk.placement) {
      blk.placement.document_category = 'screenshot_ocr';
      blk.placement.ocr_confidence = ocr.confidence;
      blk.placement.citation_label = `${filename} · OCR Lines ${blk.placement.line_start}–${blk.placement.line_end} (Conf: ${ocr.confidence}%)`;
    }
    parsedMsgs.push(blk);
  }

  return { messages: parsedMsgs, ocrConfidence: ocr.confidence };
}

const GENERIC_TIMESTAMP_PATTERN =
  /^(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}[\s,T]+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\s*[-:>]\s*(.+)$/;

const GENERIC_SENDER_PATTERN = /^([A-Za-z][A-Za-z0-9 ._-]{0,49}):\s+(.+)$/s;

function extractSenderAndContent(rawContent: string): [string, string, boolean] {
  const match = GENERIC_SENDER_PATTERN.exec(rawContent.trim());
  if (match) {
    return [match[1].trim(), match[2].trim(), true];
  }
  return ['Unknown', rawContent.trim(), false];
}

export function parseGeneric(
  text: string,
  filename = 'evidence.txt',
  ext = '.txt'
): RawMessage[] {
  let cleanText = text;
  if (ext === '.html' || ext === '.htm') {
    cleanText = stripHtmlTags(text);
  } else if (ext === '.rtf') {
    cleanText = text
      .replace(/\\par\b/g, '\n')
      .replace(/\\[a-z]+\d*\s?/gi, ' ')
      .replace(/[{}]/g, '')
      .trim();
  }

  const messages: RawMessage[] = [];
  const lines = cleanText.split(/\r?\n/);
  const docCat = classifyDocumentCategory(filename, ext, 'generic', cleanText);

  lines.forEach((rawLine, idx) => {
    const lineNum = idx + 1;
    const line = rawLine.trim();
    if (!line) return;

    const match = GENERIC_TIMESTAMP_PATTERN.exec(line);
    if (match) {
      const [, tsStr, rawContent] = match;
      const ts = tryParseAnyTimestamp(tsStr);
      const [sender, content, hasSpeaker] = extractSenderAndContent(rawContent);
      messages.push({
        timestamp: ts,
        sender,
        receiver: 'Conversation / Document Recipient',
        content,
        source_platform: 'generic',
        document_category: docCat,
        attribution_method: hasSpeaker ? 'explicit_transcript_header' : 'inferred_from_structure',
        placement: makePlacement(
          filename,
          'generic',
          docCat,
          { line_start: lineNum, line_end: lineNum },
          `Line ${lineNum}`
        ),
      });
    } else {
      const [sender, content, hasSpeaker] = extractSenderAndContent(line);
      messages.push({
        timestamp: null,
        sender,
        receiver: 'Conversation / Document Recipient',
        content,
        source_platform: 'generic',
        document_category: docCat,
        attribution_method: hasSpeaker ? 'explicit_transcript_header' : 'inferred_from_structure',
        placement: makePlacement(
          filename,
          'generic',
          docCat,
          { line_start: lineNum, line_end: lineNum },
          `Line ${lineNum}`
        ),
      });
    }
  });

  // If exactly 2 named speakers exist in a transcript, link each as the other's receiver
  const namedSpeakers = Array.from(
    new Set(messages.map((m) => m.sender).filter((s) => s && s !== 'Unknown'))
  );
  if (namedSpeakers.length === 2) {
    for (const msg of messages) {
      if (msg.sender === namedSpeakers[0]) msg.receiver = namedSpeakers[1];
      else if (msg.sender === namedSpeakers[1]) msg.receiver = namedSpeakers[0];
    }
  }

  return messages;
}

export function detectJsonPlatform(text: string): 'facebook' | 'discord' | null {
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if ('participants' in data && 'messages' in data) return 'facebook';
    if ('guild' in data || 'channel' in data) return 'discord';
    return null;
  } catch {
    return null;
  }
}

export interface ProcessUploadOutput {
  platform: string;
  documentCategory: DocumentCategory;
  messages: RawMessage[];
  ocrUsed: boolean;
  ocrConfidence?: number;
}

export async function processUpload(
  filename: string,
  buffer: Buffer
): Promise<ProcessUploadOutput> {
  const ext = path.extname(filename || '').toLowerCase();

  if (IMAGE_OCR_EXTENSIONS.has(ext)) {
    const { messages, ocrConfidence } = await parseOcrImage(buffer, filename);
    return {
      platform: 'ocr',
      documentCategory: 'screenshot_ocr',
      messages,
      ocrUsed: true,
      ocrConfidence,
    };
  }

  if (ext === '.eml') {
    const messages = await parseEml(buffer, filename);
    return {
      platform: 'eml',
      documentCategory: 'email',
      messages,
      ocrUsed: false,
    };
  }

  if (ext === '.csv') {
    const text = buffer.toString('utf8');
    const messages = parseCsv(text, filename);
    return {
      platform: messages[0]?.source_platform || 'csv',
      documentCategory: messages[0]?.document_category || 'spreadsheet_log',
      messages,
      ocrUsed: false,
    };
  }

  if (ext === '.xml') {
    const text = buffer.toString('utf8');
    const messages = parseXml(text, filename);
    return {
      platform: messages[0]?.source_platform || 'xml',
      documentCategory: messages[0]?.document_category || 'personal_communication',
      messages,
      ocrUsed: false,
    };
  }

  if (ext === '.docx') {
    const messages = await parseDocx(buffer, filename);
    return {
      platform: 'docx',
      documentCategory: messages[0]?.document_category || 'generic_document',
      messages,
      ocrUsed: false,
    };
  }

  if (ext === '.pdf') {
    const messages = await parsePdf(buffer, filename);
    return {
      platform: 'pdf',
      documentCategory: messages[0]?.document_category || 'generic_document',
      messages,
      ocrUsed: false,
    };
  }

  if (ext === '.json') {
    const text = buffer.toString('utf8');
    const platform = detectJsonPlatform(text);
    if (platform === 'facebook') {
      return {
        platform: 'facebook',
        documentCategory: 'personal_communication',
        messages: parseFacebook(text, filename),
        ocrUsed: false,
      };
    }
    if (platform === 'discord') {
      return {
        platform: 'discord',
        documentCategory: 'personal_communication',
        messages: parseDiscord(text, filename),
        ocrUsed: false,
      };
    }
    const msgs = parseGeneric(text, filename, ext);
    return {
      platform: 'generic',
      documentCategory: msgs[0]?.document_category || 'generic_document',
      messages: msgs,
      ocrUsed: false,
    };
  }

  if (ext === '.txt') {
    const text = buffer.toString('utf8');
    const whatsappMsgs = parseWhatsapp(text, filename);
    if (whatsappMsgs.length > 0) {
      return {
        platform: 'whatsapp',
        documentCategory: 'personal_communication',
        messages: whatsappMsgs,
        ocrUsed: false,
      };
    }
    const genericMsgs = parseGeneric(text, filename, ext);
    return {
      platform: 'generic',
      documentCategory: genericMsgs[0]?.document_category || 'generic_document',
      messages: genericMsgs,
      ocrUsed: false,
    };
  }

  const text = buffer.toString('utf8');
  const genericMsgs = parseGeneric(text, filename, ext);
  return {
    platform: 'generic',
    documentCategory: genericMsgs[0]?.document_category || 'generic_document',
    messages: genericMsgs,
    ocrUsed: false,
  };
}
