"use client";

import { useMemo, useState } from "react";
import type { RiskAssessment } from "@/lib/domain/types";

/**
 * Risk waterfall.
 *
 * Diverging encoding: red adds risk, blue credits it, with a neutral track
 * behind. The bars are laid out from the running cumulative total, so the chart
 * reconciles to the final score by construction — if the engine's factors ever
 * stopped summing, the chart would visibly stop landing on the score rather
 * than quietly lying.
 *
 * A table view is always available, so identity never depends on color alone.
 */
export function RiskWaterfall({ risk }: { risk: RiskAssessment }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const rows = useMemo(() => {
    let cumulative = risk.baseline;
    const out = risk.factors.map((factor) => {
      const start = cumulative;
      cumulative += factor.contribution;
      return { factor, start, end: cumulative };
    });
    return out;
  }, [risk]);

  const rawTotal = risk.baseline + risk.factors.reduce((s, f) => s + f.contribution, 0);
  const clamped = Math.round(rawTotal) !== risk.score;
  // Scale to whatever the running total actually reaches, so a case that blows
  // past 100 before clamping still renders truthfully.
  const domainMax = Math.max(100, ...rows.map((r) => Math.max(r.start, r.end)));
  const pct = (v: number) => (v / domainMax) * 100;

  return (
    <section className="card p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Risk score composition</h3>
          <p className="mt-0.5 text-xs ink-muted">
            Baseline {risk.baseline} plus {risk.factors.length} factors
            {clamped ? " (clamped at the 0–100 range)" : ""} → {risk.score}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Legend />
          <button
            type="button"
            className="btn !px-2.5 !py-1 !text-xs"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
          >
            {showTable ? "Chart" : "Table"}
          </button>
        </div>
      </header>

      {showTable ? (
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>Factor</th>
                <th className="text-right">Contribution</th>
                <th className="text-right">Running</th>
                <th>Evidence</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium">Baseline</td>
                <td className="text-right tnum">{risk.baseline}</td>
                <td className="text-right tnum">{risk.baseline}</td>
                <td className="ink-secondary">Book-average starting point before any applicant data.</td>
                <td className="ink-muted">Rating model</td>
              </tr>
              {rows.map(({ factor, end }) => (
                <tr key={factor.id}>
                  <td className="font-medium">{factor.label}</td>
                  <td className="text-right tnum" style={{ color: colorFor(factor.contribution) }}>
                    {factor.contribution >= 0 ? "+" : ""}
                    {factor.contribution}
                  </td>
                  <td className="text-right tnum">{Math.round(end)}</td>
                  <td className="ink-secondary">{factor.evidence}</td>
                  <td className="ink-muted">{factor.source}</td>
                </tr>
              ))}
              <tr>
                <td className="font-semibold">Final score</td>
                <td className="text-right tnum font-semibold">{risk.score}</td>
                <td className="text-right tnum font-semibold">{risk.score}</td>
                <td className="ink-secondary">Band: {risk.band}</td>
                <td className="ink-muted">Rating model</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <Gridlines domainMax={domainMax} />

          <div className="relative space-y-[3px]">
            <Row
              label="Baseline"
              value={risk.baseline}
              leftPct={0}
              widthPct={pct(risk.baseline)}
              color="var(--axis)"
              emphasis
              valueLabel={String(risk.baseline)}
            />

            {rows.map(({ factor, start, end }, i) => {
              const lo = Math.min(start, end);
              const hi = Math.max(start, end);
              return (
                <Row
                  key={factor.id}
                  label={factor.label}
                  value={factor.contribution}
                  leftPct={pct(lo)}
                  widthPct={Math.max(pct(hi - lo), 0.6)}
                  color={colorFor(factor.contribution)}
                  valueLabel={`${factor.contribution >= 0 ? "+" : ""}${factor.contribution}`}
                  onEnter={() => setHovered(i)}
                  onLeave={() => setHovered(null)}
                  hovered={hovered === i}
                  tooltip={
                    <>
                      <div className="font-semibold">{factor.label}</div>
                      <div className="mt-1 ink-secondary">{factor.evidence}</div>
                      <div className="mt-1.5 ink-muted">
                        {factor.contribution >= 0 ? "+" : ""}
                        {factor.contribution} · running total {Math.round(end)} · {factor.source}
                      </div>
                    </>
                  }
                />
              );
            })}

            <Row
              label="Final score"
              value={risk.score}
              leftPct={0}
              widthPct={pct(risk.score)}
              color="var(--text-secondary)"
              emphasis
              valueLabel={String(risk.score)}
            />
          </div>

          <AxisTicks domainMax={domainMax} />
        </div>
      )}
    </section>
  );
}

function colorFor(contribution: number): string {
  if (contribution > 0) return "var(--pole-risk)";
  if (contribution < 0) return "var(--pole-credit)";
  return "var(--neutral-mid)";
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs ink-secondary">
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ background: "var(--pole-risk)" }}
          aria-hidden
        />
        Adds risk
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-sm"
          style={{ background: "var(--pole-credit)" }}
          aria-hidden
        />
        Credit
      </span>
    </div>
  );
}

const LABEL_COL = "minmax(9rem, 13rem)";

function Row({
  label,
  value,
  leftPct,
  widthPct,
  color,
  valueLabel,
  emphasis,
  hovered,
  tooltip,
  onEnter,
  onLeave,
}: {
  label: string;
  value: number;
  leftPct: number;
  widthPct: number;
  color: string;
  valueLabel: string;
  emphasis?: boolean;
  hovered?: boolean;
  tooltip?: React.ReactNode;
  onEnter?: () => void;
  onLeave?: () => void;
}) {
  return (
    <div
      className="group relative grid items-center gap-3"
      style={{ gridTemplateColumns: `${LABEL_COL} 1fr 3rem` }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div
        className={`truncate text-xs ${emphasis ? "font-semibold" : "ink-secondary"}`}
        title={label}
      >
        {label}
      </div>

      {/* Hit target is the full track, which is taller than the mark. */}
      <div className="relative h-[22px]">
        <div
          className="absolute inset-y-[6px] rounded-[4px]"
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            background: color,
            // 2px surface ring keeps touching marks visually separated.
            boxShadow: hovered ? "0 0 0 2px var(--surface-1), 0 0 0 3px var(--text-muted)" : "none",
          }}
        />
      </div>

      <div
        className="text-right text-xs tnum"
        style={{ color: emphasis ? "var(--text-primary)" : "var(--text-secondary)" }}
      >
        {valueLabel}
      </div>

      {tooltip && hovered ? (
        <div
          role="tooltip"
          className="card pointer-events-none absolute left-[9rem] top-full z-10 mt-1 w-[min(26rem,80vw)] p-2.5 text-xs shadow-lg"
        >
          {tooltip}
        </div>
      ) : null}
      <span className="sr-only">
        {label}: {value}
      </span>
    </div>
  );
}

function Gridlines({ domainMax }: { domainMax: number }) {
  const ticks = tickValues(domainMax);
  return (
    <div
      className="pointer-events-none absolute inset-0 grid"
      style={{ gridTemplateColumns: `${LABEL_COL} 1fr 3rem`, gap: "0.75rem" }}
      aria-hidden
    >
      <div />
      <div className="relative">
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute inset-y-0 w-px"
            style={{ left: `${(t / domainMax) * 100}%`, background: "var(--gridline)" }}
          />
        ))}
      </div>
      <div />
    </div>
  );
}

function AxisTicks({ domainMax }: { domainMax: number }) {
  const ticks = tickValues(domainMax);
  return (
    <div
      className="mt-1.5 grid gap-3"
      style={{ gridTemplateColumns: `${LABEL_COL} 1fr 3rem` }}
      aria-hidden
    >
      <div />
      <div className="relative h-4">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2 text-[10px] tnum ink-muted"
            style={{ left: `${(t / domainMax) * 100}%` }}
          >
            {t}
          </span>
        ))}
      </div>
      <div />
    </div>
  );
}

function tickValues(domainMax: number): number[] {
  const step = domainMax <= 100 ? 25 : 30;
  const out: number[] = [];
  for (let v = 0; v <= domainMax; v += step) out.push(v);
  return out;
}
