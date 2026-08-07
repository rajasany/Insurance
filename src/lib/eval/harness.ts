import { runUnderwriting } from "@/lib/agents/orchestrator";
import { MockLlmProvider, type LlmProvider } from "@/lib/agents/llm";
import { groundTruth, type GroundTruthLabel } from "@/lib/data/groundTruth";
import { assertFactorsSumToScore } from "@/lib/engine/scoring";
import type { DecisionOutcome, Severity } from "@/lib/domain/types";

/**
 * Evaluation harness for the two stated success metrics.
 *
 * Two things worth being explicit about, because they determine whether the
 * numbers mean anything:
 *
 * 1. **It defaults to the deterministic provider.** The metrics measure the
 *    engine and the coordination, not model sampling variance. Pass a Claude
 *    provider to measure the full stack including narration.
 *
 * 2. **The headline accuracy metric is joint and strict.** A case counts as
 *    accurate only when the decision *and* the rank-1 product both match the
 *    label. Component accuracies are reported separately so a regression is
 *    attributable rather than just visible.
 */

export interface CaseResult {
  applicationId: string;
  applicantName: string;
  line: string;

  expectedOutcome: DecisionOutcome;
  actualOutcome: DecisionOutcome;
  outcomeMatch: boolean;

  acceptableTopProducts: string[];
  actualTopProduct: string | null;
  actualTopEligible: boolean;
  productMatch: boolean;

  expectedRiskBand: Severity;
  actualRiskBand: Severity;
  bandMatch: boolean;

  /** Joint metric: both decision and product correct. */
  accurate: boolean;

  riskScore: number;
  confidence: number;
  waterfallReconciles: boolean;
  compliancePassed: boolean;

  baselineMinutes: number;
  /** Agent-run wall clock, converted to minutes. */
  automatedMinutes: number;
  /** Residual human review time given the outcome the system produced. */
  residualHumanMinutes: number;
  assistedTotalMinutes: number;

  labelNote: string;
  notes: string[];
}

export interface EvalReport {
  provider: { kind: string; model: string };
  generatedAt: string;
  cases: CaseResult[];

  /** Headline: joint decision + product accuracy. */
  recommendationAccuracy: number;
  decisionAccuracy: number;
  productAccuracy: number;
  riskBandAccuracy: number;

  baselineTotalMinutes: number;
  assistedTotalMinutes: number;
  /** Fraction, 0–1. */
  underwritingTimeReduction: number;

  straightThroughRate: number;
  waterfallIntegrity: number;
  compliancePassRate: number;

  targets: { recommendationAccuracy: number; underwritingTimeReduction: number };
  meetsAccuracyTarget: boolean;
  meetsTimeTarget: boolean;

  /** Assumptions a reader needs in order to trust the numbers. */
  caveats: string[];
}

const TARGET_ACCURACY = 0.9;
const TARGET_TIME_REDUCTION = 0.4;

export async function runEvaluation(llm: LlmProvider = new MockLlmProvider()): Promise<EvalReport> {
  const cases: CaseResult[] = [];

  for (const label of groundTruth) {
    cases.push(await evaluateCase(label, llm));
  }

  const total = cases.length;
  const pct = (n: number) => (total === 0 ? 0 : Number((n / total).toFixed(4)));

  const baselineTotalMinutes = cases.reduce((s, c) => s + c.baselineMinutes, 0);
  const assistedTotalMinutes = Number(
    cases.reduce((s, c) => s + c.assistedTotalMinutes, 0).toFixed(2),
  );

  return {
    provider: { kind: llm.kind, model: llm.model },
    generatedAt: new Date().toISOString(),
    cases,

    recommendationAccuracy: pct(cases.filter((c) => c.accurate).length),
    decisionAccuracy: pct(cases.filter((c) => c.outcomeMatch).length),
    productAccuracy: pct(cases.filter((c) => c.productMatch).length),
    riskBandAccuracy: pct(cases.filter((c) => c.bandMatch).length),

    baselineTotalMinutes,
    assistedTotalMinutes,
    underwritingTimeReduction:
      baselineTotalMinutes === 0
        ? 0
        : Number(((baselineTotalMinutes - assistedTotalMinutes) / baselineTotalMinutes).toFixed(4)),

    straightThroughRate: pct(cases.filter((c) => c.actualOutcome === "approve").length),
    waterfallIntegrity: pct(cases.filter((c) => c.waterfallReconciles).length),
    compliancePassRate: pct(cases.filter((c) => c.compliancePassed).length),

    targets: {
      recommendationAccuracy: TARGET_ACCURACY,
      underwritingTimeReduction: TARGET_TIME_REDUCTION,
    },
    meetsAccuracyTarget:
      pct(cases.filter((c) => c.accurate).length) >= TARGET_ACCURACY,
    meetsTimeTarget:
      (baselineTotalMinutes === 0
        ? 0
        : (baselineTotalMinutes - assistedTotalMinutes) / baselineTotalMinutes) >=
      TARGET_TIME_REDUCTION,

    caveats: [
      `Labels cover ${total} submissions across four lines. This is a design-validation set, not a production sample — treat the accuracy figure as a regression gate, not as a field measurement.`,
      "`baselineManualMinutes` is a desk estimate of current-state human cycle time, not an observed timing study.",
      "`assistedReviewMinutes` (residual human time on a referred case) is an assumption. It is the single biggest lever on the time-reduction number, so replace it with observed desk timings before quoting the figure externally.",
      "Simulated vendor latency is tens of milliseconds. Real third-party report turnaround is the dominant term in the baseline and is modeled in `baselineManualMinutes`, not in the measured run time.",
      "Time reduction is only meaningful if accuracy holds: approving a case that should have been referred saves time by being wrong.",
      llm.kind === "mock"
        ? "Run with the deterministic provider — measures the rating and rules engine plus coordination, excluding model narration."
        : `Run against ${llm.model}. Model narration is included, so results carry sampling variance run to run.`,
    ],
  };
}

async function evaluateCase(label: GroundTruthLabel, llm: LlmProvider): Promise<CaseResult> {
  const notes: string[] = [];
  const result = await runUnderwriting(label.applicationId, { llm });
  const c = result.case;

  const decision = c.decision!;
  const risk = c.risk!;
  const recommendations = c.recommendations ?? [];
  const top = recommendations[0] ?? null;
  const eligible = recommendations.filter((r) => r.eligible);

  const outcomeMatch = decision.outcome === label.expectedOutcome;
  if (!outcomeMatch) {
    notes.push(
      `Decision mismatch: expected ${label.expectedOutcome}, got ${decision.outcome}.` +
        (label.expectedOutcome === "refer" && decision.outcome === "approve"
          ? " This is the permissive direction and is the more serious failure mode."
          : ""),
    );
  }

  // When the label expects no offer at all, the correct behaviour is to present
  // nothing as eligible — not to present nothing at all.
  const productMatch =
    label.acceptableTopProducts.length === 0
      ? eligible.length === 0
      : top !== null && label.acceptableTopProducts.includes(top.productId);

  if (!productMatch) {
    notes.push(
      label.acceptableTopProducts.length === 0
        ? `Expected no eligible product; ${eligible.length} were offered (${eligible.map((r) => r.productId).join(", ")}).`
        : `Top product ${top?.productId ?? "none"} not in acceptable set [${label.acceptableTopProducts.join(", ")}].`,
    );
  }

  const bandMatch = risk.band === label.expectedRiskBand;
  if (!bandMatch) {
    notes.push(`Risk band ${risk.band} (score ${risk.score}) vs expected ${label.expectedRiskBand}.`);
  }

  const waterfallReconciles = assertFactorsSumToScore(risk);
  if (!waterfallReconciles) {
    notes.push("Factor contributions do not reconcile to the score — waterfall is unreliable.");
  }

  const compliancePassed = c.compliance?.passed ?? false;
  if (!compliancePassed) {
    notes.push(
      `Compliance failed: ${c.compliance?.findings.filter((f) => f.severity === "violation").map((f) => f.message).join("; ")}`,
    );
  }

  const automatedMinutes = Number((result.durationMs / 60000).toFixed(4));
  // Residual human time follows the outcome the system actually produced.
  const residualHumanMinutes =
    decision.outcome === "approve" ? 0 : label.assistedReviewMinutes;

  return {
    applicationId: label.applicationId,
    applicantName: c.applicant.name,
    line: c.application.line,

    expectedOutcome: label.expectedOutcome,
    actualOutcome: decision.outcome,
    outcomeMatch,

    acceptableTopProducts: label.acceptableTopProducts,
    actualTopProduct: top?.productId ?? null,
    actualTopEligible: top?.eligible ?? false,
    productMatch,

    expectedRiskBand: label.expectedRiskBand,
    actualRiskBand: risk.band,
    bandMatch,

    accurate: outcomeMatch && productMatch,

    riskScore: risk.score,
    confidence: decision.confidence,
    waterfallReconciles,
    compliancePassed,

    baselineMinutes: label.baselineManualMinutes,
    automatedMinutes,
    residualHumanMinutes,
    assistedTotalMinutes: Number((automatedMinutes + residualHumanMinutes).toFixed(4)),

    labelNote: label.labelNote,
    notes,
  };
}
