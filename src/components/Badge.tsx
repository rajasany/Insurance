import type { DecisionOutcome, Severity } from "@/lib/domain/types";

/**
 * Status is carried by a dot *and* a text label, never by color alone — two of
 * the four status steps sit below 3:1 on the light surface by design, so the
 * label is the mitigation, not a nicety.
 */

const SEVERITY_COLOR: Record<Severity, string> = {
  low: "var(--status-good)",
  moderate: "var(--status-warning)",
  elevated: "var(--status-serious)",
  high: "var(--status-critical)",
};

const OUTCOME_COLOR: Record<DecisionOutcome, string> = {
  approve: "var(--status-good)",
  refer: "var(--status-warning)",
  decline: "var(--status-critical)",
};

const OUTCOME_LABEL: Record<DecisionOutcome, string> = {
  approve: "Approve",
  refer: "Refer to underwriter",
  decline: "Decline",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className="badge">
      <span className="badge-dot" style={{ background: SEVERITY_COLOR[severity] }} aria-hidden />
      {severity[0].toUpperCase() + severity.slice(1)}
    </span>
  );
}

export function OutcomeBadge({ outcome }: { outcome: DecisionOutcome }) {
  return (
    <span className="badge">
      <span className="badge-dot" style={{ background: OUTCOME_COLOR[outcome] }} aria-hidden />
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

export function Chip({ children, tone }: { children: React.ReactNode; tone?: "muted" | "accent" }) {
  return (
    <span
      className="badge"
      style={{
        color: tone === "accent" ? "var(--series-1)" : "var(--text-secondary)",
        background: "var(--surface-3)",
      }}
    >
      {children}
    </span>
  );
}
