import type { PolicyRecommendation, UnderwritingCase } from "@/lib/domain/types";
import { buildRecommendations } from "@/lib/engine/recommend";
import { SHARED_SYSTEM, type Agent, type AgentContext, type AgentOutput } from "./base";
import type { JsonSchema } from "./llm";

/**
 * Agent 3 — policy recommendation.
 *
 * Ranking, eligibility, and pricing are computed by the engine. This agent
 * rewrites the machine-generated rationale into something an agent can read to
 * a customer, and writes the summary that frames the comparison.
 *
 * It deliberately cannot reorder the ranking. If the model disagrees with the
 * ranking it says so in `rankingConcern`, which surfaces in the UI — that keeps
 * the recommendation traceable to the appetite rules rather than to prose.
 */

const schema: JsonSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "Two to four sentences a licensed agent could read aloud: what is being recommended and why it fits this customer.",
    },
    productNotes: {
      type: "array",
      description: "One entry per product, in any order. Cover every product given.",
      items: {
        type: "object",
        properties: {
          productId: { type: "string" },
          customerRationale: {
            type: "string",
            description: "One or two sentences of plain, non-jargon reasoning for this product.",
          },
          keyTradeoff: {
            type: "string",
            description: "The single most important thing this product gives up, stated plainly.",
          },
        },
        required: ["productId", "customerRationale", "keyTradeoff"],
        additionalProperties: false,
      },
    },
    rankingConcern: {
      type: "string",
      description:
        "If the engine's rank-1 choice looks wrong for this customer, say why in one sentence. Empty string if you agree with it.",
    },
  },
  required: ["summary", "productNotes", "rankingConcern"],
  additionalProperties: false,
};

export const policyRecommendationAgent: Agent = {
  id: "policy-recommendation",
  label: "Policy Recommendation",
  description:
    "Rates every product in the line, ranks by fit against appetite and needs, and writes customer-facing reasoning.",
  consumes: ["data-analysis", "risk-assessment"],

  async run(current: UnderwritingCase, ctx: AgentContext): Promise<AgentOutput> {
    if (!current.risk || !current.enriched) {
      throw new Error("Policy recommendation requires a risk assessment.");
    }

    const recommendations = buildRecommendations(
      current.applicant,
      current.application,
      current.risk,
      current.enriched,
    );

    const eligible = recommendations.filter((r) => r.eligible);
    ctx.log(
      `Rated ${recommendations.length} product(s) in the ${current.application.line} line; ${eligible.length} within appetite.`,
    );

    if (eligible.length === 0) {
      ctx.log(
        "⚠ No product is within appetite at the requested limit — ranking closest options for manual placement.",
      );
    } else {
      const best = eligible[0];
      ctx.log(
        `Best fit: ${best.productName} at $${best.premium.annualTotal.toLocaleString()}/yr (fit ${best.fitScore.toFixed(2)}).`,
      );
    }

    for (const rec of recommendations.filter((r) => !r.eligible)) {
      ctx.log(`✗ ${rec.productName} ineligible — ${rec.ineligibleReason}`);
    }

    const result = await ctx.llm.complete<{
      summary: string;
      productNotes: Array<{ productId: string; customerRationale: string; keyTradeoff: string }>;
      rankingConcern: string;
    }>({
      agent: "policy-recommendation",
      system: SHARED_SYSTEM,
      schema,
      effort: "medium",
      prompt: buildPrompt(current, recommendations),
      fallback: () => ({
        summary: buildFallbackSummary(current, recommendations),
        productNotes: recommendations.map((r) => ({
          productId: r.productId,
          customerRationale: r.rationale,
          keyTradeoff: r.tradeoffs[0] ?? "No material tradeoff at this tier.",
        })),
        rankingConcern: "",
      }),
    });

    if (result.degradedReason) ctx.log(`⚠ ${result.degradedReason}`);

    const notes = new Map(result.value.productNotes.map((n) => [n.productId, n]));
    const enrichedRecs: PolicyRecommendation[] = recommendations.map((rec) => {
      const note = notes.get(rec.productId);
      if (!note) return rec;
      return {
        ...rec,
        rationale: note.customerRationale,
        // Keep the engine's tradeoffs and lead with the model's headline one.
        tradeoffs: [note.keyTradeoff, ...rec.tradeoffs.filter((t) => t !== note.keyTradeoff)],
      };
    });

    if (result.value.rankingConcern.trim().length > 0) {
      ctx.log(`⚠ Ranking concern raised: ${result.value.rankingConcern}`);
    }

    return {
      patch: {
        recommendations: enrichedRecs,
        recommendationSummary: result.value.rankingConcern.trim()
          ? `${result.value.summary}\n\nAgent note: ${result.value.rankingConcern}`
          : result.value.summary,
      },
      usedMockLlm: result.usedMock,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    };
  },
};

function buildPrompt(current: UnderwritingCase, recommendations: PolicyRecommendation[]): string {
  return `Write the customer-facing reasoning for this recommendation set.

## Applicant
${current.analysis?.profileSummary ?? "(not available)"}
Stated income: $${current.applicant.annualIncome.toLocaleString()}. Household of ${current.applicant.householdSize}.

## Risk
Score ${current.risk?.score}/100 (${current.risk?.band}). ${current.risk?.narrative ?? ""}

## Coverage needs inferred earlier
${current.analysis?.inferredNeeds.map((n) => `- ${n}`).join("\n") || "- none"}

## Products, already ranked by the engine (you cannot change the order)
${recommendations
  .map(
    (r) => `### Rank ${r.rank}: ${r.productName} (${r.productId}, ${r.tier} tier)
- Eligible: ${r.eligible}${r.eligible ? "" : ` — ${r.ineligibleReason}`}
- Coverage $${r.coverageAmount.toLocaleString()}, deductible $${r.deductible.toLocaleString()}
- Premium $${r.premium.annualTotal.toLocaleString()}/yr ($${r.premium.monthlyTotal}/mo)
- Fit score ${r.fitScore.toFixed(3)}
- Engine rationale: ${r.rationale}
- Coverage gaps against inferred needs: ${r.gaps.join(", ") || "none"}`,
  )
  .join("\n\n")}

Write \`summary\` as what a licensed agent would actually say to this customer about the top recommendation — reference their situation, not the tier name. Give one \`productNotes\` entry for every product listed, including ineligible ones (for those, be direct that they are not available and why). Put a sentence in \`rankingConcern\` only if you genuinely think rank 1 is the wrong call for this customer; otherwise return an empty string.`;
}

function buildFallbackSummary(
  current: UnderwritingCase,
  recommendations: PolicyRecommendation[],
): string {
  const top = recommendations.find((r) => r.eligible);
  if (!top) {
    return `No product in the ${current.application.line} catalog is available at the requested $${current.application.requestedCoverage.toLocaleString()} limit given a risk score of ${current.risk?.score}. The closest options are listed for manual placement by an underwriter.`;
  }
  const gapNote =
    top.gaps.length > 0
      ? ` It does leave ${top.gaps.join(" and ").toLowerCase()} uncovered relative to the household's inferred needs.`
      : "";
  return `${top.productName} is the best fit at $${top.premium.annualTotal.toLocaleString()} per year ($${top.premium.monthlyTotal} monthly) for $${top.coverageAmount.toLocaleString()} of coverage with a $${top.deductible.toLocaleString()} deductible.${gapNote}`;
}
