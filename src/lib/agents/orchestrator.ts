import type {
  AgentId,
  AgentTrace,
  Application,
  OrchestratorEvent,
  UnderwritingCase,
  UnderwritingRunResult,
} from "@/lib/domain/types";
import { getApplicant, getApplication } from "@/lib/data/customers";
import type { Agent, AgentContext } from "./base";
import { complianceAgent } from "./compliance";
import { dataAnalysisAgent } from "./dataAnalysis";
import { getLlmProvider, type LlmProvider } from "./llm";
import { policyRecommendationAgent } from "./policyRecommendation";
import { riskAssessmentAgent } from "./riskAssessment";
import { underwritingAgent } from "./underwriting";

/**
 * Multi-agent coordination.
 *
 * The agents form a dependency DAG rather than a fixed list, and the
 * orchestrator runs each *stage* — the set of agents whose dependencies are all
 * satisfied — concurrently. With the current roster that means risk assessment
 * waits for data analysis, and the recommendation and underwriting agents chain
 * behind it. Adding an agent means declaring its `consumes` and nothing else.
 *
 * Every agent reads and writes one shared `UnderwritingCase` blackboard. The
 * orchestrator is the only writer of record: an agent returns a patch and the
 * orchestrator merges it, so no agent can mutate another's output mid-flight.
 */

export const AGENTS: Agent[] = [
  dataAnalysisAgent,
  riskAssessmentAgent,
  policyRecommendationAgent,
  underwritingAgent,
  complianceAgent,
];

export function agentRoster(): Array<{
  id: AgentId;
  label: string;
  description: string;
  consumes: AgentId[];
}> {
  return AGENTS.map(({ id, label, description, consumes }) => ({
    id,
    label,
    description,
    consumes,
  }));
}

/** Topologically layered execution plan. Each inner array runs concurrently. */
export function buildStages(agents: Agent[] = AGENTS): Agent[][] {
  const remaining = [...agents];
  const done = new Set<AgentId>();
  const stages: Agent[][] = [];

  while (remaining.length > 0) {
    const ready = remaining.filter((a) => a.consumes.every((dep) => done.has(dep)));
    if (ready.length === 0) {
      throw new Error(
        `Cyclic or unsatisfiable agent dependencies: ${remaining.map((a) => a.id).join(", ")}`,
      );
    }
    stages.push(ready);
    for (const agent of ready) {
      done.add(agent.id);
      remaining.splice(remaining.indexOf(agent), 1);
    }
  }
  return stages;
}

export interface RunOptions {
  llm?: LlmProvider;
  /** Called for every coordination event, in order. */
  onEvent?: (event: OrchestratorEvent) => void;
}

export async function runUnderwriting(
  applicationId: string,
  options: RunOptions = {},
): Promise<UnderwritingRunResult> {
  const application = getApplication(applicationId);
  if (!application) throw new Error(`Unknown application: ${applicationId}`);
  const applicant = getApplicant(application.applicantId);
  if (!applicant) throw new Error(`Unknown applicant: ${application.applicantId}`);

  const llm = options.llm ?? getLlmProvider();
  const emit = options.onEvent ?? (() => {});
  const runId = makeRunId(application);
  const startedAt = Date.now();

  let current: UnderwritingCase = {
    runId,
    application,
    applicant,
    llm: { kind: llm.kind, model: llm.model },
  };

  const traces: AgentTrace[] = AGENTS.map((agent) => ({
    agent: agent.id,
    status: "pending",
    log: [],
    consumed: agent.consumes,
  }));
  const traceFor = (id: AgentId) => traces.find((t) => t.agent === id)!;

  emit({ type: "run_started", runId, applicationId, at: startedAt });

  try {
    for (const stage of buildStages()) {
      const results = await Promise.all(
        stage.map(async (agent) => {
          const trace = traceFor(agent.id);
          trace.status = "running";
          trace.startedAt = Date.now();
          emit({
            type: "agent_started",
            agent: agent.id,
            consumed: agent.consumes,
            at: trace.startedAt,
          });

          const ctx: AgentContext = {
            llm,
            log: (message) => {
              trace.log.push(message);
              emit({ type: "agent_log", agent: agent.id, message, at: Date.now() });
            },
          };

          try {
            // Each agent gets a snapshot, not the live object, so concurrent
            // agents in the same stage can't observe each other's partial work.
            const output = await agent.run({ ...current }, ctx);
            const finishedAt = Date.now();
            trace.status = "complete";
            trace.finishedAt = finishedAt;
            trace.durationMs = finishedAt - (trace.startedAt ?? finishedAt);
            trace.usedMockLlm = output.usedMockLlm;
            trace.tokensIn = output.tokensIn;
            trace.tokensOut = output.tokensOut;
            emit({
              type: "agent_finished",
              agent: agent.id,
              durationMs: trace.durationMs,
              at: finishedAt,
              usedMockLlm: output.usedMockLlm,
            });
            return output.patch;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const finishedAt = Date.now();
            trace.status = "failed";
            trace.finishedAt = finishedAt;
            trace.durationMs = finishedAt - (trace.startedAt ?? finishedAt);
            trace.error = message;
            emit({ type: "agent_failed", agent: agent.id, error: message, at: finishedAt });
            throw error;
          }
        }),
      );

      for (const patch of results) {
        current = { ...current, ...patch };
        emit({ type: "case_updated", patch, at: Date.now() });
      }
    }

    const finishedAt = Date.now();
    emit({
      type: "run_finished",
      runId,
      durationMs: finishedAt - startedAt,
      at: finishedAt,
      traces,
    });

    return { runId, case: current, traces, durationMs: finishedAt - startedAt, startedAt, finishedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Downstream agents never ran; mark them so the timeline doesn't imply they
    // silently succeeded.
    for (const trace of traces) {
      if (trace.status === "pending") trace.status = "skipped";
    }
    emit({ type: "run_failed", runId, error: message, at: Date.now() });
    throw error;
  }
}

let runCounter = 0;

function makeRunId(application: Application): string {
  runCounter += 1;
  return `run_${application.id}_${runCounter.toString().padStart(4, "0")}`;
}
