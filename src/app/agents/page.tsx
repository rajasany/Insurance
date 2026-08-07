import { getLlmProvider } from "@/lib/agents/llm";
import { agentRoster, buildStages } from "@/lib/agents/orchestrator";
import { Chip } from "@/components/Badge";

export const dynamic = "force-dynamic";

export default function AgentsPage() {
  const roster = agentRoster();
  const stages = buildStages();
  const provider = getLlmProvider();
  const byId = new Map(roster.map((a) => [a.id, a]));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Agent coordination</h1>
        <p className="mt-1 max-w-prose text-sm ink-secondary">
          Five agents share one case blackboard. Execution order is derived from each agent&apos;s
          declared dependencies rather than hardcoded, so agents in the same stage run
          concurrently and adding a sixth agent means declaring what it reads.
        </p>
      </header>

      <section className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Active provider</span>
          <Chip tone="accent">{provider.kind === "claude" ? provider.model : "deterministic"}</Chip>
          <span className="text-xs ink-muted">
            {provider.kind === "claude"
              ? "Agents narrate and judge through Claude; every call still falls back to deterministic output on error or refusal."
              : "No API key resolved, so every agent is using its deterministic fallback. Set ANTHROPIC_API_KEY to enable model narration."}
          </span>
        </div>
      </section>

      <div className="space-y-4">
        {stages.map((stage, i) => (
          <section key={i} className="card p-4 sm:p-5">
            <header className="mb-3 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">Stage {i + 1}</h2>
              <span className="text-xs ink-muted">
                {stage.length === 1
                  ? "single agent"
                  : `${stage.length} agents run concurrently`}
              </span>
            </header>
            <div className="grid gap-3 sm:grid-cols-2">
              {stage.map((agent) => {
                const meta = byId.get(agent.id)!;
                return (
                  <div key={agent.id} className="rounded-md border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-medium">{meta.label}</h3>
                      <span className="text-[11px] ink-muted tnum">{meta.id}</span>
                    </div>
                    <p className="mt-1 text-xs ink-secondary">{meta.description}</p>
                    <p className="mt-2 text-[11px] ink-muted">
                      {meta.consumes.length === 0
                        ? "Reads: submission and external data sources"
                        : `Reads: ${meta.consumes.join(", ")}`}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <section className="card p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Where the model is and is not in the loop</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm ink-secondary">
          <li>
            Risk scores, premiums, product eligibility, and rule outcomes come from the
            deterministic engine. The model never produces a number the business relies on, which
            is why the same submission scores identically on every run.
          </li>
          <li>
            The underwriting agent may escalate a decision toward more human review — approve to
            refer, refer to decline — but the reverse is rejected in code, not merely discouraged
            in the prompt. A model that can only ask for more review cannot quietly bind a risk
            the carrier declined.
          </li>
          <li>
            Compliance checks for prohibited rating factors, notice requirements, and provenance
            completeness are deterministic. A model-reported violation can fail the review; it
            cannot make a failing review pass.
          </li>
          <li>
            Every model call has a deterministic fallback. Without a credential, on an error, or
            on a safety refusal, the agent still returns a usable result — the app degrades in
            quality, never in function.
          </li>
        </ul>
      </section>
    </div>
  );
}
