import { useEffect, useState, type FormEvent } from 'react';
import { BookOpen, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import type { AnalysisResult, TacticCatalogEntry } from '../types.ts';

const SEVERITY_LABEL: Record<number, string> = {
  1: '1 - Low (No tactic matches)',
  2: '2 - Moderate (Power & Control, Tech Harassment, DARVO, Proactive Aggression)',
  3: '3 - High (Economic, Child Weaponization, Legal Abuse, Mesosystem, Covert Surveillance)',
  4: '4 - Critical (Systemic / Institutional Betrayal, IBSA, Child Endangerment, Lethality Risk)',
};

export function MessageAnalyzerPanel() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<TacticCatalogEntry[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);

  useEffect(() => {
    fetch('/api/tactics')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.tactics) setCatalog(data.tactics);
      })
      .catch(() => {
        // Non-fatal catalog fetch failure
      });
  }, []);

  async function handleAnalyze(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed.');
      } else {
        setResult(data.result);
      }
    } catch (err) {
      setError((err as Error).message || 'Network error.');
    } finally {
      setLoading(false);
    }
  }

  const frameworkBuckets = result
    ? [
        { label: 'Post-Separation Power & Control', items: result.categories },
        { label: 'Economic Abuse Wheel (Glinski / Sharp)', items: result.economic_abuse_flags },
        { label: 'Abuse of Children Wheel', items: result.child_abuse_flags },
        { label: 'Legal Abuse Scale (LAS / Paper Abuse)', items: result.legal_abuse_flags },
        { label: 'Technology-Facilitated Abuse', items: result.tech_abuse_flags },
        { label: 'DARVO & Betrayal Trauma', items: result.darvo_flags },
        { label: 'Mesosystem Abuse', items: result.mesosystem_abuse_flags },
        {
          label: 'Systemic / Institutional Betrayal (IBQ)',
          items: result.institutional_betrayal_flags,
        },
        {
          label: 'Proactive Aggression & Contempt',
          items: result.proactive_aggression_flags,
        },
        { label: 'Lethality & Fundamental Needs Risk', items: result.lethality_risk_flags },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              CoerciveControlEngine — Multi-Framework Screening
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Broad multi-layer extraction (contraction normalization, word-boundary keywords, phrase regex patterns, and fuzzy partial-ratio matching &gt; 90) across all corpus-derived frameworks and {catalog.length || 62} tactic categories.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCatalog((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {showCatalog ? 'Hide' : 'View'} Tactics Taxonomy ({catalog.length})
            {showCatalog ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <form onSubmit={handleAnalyze} className="mt-4 space-y-3">
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a message, email, or courtroom statement to pull every matching abuse tactic, framework, and indicator..."
            className="block w-full rounded-md border border-slate-300 p-3 text-sm text-slate-900"
          />
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={loading || !text.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <ShieldAlert className="h-4 w-4" />
            {loading ? 'Analyzing...' : 'Analyze Message'}
          </button>
        </form>
      </div>

      {result && (
        <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Engine Results ({result.tactics_analyzed.length} of {result.total_tactics_evaluated}{' '}
                tactics matched)
              </h3>
              <p className="text-xs text-slate-500">
                Frameworks triggered: {result.frameworks_triggered.length} &middot; Matched
                indicators: {result.matched_indicators.length}
              </p>
            </div>
            <span className="rounded bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-900">
              Severity: {SEVERITY_LABEL[result.severity] || result.severity}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            {frameworkBuckets.map((bucket) => (
              <div key={bucket.label} className="rounded border border-slate-200 p-3">
                <div className="text-xs font-semibold uppercase text-slate-500">
                  {bucket.label}
                </div>
                <div className="mt-1 text-slate-800">
                  {bucket.items.length > 0 ? (
                    bucket.items.join(', ')
                  ) : (
                    <span className="text-slate-400">None detected</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-sm font-semibold text-slate-900">
              All Tactics Analyzed ({result.tactics_analyzed.length})
            </h4>
            {result.tactics_analyzed.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                No abuse tactic indicators matched across the {result.total_tactics_evaluated} evaluated corpus categories.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {result.tactics_analyzed.map((tactic, idx) => (
                  <div
                    key={`${tactic.wheel}-${tactic.category}-${idx}`}
                    className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900">
                        [{tactic.wheel}] {tactic.category}
                      </div>
                      <span className="rounded border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700">
                        Weight: {tactic.severity_weight}
                      </span>
                    </div>
                    <div className="mt-1 text-slate-600">
                      <span className="font-medium text-slate-700">Matched indicators:</span>{' '}
                      {tactic.matched_indicators.join(' | ')}
                    </div>
                    <div className="mt-1 text-slate-500">{tactic.citation}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showCatalog && catalog.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
          <h3 className="text-base font-semibold text-slate-900">
            Complete Corpus Tactics Catalog ({catalog.length} Evaluated Categories)
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Every tactic category evaluated on each message across all 10 research-backed abuse frameworks.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">Framework / Wheel</th>
                  <th className="px-3 py-2 font-semibold">Tactic Category</th>
                  <th className="px-3 py-2 font-semibold">Severity</th>
                  <th className="px-3 py-2 font-semibold">Rules</th>
                  <th className="px-3 py-2 font-semibold">Description &amp; Citation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {catalog.map((item, idx) => (
                  <tr key={`${item.wheel}-${item.category}-${idx}`}>
                    <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                      {item.wheel}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">{item.category}</td>
                    <td className="px-3 py-2 text-slate-700">{item.severity_weight}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {item.keyword_count} kw / {item.pattern_count} rx
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      <div>{item.description}</div>
                      <div className="mt-0.5 text-slate-400">{item.citation}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
