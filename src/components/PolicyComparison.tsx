"use client";

import { useMemo, useState } from "react";
import { coverageRowsForLine, getProduct } from "@/lib/data/products";
import type { LineOfBusiness, PolicyRecommendation } from "@/lib/domain/types";
import { Chip } from "./Badge";

/**
 * Interactive policy comparison.
 *
 * Three controls, each answering a question a customer actually asks: which
 * options am I comparing, what is genuinely different between them, and what
 * order should I read them in. Premium is shown as a bar as well as a number
 * because a table of four-figure numbers does not communicate "twice as much"
 * at a glance.
 */
export function PolicyComparison({
  recommendations,
  line,
  summary,
}: {
  recommendations: PolicyRecommendation[];
  line: LineOfBusiness;
  summary?: string;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    recommendations.slice(0, 3).map((r) => r.productId),
  );
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"rank" | "premium">("rank");

  const shown = useMemo(() => {
    const list = recommendations.filter((r) => selected.includes(r.productId));
    return sortBy === "premium"
      ? [...list].sort((a, b) => a.premium.annualTotal - b.premium.annualTotal)
      : [...list].sort((a, b) => a.rank - b.rank);
  }, [recommendations, selected, sortBy]);

  const allRows = coverageRowsForLine(line);
  const rows = useMemo(() => {
    if (!differencesOnly) return allRows;
    return allRows.filter((row) => {
      const limits = shown.map((rec) => limitFor(rec.productId, row.id));
      return new Set(limits.map((l) => String(l))).size > 1;
    });
  }, [allRows, differencesOnly, shown]);

  const maxPremium = Math.max(1, ...shown.map((r) => r.premium.annualTotal));

  return (
    <section className="card p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[16rem] flex-1">
          <h3 className="text-sm font-semibold">Policy comparison</h3>
          {summary ? (
            <p className="mt-1 max-w-prose whitespace-pre-line text-xs ink-secondary">{summary}</p>
          ) : null}
        </div>
      </header>

      {/* Filters live in one row above the chart, per the interaction spec. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {recommendations.map((rec) => {
          const on = selected.includes(rec.productId);
          return (
            <button
              key={rec.productId}
              type="button"
              onClick={() =>
                setSelected((prev) =>
                  on ? prev.filter((id) => id !== rec.productId) : [...prev, rec.productId],
                )
              }
              aria-pressed={on}
              className="badge"
              style={{
                background: on ? "var(--surface-3)" : "transparent",
                color: on ? "var(--text-primary)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              <span
                className="badge-dot"
                style={{ background: rec.eligible ? "var(--status-good)" : "var(--text-muted)" }}
                aria-hidden
              />
              {rec.productName}
            </button>
          );
        })}

        <span className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} aria-hidden />

        <label className="flex cursor-pointer items-center gap-1.5 text-xs ink-secondary">
          <input
            type="checkbox"
            checked={differencesOnly}
            onChange={(e) => setDifferencesOnly(e.target.checked)}
          />
          Differences only
        </label>

        <label className="flex items-center gap-1.5 text-xs ink-secondary">
          Sort
          <select
            className="rounded border bg-[var(--surface-1)] px-1.5 py-0.5 text-xs"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "rank" | "premium")}
          >
            <option value="rank">Recommended order</option>
            <option value="premium">Lowest premium</option>
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm ink-muted">Select at least one product to compare.</p>
      ) : (
        <div className="scroll-x">
          <table className="data" style={{ minWidth: `${12 + shown.length * 14}rem` }}>
            <thead>
              <tr>
                <th style={{ width: "12rem" }}>Coverage</th>
                {shown.map((rec) => (
                  <th key={rec.productId} style={{ minWidth: "13rem" }}>
                    <span className="block text-[13px] font-semibold normal-case tracking-normal text-[var(--text-primary)]">
                      {rec.productName}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <Chip>Rank {rec.rank}</Chip>
                      {rec.eligible ? (
                        <Chip tone="accent">Fit {rec.fitScore.toFixed(2)}</Chip>
                      ) : (
                        <span className="badge" style={{ color: "var(--status-critical)" }}>
                          Not available
                        </span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium">Annual premium</td>
                {shown.map((rec) => (
                  <td key={rec.productId}>
                    <div className="text-[15px] font-semibold tnum">
                      ${rec.premium.annualTotal.toLocaleString()}
                    </div>
                    <div className="text-[11px] ink-muted tnum">
                      ${rec.premium.monthlyTotal.toLocaleString()}/mo
                    </div>
                    {/* Magnitude bar: one measure, one hue, anchored to zero. */}
                    <div className="mt-1.5 h-1.5 w-full rounded-[4px]" style={{ background: "var(--gridline)" }}>
                      <div
                        className="h-full rounded-[4px]"
                        style={{
                          width: `${(rec.premium.annualTotal / maxPremium) * 100}%`,
                          background: rec.eligible ? "var(--series-1)" : "var(--text-muted)",
                        }}
                      />
                    </div>
                  </td>
                ))}
              </tr>

              <tr>
                <td className="font-medium">Coverage / deductible</td>
                {shown.map((rec) => (
                  <td key={rec.productId} className="tnum">
                    ${rec.coverageAmount.toLocaleString()}
                    <span className="ink-muted"> / ${rec.deductible.toLocaleString()}</span>
                  </td>
                ))}
              </tr>

              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="ink-secondary">{row.label}</td>
                  {shown.map((rec) => {
                    const limit = limitFor(rec.productId, row.id);
                    return (
                      <td key={rec.productId}>
                        {limit === null || limit === undefined ? (
                          <span className="ink-muted">Not included</span>
                        ) : (
                          <span className="tnum">${limit.toLocaleString()}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              <tr>
                <td className="font-medium">Why this one</td>
                {shown.map((rec) => (
                  <td key={rec.productId} className="ink-secondary">
                    {rec.rationale}
                    {rec.ineligibleReason ? (
                      <div className="mt-1.5" style={{ color: "var(--status-critical)" }}>
                        {rec.ineligibleReason}
                      </div>
                    ) : null}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="font-medium">Tradeoffs</td>
                {shown.map((rec) => (
                  <td key={rec.productId}>
                    <ul className="list-disc space-y-1 pl-4 ink-secondary">
                      {rec.tradeoffs.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>

              <tr>
                <td className="font-medium">Gaps vs. inferred needs</td>
                {shown.map((rec) => (
                  <td key={rec.productId}>
                    {rec.gaps.length === 0 ? (
                      <span style={{ color: "var(--delta-good)" }}>None</span>
                    ) : (
                      <span style={{ color: "var(--status-serious)" }}>{rec.gaps.join(", ")}</span>
                    )}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="font-medium">Premium breakdown</td>
                {shown.map((rec) => (
                  <td key={rec.productId} className="text-[11px] ink-secondary tnum">
                    <div>Base ${rec.premium.base.toLocaleString()}</div>
                    <div>Risk load ${rec.premium.riskLoad.toLocaleString()}</div>
                    {rec.premium.deductibleCredit !== 0 ? (
                      <div>Deductible ${rec.premium.deductibleCredit.toLocaleString()}</div>
                    ) : null}
                    {rec.premium.discounts.map((d) => (
                      <div key={d.id}>
                        {d.label} ${d.amount.toLocaleString()}
                      </div>
                    ))}
                    <div>Fees ${rec.premium.fees.toLocaleString()}</div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function limitFor(productId: string, coverageId: string): number | null | undefined {
  const product = getProduct(productId);
  return product?.coverages.find((c) => c.id === coverageId)?.limit;
}
