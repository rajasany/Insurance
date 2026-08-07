"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentId,
  AgentTrace,
  Applicant,
  Application,
  OrchestratorEvent,
  UnderwritingCase,
} from "@/lib/domain/types";
import { AgentTimeline, type TimelineAgent } from "./AgentTimeline";
import { DecisionPanel } from "./DecisionPanel";
import { PolicyComparison } from "./PolicyComparison";
import { RiskWaterfall } from "./RiskWaterfall";

type StreamEvent = OrchestratorEvent | { type: "error"; message: string };

/**
 * Drives one underwriting run and renders its output.
 *
 * Reads the SSE stream and applies events as they arrive rather than waiting
 * for the run to finish, so the timeline shows agents starting and finishing in
 * real time. `tick` re-renders once a second while a run is live purely so the
 * in-progress duration bars keep growing.
 */
export function UnderwritingWorkspace({
  applicant,
  application,
  roster,
}: {
  applicant: Applicant;
  application: Application;
  roster: TimelineAgent[];
}) {
  const [running, setRunning] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runDurationMs, setRunDurationMs] = useState<number | null>(null);
  const [traces, setTraces] = useState<Record<AgentId, AgentTrace | undefined>>({} as never);
  const [caseState, setCaseState] = useState<Partial<UnderwritingCase>>({});
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(Date.now());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const apply = useCallback((event: StreamEvent) => {
    switch (event.type) {
      case "run_started":
        setRunStartedAt(event.at);
        break;
      case "agent_started":
        setTraces((prev) => ({
          ...prev,
          [event.agent]: {
            agent: event.agent,
            status: "running",
            startedAt: event.at,
            log: [],
            consumed: event.consumed,
          },
        }));
        break;
      case "agent_log":
        setTraces((prev) => {
          const trace = prev[event.agent];
          if (!trace) return prev;
          return { ...prev, [event.agent]: { ...trace, log: [...trace.log, event.message] } };
        });
        break;
      case "agent_finished":
        setTraces((prev) => {
          const trace = prev[event.agent];
          if (!trace) return prev;
          return {
            ...prev,
            [event.agent]: {
              ...trace,
              status: "complete",
              finishedAt: event.at,
              durationMs: event.durationMs,
              usedMockLlm: event.usedMockLlm,
            },
          };
        });
        break;
      case "agent_failed":
        setTraces((prev) => {
          const trace = prev[event.agent];
          if (!trace) return prev;
          return { ...prev, [event.agent]: { ...trace, status: "failed", finishedAt: event.at, error: event.error } };
        });
        break;
      case "case_updated":
        setCaseState((prev) => ({ ...prev, ...event.patch }));
        break;
      case "run_finished":
        setRunDurationMs(event.durationMs);
        break;
      case "run_failed":
        setError(event.error);
        break;
      case "error":
        setError(event.message);
        break;
    }
  }, []);

  const start = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunning(true);
    setError(null);
    setTraces({} as never);
    setCaseState({});
    setRunDurationMs(null);
    setRunStartedAt(Date.now());

    try {
      const response = await fetch(
        `/api/underwrite?applicationId=${encodeURIComponent(application.id)}`,
        { signal: controller.signal },
      );
      if (!response.ok || !response.body) {
        throw new Error(`Run failed to start (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line; anything after the last
        // separator is a partial frame and stays in the buffer.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            apply(JSON.parse(line.slice(6)) as StreamEvent);
          } catch {
            // A malformed frame shouldn't kill the run.
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setRunning(false);
    }
  }, [application.id, apply]);

  const hasResult = Boolean(caseState.decision);

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <span className="font-medium">Run the agent pipeline</span>
          <span className="ml-2 ink-muted">
            {runDurationMs !== null
              ? `Completed in ${(runDurationMs / 1000).toFixed(2)}s`
              : running
                ? "Running…"
                : "Five agents, coordinated by dependency order."}
          </span>
          {caseState.llm ? (
            <span className="ml-2 ink-muted">
              · {caseState.llm.kind === "claude" ? caseState.llm.model : "deterministic provider (no API key)"}
            </span>
          ) : null}
        </div>
        <button className="btn btn-primary" onClick={start} disabled={running}>
          {running ? "Running…" : hasResult ? "Re-run" : "Run underwriting"}
        </button>
      </div>

      {error ? (
        <div className="card p-4 text-sm" style={{ borderColor: "var(--status-critical)" }}>
          <span className="font-semibold" style={{ color: "var(--status-critical)" }}>
            Run failed:
          </span>{" "}
          <span className="ink-secondary">{error}</span>
        </div>
      ) : null}

      {runStartedAt ? (
        <AgentTimeline roster={roster} traces={traces} runStartedAt={runStartedAt} now={tick} />
      ) : null}

      {caseState.analysis ? (
        <section className="card p-4 sm:p-5">
          <h3 className="text-sm font-semibold">Applicant profile</h3>
          <p className="mt-2 max-w-prose text-sm leading-relaxed ink-secondary">
            {caseState.analysis.profileSummary}
          </p>

          {caseState.analysis.findings.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {caseState.analysis.findings.map((f) => (
                <li key={f.id} className="flex items-start gap-2.5 text-xs">
                  <span className="badge !text-[10px]">
                    <span
                      className="badge-dot"
                      style={{
                        background:
                          f.severity === "high"
                            ? "var(--status-critical)"
                            : f.severity === "elevated"
                              ? "var(--status-serious)"
                              : f.severity === "moderate"
                                ? "var(--status-warning)"
                                : "var(--status-good)",
                      }}
                      aria-hidden
                    />
                    {f.severity}
                  </span>
                  <span>
                    <span className="font-medium">{f.label}</span>{" "}
                    <span className="ink-secondary">{f.detail}</span>{" "}
                    <span className="ink-muted">[{f.source}]</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {caseState.analysis.inferredNeeds.length > 0 ? (
              <div>
                <p className="text-xs font-semibold">Inferred coverage needs</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs ink-secondary">
                  {caseState.analysis.inferredNeeds.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {caseState.analysis.dataQualityIssues.length > 0 ? (
              <div>
                <p className="text-xs font-semibold">Data-quality issues</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs ink-secondary">
                  {caseState.analysis.dataQualityIssues.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {caseState.decision && caseState.risk ? (
        <DecisionPanel
          decision={caseState.decision}
          risk={caseState.risk}
          compliance={caseState.compliance}
          enriched={caseState.enriched}
        />
      ) : null}

      {caseState.risk ? <RiskWaterfall risk={caseState.risk} /> : null}

      {caseState.recommendations && caseState.recommendations.length > 0 ? (
        <PolicyComparison
          recommendations={caseState.recommendations}
          line={application.line}
          summary={caseState.recommendationSummary}
        />
      ) : null}

      {!runStartedAt ? (
        <section className="card p-6 text-center">
          <p className="text-sm ink-secondary">
            No run yet for {application.id}. Start one to see the agents coordinate, the risk
            breakdown, and the policy comparison for {applicant.name}.
          </p>
        </section>
      ) : null}
    </div>
  );
}
