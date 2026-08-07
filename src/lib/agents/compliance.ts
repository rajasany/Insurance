import type { ComplianceReview, UnderwritingCase } from "@/lib/domain/types";
import { SHARED_SYSTEM, type Agent, type AgentContext, type AgentOutput } from "./base";
import type { JsonSchema } from "./llm";

/**
 * Agent 5 — compliance review.
 *
 * Runs last, over the finished case. Two responsibilities:
 *
 * - **Deterministic checks** for the things that are actually rules: prohibited
 *   rating factors, adverse-action notice requirements, credit-use disclosure,
 *   and data provenance completeness. These are code, not prompts, because a
 *   compliance control that depends on model sampling is not a control.
 * - **Drafting** the adverse-action notice prose, which is a language task.
 */

/**
 * Factor id fragments that may never appear in a rating decision. Several are
 * prohibited outright and others are restricted by state; a real deployment
 * loads this per jurisdiction. Matching is substring-based on the factor id so
 * a new factor can't sneak past by renaming its label.
 */
const PROHIBITED_FACTOR_FRAGMENTS = [
  "race",
  "ethnicity",
  "religion",
  "national-origin",
  "sex",
  "gender",
  "marital",
  "pregnancy",
  "disability",
  "genetic",
  "zip-only",
];

const schema: JsonSchema = {
  type: "object",
  properties: {
    adverseActionNotice: {
      type: "string",
      description:
        "The consumer-facing adverse-action notice. Must name the principal reasons in plain language, state that a credit-based insurance score was used if it was, and tell the consumer how to obtain their report and dispute inaccuracies. Empty string if no notice is required.",
    },
    additionalFindings: {
      type: "array",
      description:
        "Compliance concerns the deterministic checks did not catch. Empty array if none.",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["info", "warning", "violation"] },
          message: { type: "string" },
          regulation: { type: "string" },
        },
        required: ["severity", "message", "regulation"],
        additionalProperties: false,
      },
    },
  },
  required: ["adverseActionNotice", "additionalFindings"],
  additionalProperties: false,
};

export const complianceAgent: Agent = {
  id: "compliance",
  label: "Compliance Review",
  description:
    "Checks the decision for prohibited rating factors, notice requirements, and provenance completeness, then drafts any required consumer notice.",
  consumes: ["underwriting", "policy-recommendation"],

  async run(current: UnderwritingCase, ctx: AgentContext): Promise<AgentOutput> {
    if (!current.decision || !current.risk || !current.enriched) {
      throw new Error("Compliance review requires a decision, risk assessment, and enriched data.");
    }

    const findings = runDeterministicChecks(current);
    const violations = findings.filter((f) => f.severity === "violation");
    const warnings = findings.filter((f) => f.severity === "warning");

    ctx.log(
      `Ran ${DETERMINISTIC_CHECK_COUNT} checks — ${violations.length} violation(s), ${warnings.length} warning(s).`,
    );
    for (const finding of [...violations, ...warnings]) {
      ctx.log(`${finding.severity === "violation" ? "✗" : "⚠"} ${finding.regulation}: ${finding.message}`);
    }

    const noticeRequired = requiresAdverseActionNotice(current);
    if (noticeRequired) {
      ctx.log("Adverse-action notice required — drafting consumer notice.");
    }

    const result = await ctx.llm.complete<{
      adverseActionNotice: string;
      additionalFindings: Array<{ severity: string; message: string; regulation: string }>;
    }>({
      agent: "compliance",
      system: `${SHARED_SYSTEM}

You are the compliance agent. Deterministic checks have already run; do not repeat their findings. Your drafting must be accurate to the record you are given — never invent a reason that is not in the decision.`,
      schema,
      effort: "high",
      prompt: buildPrompt(current, findings, noticeRequired),
      fallback: () => ({
        adverseActionNotice: noticeRequired ? buildFallbackNotice(current) : "",
        additionalFindings: [],
      }),
    });

    if (result.degradedReason) ctx.log(`⚠ ${result.degradedReason}`);

    const modelFindings = result.value.additionalFindings
      .filter((f): f is { severity: "info" | "warning" | "violation"; message: string; regulation: string } =>
        ["info", "warning", "violation"].includes(f.severity),
      )
      .map((f, i) => ({ id: `agent-finding-${i + 1}`, ...f }));

    const allFindings = [...findings, ...modelFindings];

    const compliance: ComplianceReview = {
      // A model-reported violation cannot flip the review to passing, and it
      // can fail it — the conservative direction.
      passed: allFindings.every((f) => f.severity !== "violation"),
      findings: allFindings,
      adverseActionNotice:
        noticeRequired && result.value.adverseActionNotice.trim().length > 0
          ? result.value.adverseActionNotice
          : noticeRequired
            ? buildFallbackNotice(current)
            : undefined,
    };

    ctx.log(compliance.passed ? "Compliance review passed." : "✗ Compliance review failed — blocking issue.");

    return {
      patch: { compliance },
      usedMockLlm: result.usedMock,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    };
  },
};

// ---------------------------------------------------------------------------
// Deterministic checks
// ---------------------------------------------------------------------------

const DETERMINISTIC_CHECK_COUNT = 6;

function runDeterministicChecks(current: UnderwritingCase): ComplianceReview["findings"] {
  const findings: ComplianceReview["findings"] = [];
  const risk = current.risk!;
  const decision = current.decision!;
  const enriched = current.enriched!;

  // 1. Prohibited rating factors.
  const offending = risk.factors.filter((f) =>
    PROHIBITED_FACTOR_FRAGMENTS.some((fragment) => f.id.toLowerCase().includes(fragment)),
  );
  if (offending.length > 0) {
    findings.push({
      id: "prohibited-factors",
      severity: "violation",
      message: `Rating used prohibited or restricted factor(s): ${offending.map((f) => f.label).join(", ")}.`,
      regulation: "Unfair Trade Practices Act / state rating regulations",
    });
  } else {
    findings.push({
      id: "prohibited-factors",
      severity: "info",
      message: "No prohibited or restricted rating factors were used.",
      regulation: "Unfair Trade Practices Act / state rating regulations",
    });
  }

  // 2. Credit-use disclosure.
  const usedCredit = risk.factors.some((f) => f.id.startsWith("credit-"));
  if (usedCredit) {
    findings.push({
      id: "credit-disclosure",
      severity: "info",
      message:
        "A credit-based insurance score influenced this decision, so the FCRA disclosure and consumer-report notice apply.",
      regulation: "FCRA §606 / §615",
    });
  }

  // 3. Adverse-action notice requirement.
  if (requiresAdverseActionNotice(current)) {
    findings.push({
      id: "adverse-action",
      severity: "warning",
      message: `Outcome "${decision.outcome}" requires an adverse-action notice stating the principal reasons.`,
      regulation: "FCRA §615(a)",
    });
  }

  // 4. Provenance completeness.
  const unavailable = enriched.sources.filter((s) => s.status === "unavailable");
  const degraded = enriched.sources.filter((s) => s.status === "degraded");
  if (degraded.length > 0) {
    findings.push({
      id: "degraded-sources",
      severity: "warning",
      message: `Decision relied on degraded source(s): ${degraded.map((s) => s.name).join(", ")}. Re-verify before binding.`,
      regulation: "Model Risk Management / data governance",
    });
  }
  if (unavailable.length > 0 && risk.dataGaps.length > 0) {
    findings.push({
      id: "unavailable-sources",
      severity: "info",
      message: `${unavailable.length} source(s) returned no data; ${risk.dataGaps.length} rating gap(s) documented.`,
      regulation: "Model Risk Management / data governance",
    });
  }

  // 5. Automated-decision explainability.
  if (decision.reviewedBy === "automated") {
    const explained = risk.factors.length > 0 && risk.factors.every((f) => f.evidence.length > 0);
    findings.push({
      id: "explainability",
      severity: explained ? "info" : "violation",
      message: explained
        ? `Fully automated decision with ${risk.factors.length} documented, evidenced factors.`
        : "Fully automated decision without complete factor-level evidence.",
      regulation: "NAIC Model Bulletin on AI Systems §4",
    });
  }

  // 6. Rule traceability.
  const untraced = decision.rules.filter((r) => !r.reference || r.reference.trim().length === 0);
  findings.push({
    id: "rule-traceability",
    severity: untraced.length > 0 ? "violation" : "info",
    message:
      untraced.length > 0
        ? `${untraced.length} rule(s) applied without a manual reference.`
        : `All ${decision.rules.length} applied rules cite a published manual reference.`,
    regulation: "NAIC Model Bulletin on AI Systems §3",
  });

  return findings;
}

function requiresAdverseActionNotice(current: UnderwritingCase): boolean {
  const decision = current.decision!;
  if (decision.outcome === "decline") return true;
  // A referral is not itself adverse, but a rating-up on a referred case is.
  if (decision.outcome === "refer" && (current.risk?.score ?? 0) > 55) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Prompt and fallback
// ---------------------------------------------------------------------------

function buildPrompt(
  current: UnderwritingCase,
  findings: ComplianceReview["findings"],
  noticeRequired: boolean,
): string {
  const decision = current.decision!;
  return `Review this completed underwriting decision.

## Decision
Outcome: **${decision.outcome.toUpperCase()}** (${decision.reviewedBy}), confidence ${decision.confidence}.
Rationale: ${decision.rationale}

Principal reasons on the record:
${decision.referralReasons.map((r) => `- ${r}`).join("\n") || "- none (approved without exception)"}

## Risk factors that influenced the decision
${current.risk?.factors.map((f) => `- ${f.label} (${f.contribution >= 0 ? "+" : ""}${f.contribution}): ${f.evidence} [${f.source}]`).join("\n")}

## Data sources used
${current.enriched?.sources.map((s) => `- ${s.name} (${s.kind}) — ${s.status}, ${s.latencyMs}ms`).join("\n")}

## Deterministic check results (already recorded — do not repeat)
${findings.map((f) => `- [${f.severity}] ${f.regulation}: ${f.message}`).join("\n")}

${
  noticeRequired
    ? `An adverse-action notice **is** required. Draft it in \`adverseActionNotice\`: address the consumer directly, name the principal reasons drawn from the record above in plain language, state that a credit-based insurance score was used if the factors show one was, and explain the consumer's right to obtain their consumer report free of charge and to dispute inaccuracies. Do not include a reason that is not on the record.`
    : `No adverse-action notice is required for this outcome. Return an empty string for \`adverseActionNotice\`.`
}

Use \`additionalFindings\` only for a compliance concern the deterministic checks genuinely missed. An empty array is the expected answer.`;
}

function buildFallbackNotice(current: UnderwritingCase): string {
  const decision = current.decision!;
  const usedCredit = current.risk?.factors.some((f) => f.id.startsWith("credit-")) ?? false;
  const reasons = decision.referralReasons.length > 0
    ? decision.referralReasons
    : (current.risk?.factors ?? [])
        .filter((f) => f.contribution > 0)
        .slice(0, 4)
        .map((f) => `${f.label}: ${f.evidence}`);

  return [
    `Notice of Adverse Action — application ${current.application.id}`,
    "",
    `Dear ${current.applicant.name},`,
    "",
    decision.outcome === "decline"
      ? "We are unable to offer the coverage you applied for. The principal reasons for this decision are:"
      : "Your application requires additional review and may be offered at a higher premium than our standard rate. The principal reasons are:",
    "",
    ...reasons.map((r) => `  • ${r}`),
    "",
    usedCredit
      ? "A credit-based insurance score obtained from a consumer reporting agency was one of the factors in this decision. You have the right to obtain a free copy of your consumer report from that agency within 60 days of this notice, and to dispute the accuracy or completeness of any information it contains. The consumer reporting agency did not make this decision and cannot explain the reasons for it."
      : "You have the right to request the specific information used in this decision and to dispute any inaccuracy.",
    "",
    "If you believe any information above is incorrect, contact us and we will re-evaluate your application at no cost.",
  ].join("\n");
}
