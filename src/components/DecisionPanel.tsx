"use client";

import { useState } from "react";
import type {
  ComplianceReview,
  EnrichedRiskData,
  RiskAssessment,
  UnderwritingDecision,
} from "@/lib/domain/types";
import { OutcomeBadge, SeverityBadge } from "./Badge";

/**
 * Underwriting status and explanation.
 *
 * The decision, the rules that produced it, the conditions attached, the
 * compliance review, and the data provenance all live in one place — an
 * underwriter should never have to leave this panel to answer "why?".
 */
export function DecisionPanel({
  decision,
  risk,
  compliance,
  enriched,
}: {
  decision: UnderwritingDecision;
  risk: RiskAssessment;
  compliance?: ComplianceReview;
  enriched?: EnrichedRiskData;
}) {
  const [tab, setTab] = useState<"rules" | "conditions" | "compliance" | "provenance">("rules");
  const blocking = decision.conditions.filter((c) => c.blocking);

  return (
    <section className="card overflow-hidden">
      <div className="border-b p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <OutcomeBadge outcome={decision.outcome} />
          <SeverityBadge severity={risk.band} />
          <span className="badge">
            Score <span className="tnum">{risk.score}</span>/100
          </span>
          <span className="badge">
            Confidence <span className="tnum">{Math.round(decision.confidence * 100)}%</span>
          </span>
          <span className="badge ink-muted">
            {decision.reviewedBy === "automated" ? "Straight-through" : "Human review required"}
          </span>
        </div>

        <p className="mt-3 max-w-prose text-sm leading-relaxed">{decision.rationale}</p>

        {risk.narrative ? (
          <p className="mt-2 max-w-prose text-sm leading-relaxed ink-secondary">{risk.narrative}</p>
        ) : null}

        {blocking.length > 0 ? (
          <div
            className="mt-3 rounded-md border p-2.5 text-xs"
            style={{ borderColor: "var(--status-serious)" }}
          >
            <span className="font-semibold">
              {blocking.length} blocking condition{blocking.length === 1 ? "" : "s"} before bind:
            </span>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 ink-secondary">
              {blocking.map((c) => (
                <li key={c.id}>{c.label}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <nav className="flex gap-1 border-b px-3 py-2 text-xs" role="tablist">
        {(
          [
            ["rules", `Rules (${decision.rules.length})`],
            ["conditions", `Conditions (${decision.conditions.length})`],
            ["compliance", `Compliance (${compliance?.findings.length ?? 0})`],
            ["provenance", `Data sources (${enriched?.sources.length ?? 0})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className="rounded-md px-2.5 py-1.5 font-medium"
            style={{
              background: tab === id ? "var(--surface-3)" : "transparent",
              color: tab === id ? "var(--text-primary)" : "var(--text-secondary)",
            }}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="p-1">
        {tab === "rules" ? (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: "5.5rem" }}>Result</th>
                  <th style={{ width: "6rem" }}>Rule</th>
                  <th>Check and finding</th>
                  <th style={{ width: "14rem" }}>Reference</th>
                </tr>
              </thead>
              <tbody>
                {decision.rules.map((rule) => (
                  <tr key={rule.ruleId}>
                    <td>
                      <span className="badge !text-[10px]">
                        <span
                          className="badge-dot"
                          style={{
                            background:
                              rule.outcome === "pass"
                                ? "var(--status-good)"
                                : rule.outcome === "refer"
                                  ? "var(--status-warning)"
                                  : "var(--status-critical)",
                          }}
                          aria-hidden
                        />
                        {rule.outcome === "fail" ? "Decline" : rule.outcome === "refer" ? "Refer" : "Pass"}
                      </span>
                    </td>
                    <td className="tnum ink-muted">{rule.ruleId}</td>
                    <td>
                      <div className="font-medium">{rule.description}</div>
                      <div className="mt-0.5 ink-secondary">{rule.detail}</div>
                    </td>
                    <td className="ink-muted">{rule.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "conditions" ? (
          decision.conditions.length === 0 ? (
            <p className="p-4 text-sm ink-muted">No conditions attached.</p>
          ) : (
            <ul className="divide-y">
              {decision.conditions.map((c) => (
                <li key={c.id} className="flex items-start gap-2.5 p-3 text-sm">
                  <span className="badge !text-[10px]">
                    <span
                      className="badge-dot"
                      style={{
                        background: c.blocking ? "var(--status-serious)" : "var(--status-warning)",
                      }}
                      aria-hidden
                    />
                    {c.blocking ? "Blocking" : "Advisory"}
                  </span>
                  <span className="ink-secondary">{c.label}</span>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {tab === "compliance" ? (
          !compliance ? (
            <p className="p-4 text-sm ink-muted">Compliance review has not run.</p>
          ) : (
            <div>
              <ul className="divide-y">
                {compliance.findings.map((f) => (
                  <li key={f.id} className="flex items-start gap-2.5 p-3 text-sm">
                    <span className="badge !text-[10px]">
                      <span
                        className="badge-dot"
                        style={{
                          background:
                            f.severity === "violation"
                              ? "var(--status-critical)"
                              : f.severity === "warning"
                                ? "var(--status-warning)"
                                : "var(--status-good)",
                        }}
                        aria-hidden
                      />
                      {f.severity}
                    </span>
                    <span>
                      <span className="ink-secondary">{f.message}</span>
                      <span className="mt-0.5 block text-xs ink-muted">{f.regulation}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {compliance.adverseActionNotice ? (
                <details className="border-t p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Adverse-action notice (draft)
                  </summary>
                  <pre className="mt-2 max-w-prose whitespace-pre-wrap text-xs leading-relaxed ink-secondary">
                    {compliance.adverseActionNotice}
                  </pre>
                </details>
              ) : null}
            </div>
          )
        ) : null}

        {tab === "provenance" ? (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="text-right">Latency</th>
                  <th>Retrieved</th>
                </tr>
              </thead>
              <tbody>
                {(enriched?.sources ?? []).map((s) => (
                  <tr key={s.name}>
                    <td className="font-medium">{s.name}</td>
                    <td className="ink-secondary">{s.kind.replace(/_/g, " ")}</td>
                    <td>
                      <span className="badge !text-[10px]">
                        <span
                          className="badge-dot"
                          style={{
                            background:
                              s.status === "ok"
                                ? "var(--status-good)"
                                : s.status === "degraded"
                                  ? "var(--status-warning)"
                                  : "var(--text-muted)",
                          }}
                          aria-hidden
                        />
                        {s.status}
                      </span>
                    </td>
                    <td className="text-right tnum">{s.latencyMs}ms</td>
                    <td className="ink-muted tnum">{s.retrievedAt.replace("T", " ").slice(0, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {risk.dataGaps.length > 0 ? (
              <div className="border-t p-3">
                <p className="text-xs font-semibold">Rating gaps</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs ink-secondary">
                  {risk.dataGaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
