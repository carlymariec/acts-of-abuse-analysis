# Privacy Policy

*Last updated: 2026*

---

## Overview

Acts of Abuse Analysis is a **personal, locally-run forensic tool**. It is designed so that your evidence stays on your own device, under your own control. This policy explains what data the tool collects, where it is stored, and who can access it.

---

## What Data Is Collected

When you upload evidence and use the tool, the following data is stored **locally on your device** in the tool's database:

| Data | Purpose |
|------|---------|
| Uploaded evidence files (.txt, .json, .pdf) | Source of extracted messages |
| SHA-256 file hash | Forensic chain-of-custody verification |
| Extracted message content | Analysis and timeline |
| Sender names | Attribution in timeline |
| Timestamps | Chronological ordering |
| Severity scores | Prioritisation of high-risk events |
| `is_verified` flag | Your human confirmation of each event |
| Your context notes | Your personal annotations |
| Your Django user account (username + hashed password) | Authentication |

---

## What Data Is NOT Collected

- **No data is sent to any external server.** The tool runs entirely on your local machine.
- **No analytics, telemetry, or crash reporting** is built into the software.
- **No third-party advertising or tracking** of any kind.
- **No cloud synchronisation** unless you explicitly configure one (e.g. by pointing `MEDIA_ROOT` or the database at a cloud service).

---

## Who Can Access Your Data

Your data is only accessible to:

1. **You**, via the Django admin interface (localhost only by default).
2. **Anyone who has physical or network access to the device running the server**, if you have not properly secured it.

> **Important:** Never run the development server (`manage.py runserver`) on a public network without HTTPS and proper authentication. See the [Security Policy](SECURITY.md) for the production deployment checklist.

---

## Sensitive Evidence

The evidence you store in this tool may include:

- Private communications (text messages, emails).
- Information about your children.
- Details about legal proceedings.
- Information about third parties (the abuser, witnesses).

Treat the database and uploaded files with the same care you would give to any sensitive legal document:

- Store the database and `MEDIA_ROOT` in an encrypted folder or encrypted drive.
- Use a strong password for your Django admin account.
- Back up your data regularly to an encrypted, secure location.
- Do not store your data on a device that the abuser has physical access to.

---

## Data Retention

You control your own data. There is no automatic deletion. To remove evidence:

1. Delete the `ForensicEvidence` record via the Django admin. This will cascade-delete all associated `AnalyzedEvent` records.
2. Manually delete the file from `MEDIA_ROOT/evidence_files/` if you want to remove it from disk.

To delete your entire dataset, delete the database file (default: `db.sqlite3`) and clear the `MEDIA_ROOT/evidence_files/` directory.

---

## Third-Party Libraries

This software uses third-party Python libraries (see [`requirements.txt`](../requirements.txt)). These libraries run locally and do not transmit data externally. Library authors may have their own privacy policies, but those policies apply to the library code itself, not to your data.

---

## Children's Privacy

This tool may be used to document abuse involving children. Any information about children that you enter or that is extracted from evidence files is stored locally on your device and is not shared with any third party.

---

## Your Rights

Because all data is stored locally on your device, you have complete control over it. You can:

- **Access** any data via the Django admin or the management shell.
- **Export** your data at any time (see [How to Use — Exporting Your Data](USAGE.md#9-exporting-your-data)).
- **Delete** any record at any time via the Django admin.
- **Stop using the software** at any time and delete all data from your device.

---

## Changes to This Policy

If the software is updated in ways that affect data handling, this document will be updated to reflect those changes.

---

## Contact

If you have questions about your data or this privacy policy, contact the copyright holder via GitHub: [@Carlymarie992](https://github.com/Carlymarie992).

---

## See Also

- [Security Policy](SECURITY.md)
- [Legal Notices](LEGAL.md)
