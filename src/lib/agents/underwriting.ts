import { listApplications } from "@/lib/data/customers";
import type { DecisionOutcome, UnderwritingCase, UnderwritingDecision } from "@/lib/domain/types";
import { evaluateRules } from "@/lib/engine/rules";
import { SHARED_SYSTEM, type Agent, type AgentContext, type AgentOutput } from "./base";
import type { JsonSchema } from "./llm";

/**
 * Agent 4 — underwriting decision.
 *
 * The rules engine produces the outcome. This agent writes the decision
 * rationale and may **escalate** — approve → refer, or refer → decline — when it
 * sees something the rules do not encode. It can never de-escalate.
 *
 * That asymmetry is the whole safety design: a model that can only ever ask for
 * more human review cannot quietly bind a risk the carrier said no to. It is
 * enforced in code below (`applyEscalation`), not by instruction alone.
 */

const ESCALATION_ORDER: Record<DecisionOutcome, number> = {
  approve: 0,
  refer: 1,
  decline: 2,
};

const schema: JsonSchema = {
  type: "object",
  properties: {
    rationale: {
      type: "string",
      description:
        "Three to six sentences an underwriter would put in the file: what the decision is, what drove it, and what happens next.",
    },
    escalate: {
      type: "boolean",
      description:
        "True only if you believe this case needs a stricter outcome than the rules produced. You cannot request a more permissive outcome.",
    },
    escalateTo: {
      type: "string",
      enum: ["refer", "decline"],
      description: "Ignored unless `escalate` is true.",
    },
    escalationReason: {
      type: "string",
      description:
        "Why the rules are insufficient here. Must cite specific evidence. Empty string when not escalating.",
    },
    additionalConditions: {
      type: "array",
      description:
        "Conditions the rules did not generate but that this risk warrants. Empty array if none.",
      items: { type: "string" },
    },
  },
  required: ["rationale", "escalate", "escalateTo", "escalationReason", "additionalConditions"],
  additionalProperties: false,
};

export const underwritingAgent: Agent = {
  id: "underwriting",
  label: "Underwriting Decision",
  description:
    "Applies the rules engine, then writes the decision rationale. May escalate for more human review but never relax an outcome.",
  consumes: ["risk-assessment", "policy-recommendation"],

  async run(current: UnderwritingCase, ctx: AgentContext): Promise<AgentOutput> {
    if (!current.risk || !current.enriched || !current.recommendations) {
      throw new Error("Underwriting requires risk, enriched data, and recommendations.");
    }

    const siblingApplications = listApplications().filter(
      (a) => a.applicantId === current.applicant.id && a.id !== current.application.id,
    );

    const rulesResult = evaluateRules({
      applicant: current.applicant,
      application: current.application,
      risk: current.risk,
      enriched: current.enriched,
      recommendations: current.recommendations,
      siblingApplications,
    });

    const triggered = rulesResult.rules.filter((r) => r.outcome !== "pass");
    ctx.log(
      `Evaluated ${rulesResult.rules.length} rules — ${triggered.length} triggered. Engine outcome: ${rulesResult.outcome.toUpperCase()}.`,
    );
    for (const rule of triggered) {
      ctx.log(`${rule.outcome === "fail" ? "✗" : "→"} ${rule.ruleId} ${rule.description}: ${rule.detail}`);
    }

    const result = await ctx.llm.complete<{
      rationale: string;
      escalate: boolean;
      escalateTo: string;
      escalationReason: string;
      additionalConditions: string[];
    }>({
      agent: "underwriting",
      system: `${SHARED_SYSTEM}

You are the underwriting decision agent. The rules engine has already produced an outcome. You may escalate to a stricter outcome (approve to refer, refer to decline) when you see risk the rules do not encode. You may never request a more permissive outcome — that path does not exist, and requesting it has no effect.`,
      schema,
      // Judgment work, so a higher effort level than the narration agents.
      effort: "high",
      prompt: buildPrompt(current, rulesResult),
      fallback: () => ({
        rationale: buildFallbackRationale(current, rulesResult.outcome, rulesResult.referralReasons),
        escalate: false,
        escalateTo: "refer",
        escalationReason: "",
        additionalConditions: [],
      }),
    });

    if (result.degradedReason) ctx.log(`⚠ ${result.degradedReason}`);

    const { outcome, escalated } = applyEscalation(
      rulesResult.outcome,
      result.value.escalate,
      result.value.escalateTo,
    );

    if (escalated) {
      ctx.log(
        `↑ Agent escalated ${rulesResult.outcome.toUpperCase()} → ${outcome.toUpperCase()}: ${result.value.escalationReason}`,
      );
    } else if (result.value.escalate) {
      ctx.log(
        `Escalation request ignored — "${result.value.escalateTo}" is not stricter than "${rulesResult.outcome}".`,
      );
    }

    const conditions = [
      ...rulesResult.conditions,
      ...result.value.additionalConditions.map((label, i) => ({
        id: `agent-condition-${i + 1}`,
        label,
        blocking: false,
      })),
    ];

    const referralReasons = escalated
      ? [...rulesResult.referralReasons, `Agent escalation: ${result.value.escalationReason}`]
      : rulesResult.referralReasons;

    const decision: UnderwritingDecision = {
      outcome,
      // An escalation means the rules and the agent disagreed, so the case is
      // genuinely less certain than the rules alone suggested.
      confidence: escalated
        ? Number(Math.max(0.35, rulesResult.confidence - 0.15).toFixed(2))
        : rulesResult.confidence,
      rationale: result.value.rationale,
      conditions,
      rules: rulesResult.rules,
      referralReasons,
      reviewedBy: outcome === "approve" ? "automated" : "referred_to_underwriter",
    };

    ctx.log(
      `Decision: ${outcome.toUpperCase()} at ${(decision.confidence * 100).toFixed(0)}% confidence, ${conditions.length} condition(s).`,
    );

    return {
      patch: { decision },
      usedMockLlm: result.usedMock,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    };
  },
};

/**
 * Enforces the escalate-only invariant. Exported so the test suite can assert
 * it directly rather than inferring it from agent behaviour.
 */
export function applyEscalation(
  engineOutcome: DecisionOutcome,
  requested: boolean,
  requestedOutcome: string,
): { outcome: DecisionOutcome; escalated: boolean } {
  if (!requested) return { outcome: engineOutcome, escalated: false };
  if (requestedOutcome !== "refer" && requestedOutcome !== "decline") {
    return { outcome: engineOutcome, escalated: false };
  }
  const target: DecisionOutcome = requestedOutcome;
  if (ESCALATION_ORDER[target] <= ESCALATION_ORDER[engineOutcome]) {
    return { outcome: engineOutcome, escalated: false };
  }
  return { outcome: target, escalated: true };
}

function buildPrompt(
  current: UnderwritingCase,
  rulesResult: ReturnType<typeof evaluateRules>,
): string {
  const top = current.recommendations?.[0];
  return `Write the underwriting decision for this submission.

## Applicant and submission
${current.analysis?.profileSummary ?? "(not available)"}

## Risk assessment
Score ${current.risk?.score}/100 (${current.risk?.band}).
${current.risk?.narrative ?? ""}

Data gaps and unmodeled concerns:
${current.risk?.dataGaps.map((g) => `- ${g}`).join("\n") || "- none"}

## Findings
${current.analysis?.findings.map((f) => `- [${f.severity}] ${f.label}: ${f.detail}`).join("\n") || "- none"}

## Rule evaluation
Engine outcome: **${rulesResult.outcome.toUpperCase()}** at ${rulesResult.confidence} confidence.

${rulesResult.rules
  .map((r) => `- [${r.outcome.toUpperCase()}] ${r.ruleId} ${r.description} — ${r.detail} (${r.reference})`)
  .join("\n")}

## Conditions the rules generated
${rulesResult.conditions.map((c) => `- ${c.blocking ? "[blocking] " : ""}${c.label}`).join("\n") || "- none"}

## Recommended product
${top ? `${top.productName} — $${top.premium.annualTotal.toLocaleString()}/yr, eligible: ${top.eligible}` : "(none)"}

Write \`rationale\` as the note that goes in the file: state the outcome, the one or two things that actually drove it, and what has to happen next. Do not re-list every rule — the file already contains them.

Set \`escalate\` to true only if there is risk here the rules genuinely do not price, and name the evidence in \`escalationReason\`. If the rules already caught everything you would have caught, leave it false — that is the normal case and not a failure on your part.`;
}

function buildFallbackRationale(
  current: UnderwritingCase,
  outcome: DecisionOutcome,
  referralReasons: string[],
): string {
  const score = current.risk?.score ?? 0;
  const band = current.risk?.band ?? "unknown";
  const line = current.application.line;
  // Rule details already end in a period; splicing one in mid-sentence would
  // produce "…threshold of 90.. An adverse-action notice…".
  const lead = stripTrailingPeriod(referralReasons[0] ?? "");

  if (outcome === "approve") {
    const top = current.recommendations?.find((r) => r.eligible);
    return `Approved for straight-through issue. The ${line} submission scores ${score}/100 (${band} band) with no rule exceptions, and ${top ? `${top.productName} is available at $${top.premium.annualTotal.toLocaleString()} per year` : "a product is available at the requested limit"}. No underwriter review is required.`;
  }
  if (outcome === "decline") {
    return `Declined. The ${line} submission scores ${score}/100 (${band} band) and trips a hard appetite limit — ${lead || "outside written appetite"}. An adverse-action notice is required.`;
  }
  return `Referred to an underwriter. The ${line} submission scores ${score}/100 (${band} band) and trips ${referralReasons.length} rule exception(s), beginning with ${lead || "an unspecified exception"}. The packet is assembled and ready for review.`;
}

function stripTrailingPeriod(text: string): string {
  return text.replace(/\.+$/, "");
}
