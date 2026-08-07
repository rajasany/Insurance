"use client";

import { useState } from "react";
import type { AgentId, AgentStatus, AgentTrace } from "@/lib/domain/types";

/**
 * Coordination timeline.
 *
 * Bars are positioned on a shared wall-clock axis rather than stacked in list
 * order, so agents that genuinely ran concurrently overlap on screen. That is
 * the point of the view — a stacked list would imply a sequential pipeline the
 * orchestrator does not actually run.
 */

const STATUS_COLOR: Record<AgentStatus, string> = {
  pending: "var(--axis)",
  running: "var(--series-1)",
  complete: "var(--series-1)",
  failed: "var(--status-critical)",
  skipped: "var(--text-muted)",
};

const STATUS_LABEL: Record<AgentStatus, string> = {
  pending: "Queued",
  running: "Running",
  complete: "Complete",
  failed: "Failed",
  skipped: "Skipped",
};

export interface TimelineAgent {
  id: AgentId;
  label: string;
  description: string;
  consumes: AgentId[];
}

export function AgentTimeline({
  roster,
  traces,
  runStartedAt,
  now,
}: {
  roster: TimelineAgent[];
  traces: Record<AgentId, AgentTrace | undefined>;
  runStartedAt: number | null;
  now: number;
}) {
  const [expanded, setExpanded] = useState<AgentId | null>(null);

  const started = runStartedAt ?? now;
  const finishes = roster
    .map((a) => traces[a.id]?.finishedAt ?? (traces[a.id]?.status === "running" ? now : undefined))
    .filter((v): v is number => typeof v === "number");
  const end = finishes.length > 0 ? Math.max(...finishes) : started + 1;
  const span = Math.max(end - started, 1);

  return (
    <section className="card p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Agent coordination</h3>
        <p className="text-xs ink-muted">
          {runStartedAt
            ? `${(span / 1000).toFixed(2)}s elapsed · bars share one wall-clock axis, so overlap means genuine concurrency`
            : "Not started"}
        </p>
      </header>

      <ol className="space-y-1.5">
        {roster.map((agent) => {
          const trace = traces[agent.id];
          const status: AgentStatus = trace?.status ?? "pending";
          const startedAt = trace?.startedAt;
          const finishedAt = trace?.finishedAt ?? (status === "running" ? now : undefined);

          const leftPct =
            startedAt && runStartedAt ? ((startedAt - runStartedAt) / span) * 100 : 0;
          const widthPct =
            startedAt && finishedAt ? Math.max(((finishedAt - startedAt) / span) * 100, 1.5) : 0;

          const isOpen = expanded === agent.id;
          const logCount = trace?.log.length ?? 0;

          return (
            <li key={agent.id} className="rounded-md" style={{ background: isOpen ? "var(--surface-3)" : undefined }}>
              <button
                type="button"
                className="grid w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-[var(--surface-3)]"
                style={{ gridTemplateColumns: "minmax(9rem,12rem) 1fr auto" }}
                onClick={() => setExpanded(isOpen ? null : agent.id)}
                aria-expanded={isOpen}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{agent.label}</span>
                  <span className="block truncate text-[11px] ink-muted">
                    {agent.consumes.length > 0
                      ? `reads ${agent.consumes.join(", ")}`
                      : "entry point"}
                  </span>
                </span>

                <span className="relative block h-[18px]">
                  <span
                    className="absolute inset-y-[5px] left-0 right-0 rounded-[4px]"
                    style={{ background: "var(--gridline)" }}
                    aria-hidden
                  />
                  {widthPct > 0 ? (
                    <span
                      className="absolute inset-y-[4px] rounded-[4px]"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        background: STATUS_COLOR[status],
                        opacity: status === "running" ? 0.75 : 1,
                        boxShadow: "0 0 0 2px var(--surface-1)",
                      }}
                      aria-hidden
                    />
                  ) : null}
                </span>

                <span className="flex items-center gap-2 whitespace-nowrap text-[11px]">
                  <span className="tnum ink-secondary">
                    {trace?.durationMs !== undefined
                      ? `${trace.durationMs}ms`
                      : status === "running"
                        ? "…"
                        : "—"}
                  </span>
                  <span className="badge !py-0 !text-[10px]">
                    <span
                      className="badge-dot"
                      style={{ background: STATUS_COLOR[status] }}
                      aria-hidden
                    />
                    {STATUS_LABEL[status]}
                  </span>
                </span>
              </button>

              {isOpen ? (
                <div className="px-3 pb-3 pt-1">
                  <p className="mb-2 text-xs ink-secondary">{agent.description}</p>
                  {trace?.usedMockLlm ? (
                    <p className="mb-2 text-[11px] ink-muted">
                      Narration came from the deterministic fallback, not the model.
                    </p>
                  ) : trace?.tokensIn !== undefined ? (
                    <p className="mb-2 text-[11px] ink-muted tnum">
                      {trace.tokensIn} in / {trace.tokensOut} out tokens
                    </p>
                  ) : null}
                  {logCount === 0 ? (
                    <p className="log-line">No log output.</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {trace!.log.map((line, i) => (
                        <li key={i} className="log-line">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                  {trace?.error ? (
                    <p className="mt-2 text-xs" style={{ color: "var(--status-critical)" }}>
                      {trace.error}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
