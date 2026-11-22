# Acts of Abuse Analysis

A forensic, human-in-the-loop evidence analysis workbench for documenting coercive control, post-separation abuse, economic abuse, child weaponization, courtroom/legal abuse, technology-facilitated abuse, DARVO, mesosystem sabotage, institutional betrayal, and lethality risk markers.

> **DISCLAIMER — EDUCATIONAL & PERSONAL USE ONLY:** This software is an **educational and personal documentation tool** informed by peer-reviewed scientific articles and the Domestic Abuse Intervention Programs (DAIP) Duluth Model Power and Control Wheels (not affiliated with or endorsed by DAIP). **It is NOT legal advice, medical/psychological advice, or an expert forensic opinion**, and creates no attorney-client, therapeutic, or advocacy relationship. Automated flags, OCR transcriptions, PII redactions, and sender/receiver attributions are heuristic screening aids only and may contain inaccuracies; users bear sole responsibility for independently verifying original source files, attributions, and compliance with applicable laws (including privacy, recording consent, and rules of evidence). **THIS SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OR LIABILITY OF ANY KIND.** See [`LICENSE`](LICENSE) and [`docs/LEGAL.md`](docs/LEGAL.md) for full terms.

---

## Architecture & Tech Stack

The application runs as a full-stack TypeScript web application on **Node.js 22**, **Express**, and **React (Vite + Tailwind CSS)**:

| Module | Purpose |
|--------|---------|
| `server/corpusTaxonomy.ts` | Comprehensive multi-framework tactic taxonomy (`CORPUS_TAXONOMY`, 62 categories across 11 framework wheels derived from the research corpus) with keywords, regex phrase patterns, severity weights, and academic citations |
| `server/analysisEngine.ts` | `CoerciveControlEngine` — multi-layer extraction engine combining contraction normalization, word-boundary matching, broad regex phrase patterns, and sliding-window `partialRatio` (> 90) fuzzy matching; evaluates every tactic without early exit and returns `tactics_analyzed`, `matched_indicators`, `all_flags`, and framework-specific flag arrays |
| `server/fileSecurity.ts` | Upload security validation: filename sanitization, extension whitelist (`.txt`, `.json`, `.eml`, `.csv`, `.xml`, `.pdf`, `.docx`, `.rtf`, `.html`, `.md`, `.log`, and images `.png`/`.jpg`/`.webp`/`.bmp`/`.tif`), 50 MB limit, executable/OLE2 macro magic-byte blocking, container signature verification, and XSS/DDE injection scanning |
| `server/ocrEngine.ts` | Local, privacy-preserving OCR engine (`sharp` EXIF rotation, Lanczos upscaling, grayscale, normalization, sharpening + `tesseract.js` using local `@tesseract.js-data/eng` 4.0.0_best_int LSTM) returning line-level confidence and citations |
| `server/piiSanitizer.ts` | Deterministic PII & anti-tracking sanitizer (SSNs, emails, phones, addresses, DOBs, GPS coordinates, map tracking links, IPv4s, MAC/IMEI/device IDs, URL tracking params, financial/medical IDs) with role-locked party tokenization and strict attribution checks |
| `server/parsers.ts` | Multi-format parsers (`eml` via `mailparser`, `csv` via `csv-parse`, `xml` via `fast-xml-parser`, `docx` via `mammoth`, `pdf` via `unpdf`, `whatsapp`, `facebook`, `discord`, `ocr`, `generic`) stripping HTML tracking beacons with exact placement citations and SHA-256 hashing |
| `server/chronologyEngine.ts` | Event Sectioner & Chronology builder grouping cross-source events by day, month, document category, or framework with exact file, SHA-256 prefix, and page/row/line/XML/OCR placement citations |
| `server/normalization.ts` | Message normalization, DST-safe `localDayBounds`, and merged context-window generation |
| `server/analysisPipeline.ts` | Runs PII sanitization + attribution verification, `CoerciveControlEngine`, context windowing, and persists `placement_citation` + `attribution_audit` on flagged events |
| `server/store.ts` | Persistent SQLite (`node:sqlite` WAL mode), FTS5 full-text search index (`evidence_fts`, `events_fts` with `porter unicode61` & BM25 ranking), & AES-256-GCM encrypted vault (`data/forensic_evidence.db`, `data/vault/*.enc`) with random-overwrite secure deletion |
| `server.ts` | Express server on port `3000` (`0.0.0.0`) serving `/api/*` endpoints and Vite SPA / production `dist/` |
| `src/components/` | React UI: `EvidenceUploadPanel`, `AnalyzedEventsPanel`, `ChronologySectionerPanel`, `TimelineChart`, and `MessageAnalyzerPanel` |

---

## Research Corpus & Tactics Analyzed

The extraction engine (`CoerciveControlEngine`) evaluates every message against **10 frameworks / 62 tactic categories** grounded in the parsed research corpus (`public/assets/aistudio/parsed_abuse_corpus_2_f068d14c.json`):

1. **Post-Separation Power & Control Wheel** *(DAIP Duluth Model, 1984; Post-Separation Wheel)*
   - Coercion and Threats; Intimidation; Emotional Abuse; Isolation; Minimizing, Denying and Blaming; Using Male / Adult Privilege; Stalking, Surveillance and Harassment; Disrupting Relationships with Children; Discrediting as a Parent / Mother; Physical and Sexual Violence / Coercion *(Severity 2–4)*
2. **Post-Separation Economic Abuse Wheel** *(Glinski, 2021; Sharp, 2008 / Surviving Economic Abuse)*
   - Sabotaging Employment and Education; Preventing Employment and Withholding Documents (passports, visas, IDs, diplomas); Withholding Financial and Child Support; Controlling Assets, Banking and Draining Accounts; Coerced Debt, Credit Sabotage and Benefit Fraud; Interfering with Housing and Basic Necessities; Using Child Support and Expenses as Leverage; Concealing Income and Manipulating Financial Institutions *(Severity 3)*
3. **Abuse of Children & Weaponizing Children Wheel** *(DAIP Abuse of Children Wheel; Spearman et al., 2023)*
   - Using Children as Messengers, Spies or Confidants; Visitation Manipulation and Custody Stalking; Undermining Parenting and Alienation Tactics; Withholding Visitation and Abduction Threats; Using Children to Gather Information; Threatening Child Custody and Bargaining; Economic Exploitation of Children; Using Adult Privilege Over Children; Using Institutions to Threaten Children *(Severity 4)*; Direct Harm, Neglect, Pet Harm or Child Endangerment *(Severity 4)*
4. **Legal Abuse Scale & Courtroom Coercive Control (LAS / Paper Abuse)** *(Gutowski & Goodman, 2022/2023; Miller & Smolter, 2011)*
   - Custody Threats and Unsafe Access; Retaliatory Orders and Violating Court Orders; Paper Abuse, Repeated Filings and Prolonging Litigation; Courthouse and Exchange Intimidation; Character, Mental Health and Parental Alienation Defamation; Weaponizing Social Identity and Gender Stereotypes; False CPS Reports and Witness / Counsel Intimidation; Discovery Abuse and Medical Privacy Waivers; Legal-Economic Harm and Financial Litigation Attrition *(Severity 3)*
5. **Technology-Facilitated Abuse & Digital Coercive Control** *(Rogers et al., 2022/2023; Navarro & Tudge, 2022)*
   - Covert Surveillance, Stalkerware and GPS Tracking (AirTags, spyware, keyloggers, hidden cameras); Smart Home (IoT) Sabotage and Digital Gaslighting; Account Takeover, Impersonation and Device Sabotage; Image-Based Sexual Abuse (IBSA) and Sextortion *(Severity 4)*; Digital Harassment, Doxxing and Constant Availability *(Severity 2–4)*
6. **DARVO & Betrayal Trauma Dynamics** *(Freyd, 1997)*
   - Deny (Indignant Denial and Null-Result Fallacy); Attack (Credibility Attacks, Ridicule and Litigation Threats); Reverse Victim and Offender (Role Reversal and Smear Claims); Betrayal Trauma and Adaptive Blindness / Coerced Silence *(Severity 2)*
7. **Mesosystem Abuse & Support-Network Sabotage** *(Bronfenbrenner, 1979; Spearman et al., 2023)*
   - Workplace and Employer Sabotage; School, Childcare and Medical Mesosystem Interference; Social Network, Neighbor and Community Alienation; Third-Party Proxy Harassment and Networked Abuse *(Severity 3)*
8. **Systemic Abuse & Institutional Betrayal (IBQ)** *(Smith & Freyd, 2014; Spearman et al., 2023)*
   - Systemic Institution Weaponization (CPS, courts, judges, police, GAL, social workers); Failure to Prevent or Investigate (Omission); Cover-Up, Reputation Protection and Denying Records (Commission); Victim Blaming, Credibility Dismissal and Secondary Assault; Retaliation and Punishing Victims / Whistleblowers; Identity-Based Institutional Discrimination *(Severity 4)*
9. **Proactive / Instrumental Aggression & Contempt** *(Babcock et al., 2024)*
   - Proactive / Calculated Dominance and Compliance Enforcement; Contempt, Belligerence and Domineering Aggression; Stonewalling and Strategic Defensiveness *(Severity 2)*
10. **Lethality, Strangulation & Fundamental Needs Deprivation** *(Spearman et al., 2023; Maslow / Danger Assessment)*
    - Lethality, Homicide, Suicide and Firearm Threats; Strangulation, Breathing Restriction and Weapon Violence; Severe Deprivation of Basic Physiological and Safety Needs *(Severity 4)*

---

## Extraction Logic & Output Schema

To avoid missing indicators across conversational phrasing, `CoerciveControlEngine.analyzeMessage(text)` runs four complementary extraction passes across all 62 tactic categories without early `break` termination:

1. **Normalization & Contraction Expansion**: Unifies typographic quotes, normalizes whitespace, and runs matching against both raw lowercase text and contraction-expanded text (e.g. `won't` -> `will not`, `didn't` -> `did not`).
2. **Word-Boundary Short-Token Matching**: Protects short terms (`cps`, `gun`, `liar`, etc.) with `\b...\b` boundaries to prevent substring false positives.
3. **Broad Phrase Regex Patterns**: Evaluates inflectional and multi-word gap patterns (up to intervening words) for paraphrased tactics across legal, economic, digital, child, mesosystem, institutional, and lethality domains.
4. **Sliding-Window Fuzzy Matching (`partialRatio > 90`)**: Catches minor spelling variations on longer indicators (>= 12 characters).

Every call to `POST /api/analyze` returns:
- `severity` (`1`–`4`)
- Backward-compatible arrays: `categories`, `economic_abuse_flags`, `child_abuse_flags`, `darvo_flags`, `institutional_abuse`, `all_flags`
- Expanded framework arrays: `legal_abuse_flags`, `tech_abuse_flags`, `mesosystem_abuse_flags`, `institutional_betrayal_flags`, `proactive_aggression_flags`, `lethality_risk_flags`
- Complete tactic breakdown: `tactics_analyzed` (`wheel`, `category`, `citation`, `severity_weight`, `matched_indicators`), `matched_indicators`, `frameworks_triggered`, and `total_tactics_evaluated`

---

## API Endpoints

| Method & Path | Description |
|---------------|-------------|
| `GET /api/health` | Health check (`{ status: "ok" }`) |
| `GET /api/tactics` | Returns all 62 analyzed tactic categories, framework list, rule counts, descriptions, and academic citations |
| `POST /api/analyze` | Screens a single message `{ text }` and returns full `AnalysisResult` with `tactics_analyzed` |
| `GET /api/evidence` | Lists or FTS5-searches (`?search=`, `document_category`, `detected_platform`) ingested evidence records and extracted full document text |
| `GET /api/search` | Unified FTS5 full-text search (`?q=`, `scope=all\|evidence\|events`, `limit=`) returning BM25-ranked evidence & event matches with highlighted snippets |
| `POST /api/evidence/upload` | Validates, hashes, parses (`.eml`, `.csv`, `.xml`, `.docx`, `.pdf`, `.txt`, `.json`, `.rtf`, `.html`, images via OCR), sanitizes PII with strict attribution verification, indexes full text, and runs `runAnalysisPipeline` |
| `GET /api/evidence/:id/verify-hash` | Re-computes SHA-256 against decrypted AES-256-GCM vault evidence bytes to verify integrity |
| `DELETE /api/evidence/:id` | Cryptographically overwrites and deletes an evidence record, its FTS5 entries, its vault file, and its associated events |
| `DELETE /api/vault/purge` | Requires `{ confirm: "PURGE_ALL_LOCAL_EVIDENCE" }` to overwrite all vault blobs and wipe SQLite/FTS5 records |
| `GET /api/events` | Lists or FTS5-searches flagged events with `severity`, `wheel`, `document_category`, `attribution_status`, `is_verified`, `source_platform`, `date_from`, `date_to`, `search`, and `sort=chronological\|relevance` |
| `PATCH /api/events/:id` | Updates `is_verified`, `user_context_notes`, `sender`, `receiver`, or `timestamp` |
| `GET /api/chronology` | Returns sectioned cross-source event chronology (`section_by=day|month|source|framework`) with exact file & placement citations |
| `GET /api/timeline` | Returns verified (`is_verified = true`) events with non-null timestamps for plotting |
| `GET /api/export/verified` | Downloads verified events as JSON including `placement_citation`, `attribution_audit`, `all_flags`, `tactics_analyzed`, and `matched_indicators` |

---

## Local Development & Verification

### Prerequisites
- Node.js 22+
- `npm`

### Commands

```bash
# Install dependencies
npm install

# Run full-stack development server on http://localhost:3000
npm run dev

# TypeScript check
npm run lint

# Build production frontend bundle (dist/)
npm run build

# Start production server
npm start
```

---

## Project Structure

```text
.
├── server.ts                  # Express + Vite middleware / static dist entry point (port 3000)
├── server/
│   ├── analysisEngine.ts      # CoerciveControlEngine (multi-layer extraction + partialRatio)
│   ├── analysisPipeline.ts    # PII sanitization, attribution audit, context windows, event persistence
│   ├── chronologyEngine.ts    # Event Sectioner & Chronology grouping with placement citations
│   ├── corpusTaxonomy.ts      # 10 frameworks / 62 tactic categories derived from research corpus
│   ├── fileSecurity.ts        # Magic-byte + injection-pattern upload scanner
│   ├── normalization.ts       # Timestamp normalization, DST-safe day bounds, context windows
│   ├── ocrEngine.ts           # Local sharp + tesseract.js OCR engine
│   ├── parsers.ts             # EML, CSV, XML, DOCX, PDF, WhatsApp, Facebook, Discord, OCR, Generic
│   ├── piiSanitizer.ts        # Role-locked PII redaction + attribution verification checks
│   ├── store.ts               # Persistent Node SQLite + local SHA-256 evidence vault store
│   └── types.ts               # Backend TypeScript interfaces
├── src/
│   ├── App.tsx                # Workbench shell & navigation
│   ├── types.ts               # Frontend TypeScript interfaces
│   └── components/
│       ├── EvidenceUploadPanel.tsx
│       ├── AnalyzedEventsPanel.tsx
│       ├── ChronologySectionerPanel.tsx
│       ├── TimelineChart.tsx
│       └── MessageAnalyzerPanel.tsx
├── public/assets/aistudio/    # Parsed academic abuse corpus JSON
├── docs/                      # Reference architecture, usage, legal, and privacy docs
├── package.json
├── tsconfig.json
└── README.md
```
