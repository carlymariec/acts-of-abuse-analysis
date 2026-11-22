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
  { bytes: [0xca, 0xfe, 0xba, 0xbe], description: 'macOS Mach-O fat binary' },
  { bytes: [0xfe, 0xed, 0xfa, 0xce], description: 'macOS Mach-O 32-bit binary' },
  { bytes: [0xfe, 0xed, 0xfa, 0xcf], description: 'macOS Mach-O 64-bit binary' },
  { bytes: [0x23, 0x21, 0x2f], description: 'shell/interpreter script (shebang)' },
];

interface InjectionPattern {
  regex: RegExp;
  description: string;
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  { regex: /<script[\s>/]/i, description: 'embedded <script> tag (XSS)' },
  { regex: /javascript\s*:/i, description: 'javascript: URL (XSS)' },
  { regex: /vbscript\s*:/i, description: 'vbscript: URL' },
  {
    regex:
      /\b(?:on(?:click|dblclick|load|unload|error|abort|focus|blur|change|submit|reset|select|input|keydown|keypress|keyup|mousedown|mouseup|mouseover|mouseout|mousemove|mouseenter|mouseleave|contextmenu|drag|drop|scroll|wheel|copy|cut|paste|toggle|animationstart|transitionend|pointerdown|pointerup|touchstart|touchend))\s*=\s*["']/i,
    description: 'inline DOM event handler (e.g. onclick=)',
  },
  { regex: /\beval\s*\(/i, description: 'eval() call' },
  { regex: /\bexec\s*\(/i, description: 'exec() call' },
  { regex: /__import__\s*\(/i, description: 'Python __import__() injection' },
  { regex: /;\s*DROP\s+TABLE/i, description: 'SQL DROP TABLE injection' },
  { regex: /;\s*DELETE\s+FROM/i, description: 'SQL DELETE FROM injection' },
  { regex: /\bUNION\s+SELECT\b/i, description: 'SQL UNION SELECT injection' },
  { regex: /__proto__/i, description: 'prototype pollution (__proto__)' },
  { regex: /constructor\s*\[/i, description: 'prototype pollution (constructor[])' },
];

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

export function validateEvidenceUpload(filename: string, buffer: Buffer): void {
  const ext = path.extname(filename || '').toLowerCase();
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
