# Vision & Mission

## Why This Tool Exists

Coercive control is one of the most under-documented forms of domestic abuse. It rarely leaves visible bruises. It lives in text messages, emails, voicemails, financial records, and court filings — a constant drip of threats, manipulation, and intimidation that survivors often struggle to communicate clearly to judges, lawyers, child-protective workers, and law enforcement.

**Acts of Abuse Analysis** was built because survivors deserve the same forensic rigour applied to financial fraud or corporate litigation — applied to the evidence of abuse they carry every day.

---

## The Creator's Mission

This tool was created by a sole-proprietor developer and survivor-advocate who recognised a gap: existing case-management tools were built for attorneys, not for the person living through the abuse. They are expensive, inaccessible, and rarely designed around the lived experience of post-separation coercive control.

This project is different. It is built:

- **By a survivor, for survivors** — every feature reflects a real pattern that real abusers use.
- **On the Duluth model** — the three Power & Control wheels (Post-Separation, Economic Abuse, and Child Abuse) are the gold standard recognised by domestic-violence advocates worldwide.
- **With forensic integrity** — every uploaded file receives a SHA-256 hash the moment it is ingested, creating a tamper-evident chain of custody that can accompany evidence to court.
- **With human oversight** — the analysis engine flags potential abuse patterns, but nothing is presented as fact until a human reviewer marks it as verified. The survivor, not the algorithm, is the expert on their own life.

---

## What This Tool Does

| Goal | How the tool achieves it |
|------|--------------------------|
| Organize evidence | Import exports from WhatsApp, Facebook Messenger, Discord, PDF, and generic text formats |
| Identify patterns | Fuzzy-match keywords against the Duluth Power & Control wheels, DARVO tactics, and systemic/institutional abuse indicators |
| Quantify severity | Score each event 1 (low) → 4 (critical) so the worst incidents rise to the top |
| Visualize patterns | Generate an interactive Plotly timeline of verified events, showing escalation over time |
| Protect chain of custody | SHA-256 hash every upload so tampering can be detected |
| Stay safe | Scan every upload for malicious files and injection payloads before they touch the database |

---

## The Vision for the Future

Right now this is a personal forensic tool. The longer-term vision is a platform that:

1. **Supports other survivors** — a safe, privacy-first space where survivors can document their own cases without needing to hire a lawyer first.
2. **Trains advocates** — the pattern library (Duluth wheels, DARVO) doubles as an educational resource for domestic-violence workers, family-law attorneys, and judges.
3. **Generates court-ready reports** — export a verified, hashed, timestamped PDF report that counsel can attach to a motion.
4. **Integrates with safety planning** — connect high-severity events to local resources (shelters, legal aid, hotlines).

> *"If I had had this tool three years ago, everything would have been different."*  
> — The creator

---

## Core Values

| Value | What it means in practice |
|-------|--------------------------|
| **Survivor agency** | The survivor controls their data. No cloud sync without consent. No third-party analytics. |
| **Forensic honesty** | The tool flags patterns; it does not fabricate evidence. Every match is explainable. |
| **Accessibility** | Plain language throughout. No legal jargon. Designed to work on an iPad as well as a desktop. |
| **Transparency** | Open-source analysis logic. You can inspect every keyword list, every threshold. Nothing is hidden. |
| **Safety first** | The tool itself must never become a vector for further harm. All uploads are scanned; all outputs are human-verified. |

---

## See Also

- [How to Use the App](USAGE.md)
- [Analysis Engine Reference](ANALYSIS_ENGINE.md)
- [Legal Notices](LEGAL.md)
- [Privacy Policy](PRIVACY.md)
- [Help Spread the Word](SPREAD_THE_WORD.md)
