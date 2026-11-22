import type { AnalyzedEventRecord, ChronologySection } from './types.ts';

export type SectionByMode = 'day' | 'month' | 'source' | 'framework';

const DOC_CATEGORY_LABELS: Record<string, string> = {
  email: 'Emails (.eml)',
  court_document: 'Court & Legal Documents',
  medical_document: 'Medical & Clinical Records',
  personal_communication: 'Personal Communications (Chat / SMS)',
  spreadsheet_log: 'Tabular & Call/Message Logs (.csv)',
  screenshot_ocr: 'OCR Screenshots & Scanned Evidence',
  generic_document: 'General Documents & Transcripts',
};

export function buildChronologySections(
  events: AnalyzedEventRecord[],
  sectionBy: SectionByMode = 'day'
): { sections: ChronologySection[]; undatedCount: number; totalEvents: number } {
  const sorted = [...events].sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    }
    if (a.timestamp) return -1;
    if (b.timestamp) return 1;
    return a.id - b.id;
  });

  const groups = new Map<
    string,
    {
      title: string;
      subtitle: string;
      date_key: string | null;
      events: AnalyzedEventRecord[];
    }
  >();

  let undatedCount = 0;

  for (const ev of sorted) {
    if (!ev.timestamp) undatedCount++;

    let key = '';
    let title = '';
    let subtitle = '';
    let dateKey: string | null = null;

    if (sectionBy === 'day') {
      if (ev.timestamp) {
        const d = new Date(ev.timestamp);
        dateKey = d.toISOString().slice(0, 10);
        key = `day:${dateKey}`;
        title = d.toUTCString().slice(0, 16);
        subtitle = 'Cross-source chronological incidents on this date';
      } else {
        key = 'day:undated';
        title = 'Undated / Timestamp Pending Review';
        subtitle = 'Documents or screenshots lacking explicit date headers';
      }
    } else if (sectionBy === 'month') {
      if (ev.timestamp) {
        const d = new Date(ev.timestamp);
        dateKey = d.toISOString().slice(0, 7);
        key = `month:${dateKey}`;
        title = d.toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        });
        subtitle = 'Monthly chronological section';
      } else {
        key = 'month:undated';
        title = 'Undated / Timestamp Pending Review';
        subtitle = 'Documents or screenshots lacking explicit date headers';
      }
    } else if (sectionBy === 'source') {
      const cat = ev.document_category || 'generic_document';
      key = `source:${cat}`;
      title = DOC_CATEGORY_LABELS[cat] || cat;
      subtitle = 'Grouped by evidence document classification & placement';
    } else {
      const primaryWheel = ev.all_flags[0]?.wheel || 'Unclassified';
      key = `framework:${primaryWheel}`;
      title = primaryWheel;
      subtitle = 'Grouped by primary abuse framework triggered';
    }

    if (!groups.has(key)) {
      groups.set(key, { title, subtitle, date_key: dateKey, events: [] });
    }
    groups.get(key)!.events.push(ev);
  }

  const sections: ChronologySection[] = Array.from(groups.entries()).map(([section_id, g]) => {
    const sourceFiles = Array.from(new Set(g.events.map((e) => e.evidence_filename)));
    const highestSeverity = g.events.reduce(
      (max, e) => Math.max(max, e.severity_score),
      1
    );
    return {
      section_id,
      title: g.title,
      subtitle: g.subtitle,
      date_key: g.date_key,
      highest_severity: highestSeverity,
      event_count: g.events.length,
      source_files: sourceFiles,
      events: g.events,
    };
  });

  return {
    sections,
    undatedCount,
    totalEvents: sorted.length,
  };
}
