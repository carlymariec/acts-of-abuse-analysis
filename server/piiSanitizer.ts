import crypto from 'node:crypto';
import type {
  AttributionAudit,
  AttributionStatus,
  PartyTokenMapping,
  PiiRedactionCounts,
  RawMessage,
} from './types.ts';

export interface SanitizedMessageResult {
  message: RawMessage;
  receiver: string;
  receiver_id: string;
  subject: string;
  attribution_audit: AttributionAudit;
  raw_content_hash: string;
  pii_redacted_count: number;
}

export interface BatchSanitizationOutput {
  items: SanitizedMessageResult[];
  pii_redactions: PiiRedactionCounts;
  party_tokens: PartyTokenMapping[];
  attribution_summary: {
    verified_strict: number;
    inferred_needs_review: number;
    ambiguous_warning: number;
  };
}

interface ExtractedParty {
  display: string;
  email: string | null;
  phone: string | null;
  canonicalKey: string;
}

function normalizePhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

function extractPartyInfo(raw: string): ExtractedParty {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return { display: 'Unknown', email: null, phone: null, canonicalKey: 'unknown' };
  }

  const emailMatch = trimmed.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/);
  const email = emailMatch ? emailMatch[1].toLowerCase() : null;

  let display = trimmed
    .replace(/[<>]/g, '')
    .replace(/["']/g, '')
    .trim();

  if (!display && email) {
    display = email;
  }

  const digits = normalizePhoneDigits(trimmed);
  const phone = digits.length >= 10 && digits.length <= 15 && !email ? digits : null;

  const canonicalKey = email
    ? `email:${email}`
    : phone
      ? `phone:${phone}`
      : `name:${display.toLowerCase().replace(/\s+/g, ' ')}`;

  return {
    display: display || 'Unknown',
    email,
    phone,
    canonicalKey,
  };
}

function isPlaceholderParty(party: string): boolean {
  const lower = (party || '').trim().toLowerCase();
  return (
    !lower ||
    lower === 'unknown' ||
    lower.startsWith('pdf page ') ||
    lower.startsWith('ocr screenshot') ||
    lower.includes('(unstated)') ||
    lower.includes('(inferred)')
  );
}

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_REGEX =
  /(?:(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b|\+\d{1,3}[-.\s]?\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b)/g;
const SSN_REGEX = /\b(?!000|666|9\d{2})\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b/g;
const CARD_OR_BANK_REGEX =
  /\b(?:(?:acct|account|routing|aba|iban|card|visa|mc|amex)\s*(?:#|no\.?|number)?\s*[:#-]?\s*\d{4,17}|\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4})\b/gi;
const MEDICAL_ID_REGEX =
  /\b(?:mrn|medical\s+record\s*(?:#|no\.?|number)?|patient\s+id|member\s+id|policy\s*(?:#|no\.?))\s*[:#-]?\s*[A-Z0-9-]{4,18}\b/gi;
const STREET_ADDRESS_REGEX =
  /\b\d{1,6}\s+[A-Z0-9][A-Za-z0-9.'-]+(?:\s+[A-Z0-9][A-Za-z0-9.'-]+){0,3}\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Circle|Cir|Parkway|Pkwy)\.?(?:\s*(?:#|Apt|Apartment|Unit|Suite|Ste)\.?\s*[A-Za-z0-9-]+)?\b/g;
const DOB_REGEX =
  /\b(?:dob|date\s+of\s+birth|birth\s*date)\s*[:#-]?\s*(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})\b/gi;
const GPS_COORDS_REGEX =
  /(?:geo:|@|\b(?:lat(?:itude)?|lon(?:gitude)?|gps|coords?)\s*[:=]?\s*)?[-+]?(?:[1-8]?\d(?:\.\d{4,7})|90(?:\.0{4,7})),\s*[-+]?(?:1[0-7]\d(?:\.\d{4,7})|[1-9]?\d(?:\.\d{4,7})|180(?:\.0{4,7}))\b/gi;
const MAP_TRACKING_LINK_REGEX =
  /\bhttps?:\/\/(?:maps\.google\.com|www\.google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com|waze\.com\/ul|what3words\.com)\S*/gi;
const IPV4_REGEX =
  /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
const MAC_ADDRESS_REGEX = /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g;
const DEVICE_SERIAL_REGEX =
  /\b(?:imei|imsi|udid|iccid|serial\s*(?:#|no\.?|number)?)\s*[:#-]?\s*[A-Z0-9-]{8,24}\b/gi;
const URL_TRACKING_PARAM_REGEX =
  /([?&])(?:utm_[a-z_]+|fbclid|gclid|igshid|mc_eid|ref_id|trk|tracking_id)=[^&\s]+/gi;
const TRACKING_BEACON_URL_REGEX =
  /\[?https?:\/\/[^\s\]]*(?:\/(?:px|pixel|beacon|track(?:ing)?|open|1x1)\.(?:gif|png|jpg|svg)|track(?:er|ing)\.)[^\s\]]*\]?/gi;

export function sanitizeAndVerifyBatch(
  rawMessages: RawMessage[],
  options: { sanitizePii?: boolean; selfParty?: string; counterParty?: string } = {}
): BatchSanitizationOutput {
  const sanitizePii = options.sanitizePii !== false;
  const selfPartyOverride = options.selfParty?.trim() || '';
  const counterPartyOverride = options.counterParty?.trim() || '';

  const piiTotals: PiiRedactionCounts = {
    emails: 0,
    phones: 0,
    ssn: 0,
    financial: 0,
    medical_ids: 0,
    addresses: 0,
    dob: 0,
    locations: 0,
    network_and_devices: 0,
  };

  // Deterministic registry mapping canonical email/phone/name -> unique token
  const keyToToken = new Map<string, string>();
  const tokenMeta = new Map<string, PartyTokenMapping>();
  let partyCounter = 1;
  let thirdPartyEmailCounter = 1;
  let thirdPartyPhoneCounter = 1;
  const thirdPartyEmailTokens = new Map<string, string>();
  const thirdPartyPhoneTokens = new Map<string, string>();

  const registerPartyToken = (
    info: ExtractedParty,
    role: 'sender' | 'receiver' | 'third_party'
  ): string => {
    const existing = keyToToken.get(info.canonicalKey);
    if (existing) return existing;

    if (isPlaceholderParty(info.display)) {
      const placeholderToken = `[UNATTRIBUTED-${role.toUpperCase()}]`;
      keyToToken.set(info.canonicalKey, placeholderToken);
      return placeholderToken;
    }

    const token = `[PARTY-${partyCounter++}]`;
    keyToToken.set(info.canonicalKey, token);
    if (info.email) keyToToken.set(`email:${info.email}`, token);
    if (info.phone) keyToToken.set(`phone:${info.phone}`, token);

    const hint = info.email
      ? `${info.display.replace(info.email, '').trim() || 'Email Account'} (***@${info.email.split('@')[1]})`
      : info.phone
        ? `Phone (***-${info.phone.slice(-4)})`
        : info.display;

    tokenMeta.set(token, {
      role,
      original_hint: hint,
      token,
    });
    return token;
  };

  const scrubText = (
    input: string,
    senderInfo: ExtractedParty,
    receiverInfo: ExtractedParty,
    senderToken: string,
    receiverToken: string
  ): { text: string; count: number } => {
    if (!sanitizePii || !input) return { text: input, count: 0 };
    let text = input;
    let count = 0;

    // SSNs first (before phone regex could misread parts)
    text = text.replace(SSN_REGEX, () => {
      piiTotals.ssn++;
      count++;
      return '[SSN-REDACTED]';
    });

    // DOB
    text = text.replace(DOB_REGEX, () => {
      piiTotals.dob++;
      count++;
      return '[DOB-REDACTED]';
    });

    // Medical IDs
    text = text.replace(MEDICAL_ID_REGEX, () => {
      piiTotals.medical_ids++;
      count++;
      return '[MEDICAL-ID-REDACTED]';
    });

    // Financial accounts / cards
    text = text.replace(CARD_OR_BANK_REGEX, () => {
      piiTotals.financial++;
      count++;
      return '[FINANCIAL-ID-REDACTED]';
    });

    // Map links and GPS coordinates (anti-geolocation leak)
    text = text.replace(MAP_TRACKING_LINK_REGEX, () => {
      piiTotals.locations = (piiTotals.locations || 0) + 1;
      count++;
      return '[MAP-LINK-REDACTED]';
    });

    text = text.replace(GPS_COORDS_REGEX, () => {
      piiTotals.locations = (piiTotals.locations || 0) + 1;
      count++;
      return '[LOCATION-COORDS-REDACTED]';
    });

    // IP addresses, MAC addresses, and IMEI/UDID/device tracking identifiers
    text = text.replace(MAC_ADDRESS_REGEX, () => {
      piiTotals.network_and_devices = (piiTotals.network_and_devices || 0) + 1;
      count++;
      return '[DEVICE-ID-REDACTED]';
    });

    text = text.replace(DEVICE_SERIAL_REGEX, () => {
      piiTotals.network_and_devices = (piiTotals.network_and_devices || 0) + 1;
      count++;
      return '[DEVICE-ID-REDACTED]';
    });

    text = text.replace(IPV4_REGEX, () => {
      piiTotals.network_and_devices = (piiTotals.network_and_devices || 0) + 1;
      count++;
      return '[IP-REDACTED]';
    });

    text = text.replace(TRACKING_BEACON_URL_REGEX, () => {
      piiTotals.network_and_devices = (piiTotals.network_and_devices || 0) + 1;
      count++;
      return '[TRACKING-BEACON-REDACTED]';
    });

    text = text.replace(URL_TRACKING_PARAM_REGEX, '$1[TRACKING-PARAM-STRIPPED]');

    // Physical street addresses
    text = text.replace(STREET_ADDRESS_REGEX, () => {
      piiTotals.addresses++;
      count++;
      return '[ADDRESS-REDACTED]';
    });

    // Emails — deterministically preserve Sender vs Receiver vs 3rd-party identity!
    text = text.replace(EMAIL_REGEX, (match) => {
      piiTotals.emails++;
      count++;
      const lower = match.toLowerCase();
      if (senderInfo.email && lower === senderInfo.email) {
        return `[SENDER-EMAIL:${senderToken}]`;
      }
      if (receiverInfo.email && lower === receiverInfo.email) {
        return `[RECEIVER-EMAIL:${receiverToken}]`;
      }
      const mapped = keyToToken.get(`email:${lower}`);
      if (mapped) return `[PARTY-EMAIL:${mapped}]`;
      let tp = thirdPartyEmailTokens.get(lower);
      if (!tp) {
        tp = `[3P-EMAIL-${thirdPartyEmailCounter++}]`;
        thirdPartyEmailTokens.set(lower, tp);
      }
      return tp;
    });

    // Phone numbers — deterministically preserve Sender vs Receiver vs 3rd-party identity!
    text = text.replace(PHONE_REGEX, (match) => {
      const digits = normalizePhoneDigits(match);
      if (digits.length < 10) return match;
      piiTotals.phones++;
      count++;
      if (senderInfo.phone && digits === senderInfo.phone) {
        return `[SENDER-PHONE:${senderToken}]`;
      }
      if (receiverInfo.phone && digits === receiverInfo.phone) {
        return `[RECEIVER-PHONE:${receiverToken}]`;
      }
      const mapped = keyToToken.get(`phone:${digits}`);
      if (mapped) return `[PARTY-PHONE:${mapped}]`;
      let tp = thirdPartyPhoneTokens.get(digits);
      if (!tp) {
        tp = `[3P-PHONE-${thirdPartyPhoneCounter++}]`;
        thirdPartyPhoneTokens.set(digits, tp);
      }
      return tp;
    });

    return { text, count };
  };

  const formatPartyLabel = (rawParty: string, info: ExtractedParty, token: string): string => {
    if (!sanitizePii) return rawParty || info.display;
    if (isPlaceholderParty(info.display)) return info.display;
    // Strip raw email/phone PII while retaining display name + strict role-locked token
    const cleanName = info.display
      .replace(EMAIL_REGEX, '')
      .replace(PHONE_REGEX, '')
      .trim();
    if (cleanName && cleanName.toLowerCase() !== info.email && cleanName !== info.phone) {
      return `${cleanName} ${token}`;
    }
    return token;
  };

  const items: SanitizedMessageResult[] = [];
  const summary = {
    verified_strict: 0,
    inferred_needs_review: 0,
    ambiguous_warning: 0,
  };

  for (const rawMsg of rawMessages) {
    let rawSender = (rawMsg.sender || 'Unknown').trim();
    let rawReceiver = (rawMsg.receiver || '').trim();

    if (selfPartyOverride && /^account owner\b/i.test(rawSender)) {
      rawSender = selfPartyOverride;
    }
    if (selfPartyOverride && /^account owner\b/i.test(rawReceiver)) {
      rawReceiver = selfPartyOverride;
    }
    if (counterPartyOverride && !rawReceiver && rawSender === selfPartyOverride) {
      rawReceiver = counterPartyOverride;
    }
    if (!rawReceiver) {
      rawReceiver = 'Unstated / Document Recipient';
    }

    const senderInfo = extractPartyInfo(rawSender);
    const receiverInfo = extractPartyInfo(rawReceiver);

    const senderToken = registerPartyToken(senderInfo, 'sender');
    const receiverToken = registerPartyToken(receiverInfo, 'receiver');

    const rawContentHash = crypto
      .createHash('sha256')
      .update(rawMsg.content || '')
      .digest('hex');

    // Check embedded header conflicts in body BEFORE sanitization
    const firstLines = (rawMsg.content || '').split(/\r?\n/).slice(0, 4).join('\n');
    let bodyHeaderConflict = false;
    const embeddedFromMatch = firstLines.match(/(?:^|\n)\s*From:\s*([^\n<]+(?:<[^>]+>)?)/i);
    if (embeddedFromMatch) {
      const embeddedFromInfo = extractPartyInfo(embeddedFromMatch[1]);
      if (
        !isPlaceholderParty(embeddedFromInfo.display) &&
        !isPlaceholderParty(senderInfo.display) &&
        embeddedFromInfo.canonicalKey !== senderInfo.canonicalKey &&
        !senderInfo.display.toLowerCase().includes(embeddedFromInfo.display.toLowerCase()) &&
        !embeddedFromInfo.display.toLowerCase().includes(senderInfo.display.toLowerCase())
      ) {
        bodyHeaderConflict = true;
      }
    }

    const sanitizedBody = scrubText(
      rawMsg.content || '',
      senderInfo,
      receiverInfo,
      senderToken,
      receiverToken
    );
    const sanitizedSubject = scrubText(
      rawMsg.subject || '',
      senderInfo,
      receiverInfo,
      senderToken,
      receiverToken
    );

    const finalSender = formatPartyLabel(rawSender, senderInfo, senderToken);
    const finalReceiver = formatPartyLabel(rawReceiver, receiverInfo, receiverToken);

    // Strict post-sanitization results check:
    // Verify distinct pre-sanitization parties did NOT collide post-sanitization
    const preDistinct =
      !isPlaceholderParty(senderInfo.display) &&
      !isPlaceholderParty(receiverInfo.display) &&
      senderInfo.canonicalKey !== receiverInfo.canonicalKey;
    const postCollapsed =
      finalSender.trim().toLowerCase() === finalReceiver.trim().toLowerCase() ||
      senderToken === receiverToken;
    const tokenCollision = preDistinct && postCollapsed;

    const method = rawMsg.attribution_method || 'inferred_from_structure';
    const hasExplicitSides =
      !isPlaceholderParty(senderInfo.display) && !isPlaceholderParty(receiverInfo.display);

    let status: AttributionStatus;
    let notes: string;

    if (tokenCollision) {
      status = 'ambiguous_warning';
      notes = `Attribution collision check failed: distinct parties (${senderInfo.canonicalKey} vs ${receiverInfo.canonicalKey}) resolved to identical identifier.`;
    } else if (bodyHeaderConflict) {
      status = 'ambiguous_warning';
      notes = `Embedded "From:" text inside message body conflicts with outer sender (${finalSender}); verify forwarded/quoted attribution.`;
    } else if (isPlaceholderParty(senderInfo.display)) {
      status = 'ambiguous_warning';
      notes = `Sender could not be strictly identified from source structure (${rawSender}); manual attribution required.`;
    } else if (hasExplicitSides && method.startsWith('explicit_')) {
      status = 'verified_strict';
      notes = `Strict sender/receiver attribution verified (${method}); sender token ${senderToken} and receiver token ${receiverToken} are disjoint.`;
    } else {
      status = 'inferred_needs_review';
      notes = `Sender identified (${finalSender}), receiver inferred (${finalReceiver}) via ${method}; verify recipient before court export.`;
    }

    summary[status]++;

    items.push({
      message: {
        ...rawMsg,
        sender: finalSender,
        receiver: finalReceiver,
        sender_id: sanitizePii ? senderToken : rawMsg.sender_id || '',
        receiver_id: sanitizePii ? receiverToken : rawMsg.receiver_id || '',
        subject: sanitizedSubject.text,
        content: sanitizedBody.text,
      },
      receiver: finalReceiver,
      receiver_id: sanitizePii ? receiverToken : rawMsg.receiver_id || '',
      subject: sanitizedSubject.text,
      attribution_audit: {
        status,
        sender: finalSender,
        receiver: finalReceiver,
        sender_token: senderToken,
        receiver_token: receiverToken,
        token_collision: tokenCollision,
        body_header_conflict: bodyHeaderConflict,
        method,
        notes,
      },
      raw_content_hash: rawContentHash,
      pii_redacted_count: sanitizedBody.count + sanitizedSubject.count,
    });
  }

  return {
    items,
    pii_redactions: piiTotals,
    party_tokens: Array.from(tokenMeta.values()),
    attribution_summary: summary,
  };
}
