import path from 'node:path';

export const MAX_EVIDENCE_FILE_SIZE_MB = 50;
export const MAX_EVIDENCE_FILE_SIZE_BYTES = MAX_EVIDENCE_FILE_SIZE_MB * 1024 * 1024;

export const TEXT_EVIDENCE_EXTENSIONS = new Set([
  '.txt',
  '.json',
  '.eml',
  '.csv',
  '.xml',
  '.rtf',
  '.md',
  '.log',
  '.html',
  '.htm',
]);

export const DOCUMENT_EVIDENCE_EXTENSIONS = new Set(['.pdf', '.docx']);

export const IMAGE_OCR_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
]);

export const ALLOWED_EXTENSIONS = new Set([
  ...TEXT_EVIDENCE_EXTENSIONS,
  ...DOCUMENT_EVIDENCE_EXTENSIONS,
  ...IMAGE_OCR_EXTENSIONS,
]);

const SCAN_LIMIT_BYTES = 4 * 1024 * 1024;

interface BlockedSignature {
  bytes: number[];
  description: string;
}

const BLOCKED_SIGNATURES: BlockedSignature[] = [
  { bytes: [0x4d, 0x5a], description: 'Windows executable (PE / .exe / .dll)' },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], description: 'Linux/Unix ELF executable' },
  { bytes: [0xca, 0xfe, 0xba, 0xbe], description: 'macOS Mach-O / Java class binary' },
  { bytes: [0xfe, 0xed, 0xfa, 0xce], description: 'macOS Mach-O 32-bit binary' },
  { bytes: [0xfe, 0xed, 0xfa, 0xcf], description: 'macOS Mach-O 64-bit binary' },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], description: 'macOS Mach-O 64-bit little-endian binary' },
  { bytes: [0xce, 0xfa, 0xed, 0xfe], description: 'macOS Mach-O 32-bit little-endian binary' },
  { bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], description: 'Legacy OLE2 macro/compound binary' },
  { bytes: [0x23, 0x21, 0x2f], description: 'shell/interpreter script (shebang)' },
];

interface InjectionPattern {
  regex: RegExp;
  description: string;
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  { regex: /<script[\s>/]/i, description: 'embedded <script> tag (XSS)' },
  { regex: /<iframe[\s>/]/i, description: 'embedded <iframe> tag' },
  { regex: /<object[\s>/]/i, description: 'embedded <object> tag' },
  { regex: /<embed[\s>/]/i, description: 'embedded <embed> tag' },
  { regex: /javascript\s*:/i, description: 'javascript: URL (XSS)' },
  { regex: /vbscript\s*:/i, description: 'vbscript: URL' },
  { regex: /data\s*:\s*(?:text\/html|application\/javascript)/i, description: 'executable data: URI' },
  {
    regex:
      /\b(?:on(?:click|dblclick|load|unload|error|abort|focus|blur|change|submit|reset|select|input|keydown|keypress|keyup|mousedown|mouseup|mouseover|mouseout|mousemove|mouseenter|mouseleave|contextmenu|drag|drop|scroll|wheel|copy|cut|paste|toggle|animationstart|transitionend|pointerdown|pointerup|touchstart|touchend)|srcdoc|formaction)\s*=\s*["']/i,
    description: 'inline DOM event handler or active HTML attribute',
  },
  { regex: /\beval\s*\(/i, description: 'eval() call' },
  { regex: /\bexec\s*\(/i, description: 'exec() call' },
  { regex: /__import__\s*\(/i, description: 'Python __import__() injection' },
  { regex: /<\?php/i, description: 'embedded PHP payload' },
  { regex: /;\s*DROP\s+TABLE/i, description: 'SQL DROP TABLE injection' },
  { regex: /;\s*DELETE\s+FROM/i, description: 'SQL DELETE FROM injection' },
  { regex: /\bUNION\s+SELECT\b/i, description: 'SQL UNION SELECT injection' },
  { regex: /__proto__/i, description: 'prototype pollution (__proto__)' },
  { regex: /constructor\s*\[/i, description: 'prototype pollution (constructor[])' },
  { regex: /(?:^|[\r\n,])\s*[=+\-@](?:CMD|DDE|HYPERLINK|IMPORTXML|IMPORTHTML)\s*[|(]/i, description: 'spreadsheet DDE/formula injection' },
];

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

export function sanitizeFilename(rawName: string): string {
  const base = path.basename(String(rawName || 'evidence.txt').replace(/\0/g, ''));
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, '_').replace(/^\.+/, '');
  const bounded = cleaned.slice(0, 200).trim();
  return bounded || 'evidence.txt';
}

function verifyBinaryMagicBytes(ext: string, buffer: Buffer): void {
  if (ext === '.pdf') {
    if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new FileValidationError('File extension is .pdf but header does not match PDF signature (%PDF-).');
    }
    return;
  }
  if (ext === '.docx') {
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      throw new FileValidationError('File extension is .docx but header does not match OOXML ZIP container.');
    }
    return;
  }
  if (ext === '.png') {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (buffer.length < sig.length || !sig.every((b, idx) => buffer[idx] === b)) {
      throw new FileValidationError('File extension is .png but header does not match PNG signature.');
    }
    return;
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      throw new FileValidationError('File extension is JPEG but header does not match JPEG signature.');
    }
    return;
  }
  if (ext === '.webp') {
    if (
      buffer.length < 12 ||
      buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
    ) {
      throw new FileValidationError('File extension is .webp but header does not match WebP signature.');
    }
    return;
  }
  if (ext === '.bmp') {
    if (buffer.length < 2 || buffer[0] !== 0x42 || buffer[1] !== 0x4d) {
      throw new FileValidationError('File extension is .bmp but header does not match BMP signature.');
    }
    return;
  }
  if (ext === '.tif' || ext === '.tiff') {
    const le = buffer.length >= 4 && buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00;
    const be = buffer.length >= 4 && buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a;
    if (!le && !be) {
      throw new FileValidationError('File extension is TIFF but header does not match TIFF signature.');
    }
  }
}

export function validateEvidenceUpload(filename: string, buffer: Buffer): void {
  const safeName = sanitizeFilename(filename);
  const ext = path.extname(safeName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new FileValidationError(
      `Unsupported file extension '${ext || 'none'}'. Accepted formats: .txt, .json, .eml, .csv, .xml, .pdf, .docx, .rtf, .html, .md, .log, and screenshot images (.png, .jpg, .jpeg, .webp, .bmp, .tif, .tiff).`
    );
  }

  if (buffer.length === 0) {
    throw new FileValidationError('Uploaded file is empty.');
  }

  if (buffer.length > MAX_EVIDENCE_FILE_SIZE_BYTES) {
    throw new FileValidationError(
      `Maximum evidence file size is ${MAX_EVIDENCE_FILE_SIZE_MB} MB.`
    );
  }

  // Layer 1: magic-byte check (first 8 bytes)
  const header = buffer.subarray(0, 8);
  for (const sig of BLOCKED_SIGNATURES) {
    if (
      header.length >= sig.bytes.length &&
      sig.bytes.every((byte, idx) => header[idx] === byte)
    ) {
      throw new FileValidationError(
        `Uploaded file was rejected: dangerous file type detected (${sig.description}).`
      );
    }
  }

  // Layer 1b: strict container/image magic-byte verification against extension
  if (DOCUMENT_EVIDENCE_EXTENSIONS.has(ext) || IMAGE_OCR_EXTENSIONS.has(ext)) {
    verifyBinaryMagicBytes(ext, buffer);
  }

  // Layer 2: injection-pattern scan (text / structured / email / markup exports)
  if (TEXT_EVIDENCE_EXTENSIONS.has(ext)) {
    const content = buffer.subarray(0, SCAN_LIMIT_BYTES).toString('utf8');
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.regex.test(content)) {
        throw new FileValidationError(
          `Uploaded file was rejected: potentially malicious content detected (${pattern.description}). Please review the file and remove any scripting or injection payloads before uploading.`
        );
      }
    }
  }
}
