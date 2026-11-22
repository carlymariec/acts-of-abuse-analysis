import { useMemo, useState } from 'react';
import type { TimelinePoint } from '../types.ts';

interface TimelineChartProps {
  empty: boolean;
  message?: string;
  points: TimelinePoint[];
}

const SENDER_COLORS = [
  '#2563eb',
  '#dc2626',
  '#7c3aed',
  '#d97706',
  '#059669',
  '#db2777',
  '#0891b2',
  '#4f46e5',
];

const SEVERITY_LABELS: Record<number, string> = {
  1: '1 - Low',
  2: '2 - Moderate',
  3: '3 - High',
  4: '4 - Critical',
};

export function TimelineChart({ empty, message, points }: TimelineChartProps) {
  const [hovered, setHovered] = useState<TimelinePoint | null>(null);

  const senders = useMemo(
    () => Array.from(new Set(points.map((p) => p.sender))),
    [points]
  );

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    senders.forEach((s, idx) => {
      map.set(s, SENDER_COLORS[idx % SENDER_COLORS.length]);
    });
    return map;
  }, [senders]);

  if (empty || points.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm font-medium text-slate-600">
          {message || 'No verified events available to display timeline.'}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Only human-verified events (<code className="rounded bg-slate-100 px-1 py-0.5">is_verified = true</code>) with a non-null timestamp appear on the chronological timeline.
        </p>
      </div>
    );
  }

  const width = 920;
  const height = 400;
  const pad = { top: 28, right: 32, bottom: 56, left: 100 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const times = points.map((p) => new Date(p.time).getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const spanT = maxT - minT;

  const xForTime = (tMs: number): number => {
    if (spanT === 0) return pad.left + plotW / 2;
    return pad.left + ((tMs - minT) / spanT) * plotW;
  };

  const yForSeverity = (sev: number): number => {
    const clamped = Math.max(1, Math.min(4, sev));
    return pad.top + ((4 - clamped) / 3) * plotH;
  };

  const tickCount = spanT === 0 ? 1 : 5;
  const xTicks = Array.from({ length: tickCount }, (_, i) => {
    const t = spanT === 0 ? minT : minT + (spanT * i) / (tickCount - 1);
    return {
      x: xForTime(t),
      label: new Date(t).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="text-xs font-medium text-slate-600">
          Showing <span className="font-semibold text-slate-900">{points.length}</span> verified timeline {points.length === 1 ? 'event' : 'events'}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {senders.map((sender) => (
            <div key={sender} className="flex items-center gap-1.5 text-xs text-slate-700">
              <svg className="h-3 w-3 shrink-0" viewBox="0 0 12 12" aria-hidden="true">
                <circle cx="6" cy="6" r="6" fill={colorMap.get(sender) || '#2563eb'} />
              </svg>
              <span>{sender}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative rounded-lg border border-slate-200 bg-white p-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[640px] h-auto select-none"
          role="img"
          aria-label="Verified coercive control events timeline"
        >
          {/* Horizontal gridlines for severity 1-4 */}
          {[1, 2, 3, 4].map((sev) => {
            const y = yForSeverity(sev);
            return (
              <g key={sev}>
                <line
                  x1={pad.left}
                  y1={y}
                  x2={width - pad.right}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="4 4"
                />
                <text
                  x={pad.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-600 text-[11px]"
                >
                  {SEVERITY_LABELS[sev]}
                </text>
              </g>
            );
          })}

          {/* Axes */}
          <line
            x1={pad.left}
            y1={pad.top}
            x2={pad.left}
            y2={height - pad.bottom}
            stroke="#94a3b8"
          />
          <line
            x1={pad.left}
            y1={height - pad.bottom}
            x2={width - pad.right}
            y2={height - pad.bottom}
            stroke="#94a3b8"
          />

          {/* X-axis ticks */}
          {xTicks.map((tick, idx) => (
            <g key={idx}>
              <line
                x1={tick.x}
                y1={height - pad.bottom}
                x2={tick.x}
                y2={height - pad.bottom + 6}
                stroke="#94a3b8"
              />
              <text
                x={tick.x}
                y={height - pad.bottom + 22}
                textAnchor="middle"
                className="fill-slate-600 text-[11px]"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Scatter points */}
          {points.map((pt) => {
            const cx = xForTime(new Date(pt.time).getTime());
            const cy = yForSeverity(pt.severity);
            const fill = colorMap.get(pt.sender) || '#2563eb';
            const isActive = hovered?.id === pt.id;
            return (
              <circle
                key={pt.id}
                cx={cx}
                cy={cy}
                r={isActive ? 9 : 6.5}
                fill={fill}
                fillOpacity={0.85}
                stroke="#ffffff"
                strokeWidth={2}
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHovered(pt)}
                onFocus={() => setHovered(pt)}
                onClick={() => setHovered(pt)}
              />
            );
          })}
        </svg>

        {hovered && (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-slate-900">
                {hovered.sender}
                {hovered.receiver ? ` -> ${hovered.receiver}` : ''} &middot;{' '}
                {SEVERITY_LABELS[hovered.severity]}
              </div>
              <div className="text-xs text-slate-500">
                {new Date(hovered.time).toUTCString()}
              </div>
            </div>
            {hovered.placement_citation?.citation_label && (
              <div className="mt-1 font-mono text-xs text-slate-600">
                Citation: {hovered.placement_citation.citation_label}
              </div>
            )}
            <p className="mt-2 text-slate-800 whitespace-pre-wrap">{hovered.content}</p>
            {hovered.all_flags && hovered.all_flags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {hovered.all_flags.map((f, idx) => (
                  <span
                    key={idx}
                    className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700"
                  >
                    <span className="font-medium">{f.wheel}:</span> {f.category}
                  </span>
                ))}
              </div>
            )}
            {hovered.matched_indicators && hovered.matched_indicators.length > 0 && (
              <p className="mt-2 text-xs text-slate-600">
                <span className="font-semibold">Matched indicators:</span>{' '}
                {hovered.matched_indicators.join(' | ')}
              </p>
            )}
            {hovered.context && (
              <p className="mt-2 rounded bg-white px-3 py-2 text-xs text-slate-700 border border-slate-200">
                <span className="font-semibold">Context Notes:</span> {hovered.context}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
