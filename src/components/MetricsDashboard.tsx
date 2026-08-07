"use client";

import { useEffect, useState } from "react";
import type { EvalReport } from "@/lib/eval/harness";

/**
 * Success-metrics dashboard.
 *
 * Two stat tiles, because two numbers are the headline and a chart would add
 * nothing. Everything below them exists so the headline can be audited: the
 * per-case table shows exactly which submissions passed, and the caveats are
 * rendered as prominently as the numbers rather than tucked into a footnote —
 * the time-reduction figure in particular rests on an assumption, and a metric
 * whose assumptions are hidden is a metric that will eventually mislead.
 */
export function MetricsDashboard() {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<"mock" | "claude">("mock");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/metrics?provider=${provider}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: EvalReport) => {
        if (!cancelled) setReport(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Success metrics</h1>
          <p className="mt-1 max-w-prose text-sm ink-secondary">
            Measured by replaying a labeled evaluation set through the full agent pipeline. The
            labels were authored against the appetite guide, not derived from engine output.
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs ink-secondary">
          Provider
          <select
            className="rounded border bg-[var(--surface-1)] px-1.5 py-1 text-xs"
            value={provider}
            onChange={(e) => setProvider(e.target.value as "mock" | "claude")}
          >
            <option value="mock">Deterministic (reproducible)</option>
            <option value="claude">Claude (full stack)</option>
          </select>
        </label>
      </header>

      {loading ? <p className="text-sm ink-muted">Running {12} cases…</p> : null}
      {error ? (
        <p className="text-sm" style={{ color: "var(--status-critical)" }}>
          Failed to load metrics: {error}
        </p>
      ) : null}

      {report ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile
              label="Recommendation accuracy"
              value={report.recommendationAccuracy}
              target={report.targets.recommendationAccuracy}
              met={report.meetsAccuracyTarget}
              caption="Decision and rank-1 product both correct."
            />
            <StatTile
              label="Underwriting time reduction"
              value={report.underwritingTimeReduction}
              target={report.targets.underwritingTimeReduction}
              met={report.meetsTimeTarget}
              caption={`${report.baselineTotalMinutes} min manual → ${report.assistedTotalMinutes.toFixed(1)} min assisted across ${report.cases.length} submissions.`}
            />
          </div>

          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-semibold">Component measures</h3>
            <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <Component label="Decision accuracy" value={report.decisionAccuracy} />
              <Component label="Product accuracy" value={report.productAccuracy} />
              <Component label="Risk-band accuracy" value={report.riskBandAccuracy} />
              <Component label="Straight-through rate" value={report.straightThroughRate} />
              <Component label="Waterfall integrity" value={report.waterfallIntegrity} />
              <Component label="Compliance pass rate" value={report.compliancePassRate} />
            </div>
          </section>

          <section className="card p-4 sm:p-5" style={{ borderColor: "var(--status-warning)" }}>
            <h3 className="text-sm font-semibold">What these numbers do and do not show</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs ink-secondary">
              {report.caveats.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </section>

          <section className="card scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Submission</th>
                  <th>Line</th>
                  <th className="text-right">Score</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Top product</th>
                  <th className="text-right">Baseline</th>
                  <th className="text-right">Assisted</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {report.cases.map((c) => (
                  <tr key={c.applicationId}>
                    <td>
                      <div className="font-medium tnum">{c.applicationId}</div>
                      <div className="text-xs ink-muted">{c.applicantName}</div>
                    </td>
                    <td className="ink-secondary">{c.line}</td>
                    <td className="text-right tnum">{c.riskScore}</td>
                    <td className="ink-secondary">{c.expectedOutcome}</td>
                    <td className="ink-secondary">{c.actualOutcome}</td>
                    <td className="tnum ink-secondary">
                      {c.actualTopProduct ?? "—"}
                      {c.actualTopProduct && !c.actualTopEligible ? (
                        <span className="ink-muted"> (not available)</span>
                      ) : null}
                    </td>
                    <td className="text-right tnum ink-secondary">{c.baselineMinutes} min</td>
                    <td className="text-right tnum ink-secondary">
                      {c.assistedTotalMinutes.toFixed(1)} min
                    </td>
                    <td>
                      <span className="badge !text-[10px]">
                        <span
                          className="badge-dot"
                          style={{
                            background: c.accurate ? "var(--status-good)" : "var(--status-critical)",
                          }}
                          aria-hidden
                        />
                        {c.accurate ? "Match" : "Miss"}
                      </span>
                      {c.notes.length > 0 ? (
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] ink-muted">
                          {c.notes.map((n, i) => (
                            <li key={i}>{n}</li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </div>
  );
}

function StatTile({
  label,
  value,
  target,
  met,
  caption,
}: {
  label: string;
  value: number;
  target: number;
  met: boolean;
  caption: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide ink-muted">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-3">
        <span className="text-[2.75rem] font-semibold leading-none">
          {(value * 100).toFixed(1)}%
        </span>
        <span className="badge">
          <span
            className="badge-dot"
            style={{ background: met ? "var(--status-good)" : "var(--status-critical)" }}
            aria-hidden
          />
          {met ? "Meets target" : "Below target"}
        </span>
      </div>

      {/* Progress against target, anchored at zero, single hue. */}
      <div className="relative mt-4 h-2 w-full rounded-[4px]" style={{ background: "var(--gridline)" }}>
        <div
          className="h-full rounded-[4px]"
          style={{
            width: `${Math.min(value, 1) * 100}%`,
            background: met ? "var(--status-good)" : "var(--status-critical)",
          }}
        />
        <div
          className="absolute -top-1 h-4 w-0.5"
          style={{ left: `${target * 100}%`, background: "var(--text-secondary)" }}
          aria-hidden
        />
      </div>
      <p className="mt-1.5 text-[11px] ink-muted">
        Target {(target * 100).toFixed(0)}% (marked). {caption}
      </p>
    </div>
  );
}

function Component({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs ink-secondary">{label}</span>
        <span className="text-sm font-semibold tnum">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-[4px]" style={{ background: "var(--gridline)" }}>
        <div
          className="h-full rounded-[4px]"
          style={{ width: `${value * 100}%`, background: "var(--series-1)" }}
        />
      </div>
    </div>
  );
}
