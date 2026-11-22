# Security & Anti-Technology-Abuse Policy

This document describes the security, zero-leakage, and anti-technology-abuse architecture of **Acts of Abuse Analysis**, plus operational safety responsibilities when running an instance.

---

## 1. Security & Anti-Technology-Abuse Philosophy

This software handles highly sensitive documentation related to coercive control and abuse. A security or privacy failure—or misuse of technology—could expose a survivor's location, communications, or device activity.

Accordingly, the application enforces both **zero-leakage data protection** and **strict anti-technology-abuse boundaries**:

- **Passive File-Only Ingestion:** The application analyzes only files explicitly uploaded by the user. It performs **zero** live account scraping, network sniffing, device/SMS interception, background tracking, keylogging, or third-party cloud synchronization.
- **No Outbound Telemetry or Beacons:** Zero analytics, crash reporting, remote font/image fetches, or third-party tracking scripts. OCR (`sharp` + `tesseract.js`) executes locally against packaged traineddata.
- **Browser Hardware & Surveillance Lockout:** All HTTP responses enforce `Permissions-Policy: geolocation=(), camera=(), microphone=(), usb=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), midi=(), serial=()` and `Referrer-Policy: no-referrer`.

---

## 2. Encrypted Vault & Zero-Leakage Storage

- **AES-256-GCM Encrypted Evidence Vault (`server/store.ts`):** Every uploaded original file is encrypted at rest (`data/vault/<sha256>.enc`, `0o600` file permissions inside `0o700` directories) using AES-256-GCM with a random 12-byte IV and 16-byte authentication tag. The vault key is derived via `scrypt` from `APP_SECRET` (when configured >= 16 characters) or generated cryptographically (`data/.vault.key`, `0o600`).
- **Cryptographic Overwrite on Delete / Purge:** Deleting an evidence item (`DELETE /api/evidence/:id`) or executing a full wipe (`DELETE /api/vault/purge`) overwrites the encrypted vault file with random bytes and calls `fsync` before unlinking, while removing all SQLite and FTS5 index rows.
- **No-Cache API Headers:** All `/api/*` endpoints return `Cache-Control: no-store, no-cache, must-revalidate, private`, `Pragma: no-cache`, and `Expires: 0` so sensitive transcripts and search results are never written to browser disk caches.

---

## 3. Anti-Tracking & Location/Network PII Sanitization (`server/piiSanitizer.ts`)

Before extracted text is indexed into SQLite FTS5 or persisted as analyzed events, `sanitizeAndVerifyBatch` redacts:

- **Geolocation & Map Tracking Links:** Decimal GPS coordinates (`[LOCATION-COORDS-REDACTED]`) and Google/Apple/Waze/what3words map links (`[MAP-LINK-REDACTED]`).
- **Network & Device Identifiers:** IPv4 addresses (`[IP-REDACTED]`), MAC addresses, IMEI/IMSI/UDID/serial numbers (`[DEVICE-ID-REDACTED]`), and URL tracking parameters (`utm_*`, `fbclid`, `gclid`, etc.).
- **Identity, Financial & Medical PII:** SSNs, DOBs, medical record IDs, bank/card numbers, street addresses, emails, and phone numbers—using role-locked tokens (`[PARTY-N]`) and post-sanitization attribution integrity verification.
- **Remote Beacon Stripping (`server/parsers.ts`):** HTML/EML extraction strips `<head>`, `<script>`, `<style>`, `<svg>`, `<img>`, and `<link>` tags before converting to plain text so embedded tracking pixels cannot survive.

---

## 4. Upload Scanning & Injection Prevention (`server/fileSecurity.ts`)

Every uploaded file passes multi-layer validation before touching parsers or storage:

1. **Filename Sanitization:** Strips path traversal sequences, null bytes, and control characters (`sanitizeFilename`).
2. **Executable & Macro Blocking (Layer 1):** Rejects PE/EXE/DLL, ELF, Mach-O, Java class binaries, shell shebangs, and legacy OLE2 macro binary documents.
3. **Extension-to-Magic-Byte Verification (Layer 1b):** Verifies `.pdf`, `.docx`, `.png`, `.jpg`/`.jpeg`, `.webp`, `.bmp`, and `.tif`/`.tiff` headers match their declared extension.
4. **Injection & Formula Scan (Layer 2):** Scans text/markup/spreadsheet uploads (up to 4 MB) for `<script>`, `<iframe>`, `<object>`, `<embed>`, `javascript:`/`vbscript:`/`data:text/html`, inline DOM event handlers, `eval()`/`exec()`, SQL injection patterns, prototype pollution (`__proto__`), and CSV DDE/formula payloads (`=CMD|`, `=HYPERLINK(`).

---

## 5. Survivor Safety Controls in UI

- **Quick Hide Cover Screen (`Quick Hide` button or double-press `Escape`):** Immediately clears in-memory React state (`evidenceList`, `events`, `globalQuery`, `timeline`) and displays a neutral reading-checklist cover screen.
- **Two-Step Secure Wipe:** Inside the Chain of Custody panel, **Secure Wipe All Data** permanently erases all SQLite records, FTS5 indexes, and encrypted vault blobs.
- **Human-in-the-Loop Verification:** Automated detections remain unverified until explicitly confirmed by the user.

---

## 6. Deployment & Operational Recommendations

- Set a strong random `APP_SECRET` (>= 32 characters) and restrict `EVIDENCE_DATA_DIR` on an encrypted disk volume.
- Always run behind HTTPS (`TLS`) if hosted beyond `localhost`.
- Never share your `data/` directory or `.vault.key` file; store encrypted exports offline only on devices you exclusively control.
