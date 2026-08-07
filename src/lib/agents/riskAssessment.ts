import type { UnderwritingCase } from "@/lib/domain/types";
import { assertFactorsSumToScore, assessRisk } from "@/lib/engine/scoring";
import { SHARED_SYSTEM, type Agent, type AgentContext, type AgentOutput } from "./base";
import type { JsonSchema } from "./llm";

/**
 * Agent 2 — risk assessment.
 *
 * The score comes from `assessRisk`. This agent's job is to read the resulting
 * factor set and explain what is actually driving the number, and to say so if
 * the factor set looks incomplete for the exposure in front of it.
 */

const schema: JsonSchema = {
  type: "object",
  properties: {
    narrative: {
      type: "string",
      description:
        "Three to five sentences explaining what drives this risk score. Lead with the largest contributors. Reference the factors by their evidence, not by their numeric weights.",
    },
    unmodeledConcerns: {
      type: "array",
      description:
        "Exposures visible in the submission that the factor set does not appear to price. Empty array if the factors look complete.",
      items: { type: "string" },
    },
  },
  required: ["narrative", "unmodeledConcerns"],
  additionalProperties: false,
};

export const riskAssessmentAgent: Agent = {
  id: "risk-assessment",
  label: "Risk Assessment",
  description:
    "Scores the submission against the rating model and explains which factors drive the result.",
  consumes: ["data-analysis"],

  async run(current: UnderwritingCase, ctx: AgentContext): Promise<AgentOutput> {
    if (!current.enriched) throw new Error("Risk assessment requires enriched data.");

    const risk = assessRisk(current.applicant, current.application, current.enriched);

    if (!assertFactorsSumToScore(risk)) {
      // The waterfall in the explanation dashboard is only trustworthy if this
      // holds, so a violation is worth surfacing rather than swallowing.
      ctx.log("⚠ Factor contributions do not reconcile to the score — waterfall may be misleading.");
    }

    ctx.log(`Scored ${risk.score}/100 (${risk.band}) from ${risk.factors.length} factors.`);
    const top = risk.factors.filter((f) => f.contribution > 0).slice(0, 3);
    if (top.length > 0) {
      ctx.log(`Top drivers: ${top.map((f) => `${f.label} (+${f.contribution})`).join(", ")}.`);
    }
    const credits = risk.factors.filter((f) => f.contribution < 0);
    if (credits.length > 0) {
      ctx.log(
        `Offsetting credits: ${credits.map((f) => `${f.label} (${f.contribution})`).join(", ")}.`,
      );
    }
    for (const gap of risk.dataGaps) ctx.log(`⚠ Data gap: ${gap}`);

    const result = await ctx.llm.complete<{ narrative: string; unmodeledConcerns: string[] }>({
      agent: "risk-assessment",
      system: SHARED_SYSTEM,
      schema,
      effort: "medium",
      prompt: `Explain this risk assessment.

## Applicant profile
${current.analysis?.profileSummary ?? "(not available)"}

## Score
${risk.score}/100 — band "${risk.band}". Baseline is ${risk.baseline}; loss-cost multiplier is ${risk.lossCostMultiplier}.

## Factors (signed contributions; these sum with the baseline to the score)
${risk.factors
  .map((f) => `- ${f.label}: ${f.contribution >= 0 ? "+" : ""}${f.contribution} — ${f.evidence} [${f.source}]`)
  .join("\n")}

## Data gaps
${risk.dataGaps.map((g) => `- ${g}`).join("\n") || "- none"}

## Findings from the data-analysis agent
${current.analysis?.findings.map((f) => `- [${f.severity}] ${f.label}: ${f.detail}`).join("\n") || "- none"}

Write \`narrative\` for an underwriter opening this file: what makes this risk what it is, largest driver first, in prose. Do not list the numeric weights back — the dashboard already shows them; explain what the evidence means. In \`unmodeledConcerns\`, name any exposure you can see in the submission that no factor appears to price; return an empty array if the factor set covers the exposure.`,
      fallback: () => ({
        narrative: buildFallbackNarrative(risk),
        unmodeledConcerns: [],
      }),
    });

    if (result.degradedReason) ctx.log(`⚠ ${result.degradedReason}`);

    const concerns = result.value.unmodeledConcerns;
    if (concerns.length > 0) {
      ctx.log(`Flagged ${concerns.length} unmodeled concern(s) for the underwriting agent.`);
    }

    return {
      patch: {
        risk: {
          ...risk,
          narrative: result.value.narrative,
          dataGaps: [...risk.dataGaps, ...concerns.map((c) => `Unmodeled: ${c}`)],
        },
      },
      usedMockLlm: result.usedMock,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    };
  },
};

function buildFallbackNarrative(risk: {
  score: number;
  band: string;
  factors: Array<{ label: string; contribution: number; evidence: string }>;
}): string {
  const adds = risk.factors.filter((f) => f.contribution > 0).slice(0, 3);
  const credits = risk.factors.filter((f) => f.contribution < 0).slice(0, 2);
  const parts = [
    `This submission scores ${risk.score}/100, placing it in the ${risk.band} band.`,
  ];
  if (adds.length > 0) {
    parts.push(
      `The score is driven primarily by ${adds
        // Labels carry proper nouns and acronyms ("COPD", "BMI"), so they are
        // left as authored rather than lowercased into "copd". The evidence is
        // dropped where it only restates the label — some factor labels already
        // embed the finding, and "COPD (Flagged by the aggregator: COPD)" reads
        // as a bug even though it is accurate.
        .map((f) => {
          const evidence = f.evidence.replace(/\.$/, "");
          return evidence.includes(f.label.replace(/^Condition: /, ""))
            ? f.label
            : `${f.label} (${evidence})`;
        })
        .join("; ")}.`,
    );
  }
  if (credits.length > 0) {
    parts.push(`Partially offsetting that: ${credits.map((f) => f.label).join(" and ")}.`);
  }
  return parts.join(" ");
}
