# Help Spread the Word

Coercive control and post-separation abuse are under-documented, under-believed, and under-resourced. Tools like this one exist because survivors built them — and they only make an impact if people know they exist.

This page is for anyone who wants to help spread awareness: survivors, advocates, family-law attorneys, domestic violence workers, developers, and allies.

---

## Why This Matters

Most survivors going through family court or custody battles face a common problem: they **know** what is happening to them, but they struggle to present it in a format that judges, lawyers, and caseworkers can act on. A stack of 400 screenshots is not evidence. A Plotly timeline showing escalating severity scores over six months, correlated with court dates, is.

This tool exists to bridge that gap. The more people who know about it, the more survivors can access it.

---

## For Survivors

### Share your experience (safely)

If this tool has helped you, consider sharing your experience with domestic violence advocacy groups, victim-witness programs, or family-law legal aid organisations. You do not need to share identifying details — even a general description of how pattern-analysis tools can help can plant a seed.

> **Safety first:** Before sharing anything publicly, consider whether the abuser has access to your social media, your device, or your network. If in doubt, speak with an advocate first.

### Connect with community

- **The Hotline:** [thehotline.org](https://www.thehotline.org/) — 1-800-799-SAFE (7233)
- **Loveisrespect:** [loveisrespect.org](https://www.loveisrespect.org/)
- **National Network to End Domestic Violence:** [nnedv.org](https://nnedv.org/)
- **Coercive Control subreddits and forums** — search for communities of survivors discussing documentation and legal strategy.

---

## For Advocates and Domestic Violence Workers

### Use it in your work

If you work with survivors navigating family court, consider:

1. **Recommending this tool** as a structured way for clients to organise their evidence before meeting with an attorney.
2. **Incorporating the Duluth wheel categories** into intake conversations — the keyword categories in the analysis engine mirror the language survivors already use.
3. **Sharing the [Analysis Engine Reference](ANALYSIS_ENGINE.md)** as an educational resource about coercive control patterns.

### Training opportunities

The three Duluth wheels implemented in this tool (Post-Separation Power & Control, Economic Abuse, Child Abuse) map directly to Duluth model training. Consider:

- Using the keyword lists as conversation starters in group sessions.
- Sharing the [DARVO section](ANALYSIS_ENGINE.md#6-darvo-detection) to help survivors name and recognise gaslighting tactics.

---

## For Family-Law Attorneys

### Evidence organisation

This tool can help clients come to consultations better prepared:

- Pre-ingested and categorised evidence, with severity scores.
- A verified-events-only timeline showing escalation patterns.
- SHA-256 hash documentation for every uploaded file, supporting chain-of-custody arguments.

### Systemic / Institutional abuse flags

The analysis engine specifically flags messages that weaponise **CPS, courts, judges, police, and social workers** as coercive tactics. These are scored at the highest severity (4 = Critical) and can be filtered and exported separately.

---

## For Developers

### Contribute to the project

If you are a developer who wants to help improve this tool:

1. Read the [Architecture Overview](ARCHITECTURE.md) and [Parsers Reference](PARSERS.md).
2. Check the open issues on [GitHub](https://github.com/Carlymarie992/acts-of-abuse-anlysis/issues).
3. Contact the repository owner before starting significant work.

### Ideas for future contribution

- Additional platform parsers (iMessage, Telegram, Signal, email MBOX)
- PDF report generation (court-ready export)
- Improved timestamp parsing for edge-case WhatsApp formats
- Accessibility improvements to the admin interface
- Translations / internationalisation
- Safety-exit button for the web interface

---

## Write About It

If you blog, write on Substack, or contribute to domestic violence research publications, consider writing about:

- The gap between "survivor knowledge" and "court-admissible evidence."
- How the Duluth model applies to post-separation and digital coercive control.
- The role of open-source technology in survivor advocacy.

You do not need to link specifically to this repository to spread the ideas. The more the public understands coercive control patterns, DARVO, and economic abuse, the better.

---

## Cite the Duluth Model

The conceptual foundation of this tool comes from peer-reviewed research and established advocacy frameworks. Citing these in your work helps legitimise pattern-analysis approaches:

- **Domestic Abuse Intervention Programs:** [theduluthmodel.org](https://www.theduluthmodel.org/)
- **DARVO (Freyd, 1997):** Freyd, J.J. (1997). *Violations of power, adaptive blindness, and betrayal trauma theory.* Feminism & Psychology, 7(1), 22–32.
- **Post-Separation Coercive Control:** Stark, E. (2007). *Coercive Control: How Men Entrap Women in Personal Life.* Oxford University Press.

---

## Crisis Resources

If you or someone you know is in danger:

| Resource | Contact |
|----------|---------|
| **Emergency** | 911 |
| **National DV Hotline** | 1-800-799-7233 (SAFE) · text START to 88788 · [thehotline.org](https://www.thehotline.org) |
| **Loveisrespect (teen/young adult)** | 1-866-331-9474 · text LOVEIS to 22522 |
| **RAINN** | 1-800-656-4673 · [rainn.org](https://www.rainn.org) |
| **Childhelp National Child Abuse Hotline** | 1-800-422-4453 |

---

## See Also

- [Project Vision & Mission](VISION.md)
- [How to Use the App](USAGE.md)
- [Analysis Engine Reference](ANALYSIS_ENGINE.md)
