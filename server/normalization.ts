import type { RawMessage } from './types.ts';

export interface NormalizedMessage {
  timestamp: string | null;
  sender: string;
  content: string;
  sender_id: string;
  conversation_id: string;
  message_id: string;
  source_platform: string;
}

export function normalizeMessages(rawMessages: RawMessage[]): NormalizedMessage[] {
  return rawMessages.map((msg) => {
    let ts: string | null = msg.timestamp ?? null;
    if (ts) {
      const parsed = new Date(ts);
      ts = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    return {
      timestamp: ts,
      sender: msg.sender || 'Unknown',
      content: msg.content || '',
      sender_id: msg.sender_id || '',
      conversation_id: msg.conversation_id || '',
      message_id: msg.message_id || '',
      source_platform: msg.source_platform || '',
    };
  });
}

function getLocalDateParts(date: Date, tzName: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tzName,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = Number.parseInt(parts.find((p) => p.type === 'year')?.value || '1970', 10);
  const month = Number.parseInt(parts.find((p) => p.type === 'month')?.value || '1', 10);
  const day = Number.parseInt(parts.find((p) => p.type === 'day')?.value || '1', 10);
  return { year, month, day };
}

function localMidnightUtcMs(year: number, month: number, day: number, tzName: string): number {
  const approxUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tzName,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Iteratively refine offset so DST transitions resolve accurately
  let candidate = approxUtc;
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(candidate));
    const py = Number.parseInt(parts.find((p) => p.type === 'year')?.value || '0', 10);
    const pm = Number.parseInt(parts.find((p) => p.type === 'month')?.value || '0', 10);
    const pd = Number.parseInt(parts.find((p) => p.type === 'day')?.value || '0', 10);
    let ph = Number.parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    if (ph === 24) ph = 0;
    const pmin = Number.parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const ps = Number.parseInt(parts.find((p) => p.type === 'second')?.value || '0', 10);

    const renderedUtc = Date.UTC(py, pm - 1, pd, ph, pmin, ps);
    const diff = approxUtc - renderedUtc;
    if (diff === 0) break;
    candidate += diff;
  }
  return candidate;
}

export function localDayBounds(isoTimestamp: string, tzName: string): [number, number] {
  const dt = new Date(isoTimestamp);
  let validTz = tzName || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: validTz }).format(dt);
  } catch {
    validTz = 'UTC';
  }
  const { year, month, day } = getLocalDateParts(dt, validTz);
  const startMs = localMidnightUtcMs(year, month, day, validTz);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  const endMs = localMidnightUtcMs(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth() + 1,
    nextDate.getUTCDate(),
    validTz
  );
  return [startMs, endMs];
}

export function buildContextWindow(
  totalLength: number,
  flaggedIdx: number,
  windowSize = 5
): [number, number] {
  const start = Math.max(0, flaggedIdx - windowSize);
  const end = Math.min(totalLength - 1, flaggedIdx + windowSize);
  return [start, end];
}

export function mergeWindows(windows: Array<[number, number]>): Array<[number, number]> {
  if (windows.length === 0) return [];
  const sorted = [...windows].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i];
    const last = merged[merged.length - 1];
    if (start <= last[1] + 1) {
      merged[merged.length - 1] = [last[0], Math.max(last[1], end)];
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}
