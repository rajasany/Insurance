import { ageOf } from "@/lib/data/customers";
import type {
  Applicant,
  Application,
  DecisionOutcome,
  EnrichedRiskData,
  PolicyRecommendation,
  RiskAssessment,
  RuleEvaluation,
  UnderwritingCondition,
} from "@/lib/domain/types";
import { DECLINE_THRESHOLD } from "./scoring";

/**
 * Underwriting rules.
 *
 * Each rule cites a manual reference so an auditor — or a regulator asking why
 * a consumer was declined — can trace the call to a published guideline rather
 * than to model output. Precedence is strict: any `fail` declines, otherwise
 * any `refer` refers, otherwise approve.
 */

export interface RuleContext {
  applicant: Applicant;
  application: Application;
  risk: RiskAssessment;
  enriched: EnrichedRiskData;
  recommendations: PolicyRecommendation[];
  /** The applicant's other submissions, needed for umbrella dependency checks. */
  siblingApplications: Application[];
}

function pass(ruleId: string, description: string, detail: string, reference: string): RuleEvaluation {
  return { ruleId, description, outcome: "pass", detail, reference };
}

function refer(ruleId: string, description: string, detail: string, reference: string): RuleEvaluation {
  return { ruleId, description, outcome: "refer", detail, reference };
}

function fail(ruleId: string, description: string, detail: string, reference: string): RuleEvaluation {
  return { ruleId, description, outcome: "fail", detail, reference };
}

// ---------------------------------------------------------------------------
// Rule set
// ---------------------------------------------------------------------------

function universalRules(ctx: RuleContext): RuleEvaluation[] {
  const out: RuleEvaluation[] = [];
  const threshold = DECLINE_THRESHOLD[ctx.application.line];

  out.push(
    ctx.risk.score > threshold
      ? fail(
          "R-CAP-01",
          "Risk score within the line's writable range",
          `Score of ${ctx.risk.score} exceeds the ${ctx.application.line} decline threshold of ${threshold}.`,
          "Enterprise Underwriting Standards §2.1",
        )
      : pass(
          "R-CAP-01",
          "Risk score within the line's writable range",
          `Score of ${ctx.risk.score} is inside the ${ctx.application.line} threshold of ${threshold}.`,
          "Enterprise Underwriting Standards §2.1",
        ),
  );

  const eligibleCount = ctx.recommendations.filter((r) => r.eligible).length;
  out.push(
    eligibleCount === 0
      ? refer(
          "R-CAP-02",
          "At least one product available at the requested limit",
          "No product in the catalog is available at the requested limit and risk score; manual placement required.",
          "Enterprise Underwriting Standards §2.4",
        )
      : pass(
          "R-CAP-02",
          "At least one product available at the requested limit",
          `${eligibleCount} product(s) available at the requested limit.`,
          "Enterprise Underwriting Standards §2.4",
        ),
  );

  return out;
}

function autoRules(ctx: RuleContext): RuleEvaluation[] {
  const auto = ctx.application.auto;
  if (!auto) return [];
  const out: RuleEvaluation[] = [];
  const mvr = ctx.enriched.mvr;
  const points = mvr?.violations.reduce((s, v) => s + v.points, 0) ?? 0;
  const majors = mvr?.majorViolations ?? 0;

  out.push(
    auto.primaryUse === "business"
      ? refer(
          "R-AUTO-01",
          "Use is within the personal auto form",
          "Declared primary use is business. Livery and transportation-network use is excluded from the personal auto policy and must be placed on a commercial form or a TNC endorsement.",
          "Personal Auto Manual §4.2",
        )
      : pass(
          "R-AUTO-01",
          "Use is within the personal auto form",
          `Declared primary use is ${auto.primaryUse}.`,
          "Personal Auto Manual §4.2",
        ),
  );

  if (majors >= 2 || points > 14) {
    out.push(
      fail(
        "R-AUTO-02",
        "Driving record within tolerance",
        `${majors} major violation(s) and ${points} violation points exceed the maximum writable record.`,
        "Personal Auto Manual §6.3",
      ),
    );
  } else if (majors >= 1) {
    out.push(
      refer(
        "R-AUTO-02",
        "Driving record within tolerance",
        `${majors} major violation(s) on the MVR. Surcharge tier placement requires underwriter sign-off.`,
        "Personal Auto Manual §6.3",
      ),
    );
  } else {
    out.push(
      pass(
        "R-AUTO-02",
        "Driving record within tolerance",
        `${points} violation points, no major violations.`,
        "Personal Auto Manual §6.3",
      ),
    );
  }

  return out;
}

function homeRules(ctx: RuleContext): RuleEvaluation[] {
  const home = ctx.application.home;
  if (!home) return [];
  const out: RuleEvaluation[] = [];
  const cat = ctx.enriched.catastrophe;

  out.push(
    home.roofAgeYears >= 15
      ? refer(
          "R-HOME-01",
          "Roof age within straight-through limits",
          `Roof is ${home.roofAgeYears} years old. Roofs at or past 15 years require an inspection and may be settled on an actual-cash-value schedule.`,
          "Homeowners Manual §5.1",
        )
      : pass(
          "R-HOME-01",
          "Roof age within straight-through limits",
          `Roof is ${home.roofAgeYears} years old.`,
          "Homeowners Manual §5.1",
        ),
  );

  out.push(
    home.distanceToCoastMiles < 1
      ? refer(
          "R-HOME-02",
          "Outside the named-storm tier-1 wind band",
          `${home.distanceToCoastMiles} miles to open water places the risk in the tier-1 wind band. Wind-mitigation verification required before binding.`,
          "Catastrophe Appetite Guide §3.2",
        )
      : pass(
          "R-HOME-02",
          "Outside the named-storm tier-1 wind band",
          `${home.distanceToCoastMiles} miles to open water.`,
          "Catastrophe Appetite Guide §3.2",
        ),
  );

  const wildfire = cat?.wildfireScore ?? 0;
  out.push(
    wildfire >= 70
      ? refer(
          "R-HOME-03",
          "Wildfire score below the straight-through threshold",
          `Wildfire score of ${wildfire} is at or above the threshold of 70. Defensible-space verification required.`,
          "Catastrophe Appetite Guide §4.1",
        )
      : pass(
          "R-HOME-03",
          "Wildfire score below the straight-through threshold",
          `Wildfire score of ${wildfire}.`,
          "Catastrophe Appetite Guide §4.1",
        ),
  );

  out.push(
    home.yearBuilt < 1940 && !home.hasMonitoredAlarm
      ? refer(
          "R-HOME-04",
          "Pre-1940 dwellings carry protective safeguards",
          `Built ${home.yearBuilt} with no monitored alarm. A four-point inspection covering roof, electrical, plumbing, and HVAC is required.`,
          "Homeowners Manual §5.6",
        )
      : pass(
          "R-HOME-04",
          "Pre-1940 dwellings carry protective safeguards",
          home.yearBuilt < 1940
            ? `Built ${home.yearBuilt}, monitored alarm present.`
            : `Built ${home.yearBuilt}.`,
          "Homeowners Manual §5.6",
        ),
  );

  return out;
}

function lifeRules(ctx: RuleContext): RuleEvaluation[] {
  const life = ctx.application.life;
  if (!life) return [];
  const out: RuleEvaluation[] = [];
  const medical = ctx.enriched.medical;
  const age = ageOf(ctx.applicant);

  out.push(
    life.faceAmount > 1_000_000 && ctx.risk.score > 45
      ? refer(
          "R-LIFE-01",
          "Large-face-amount medical review",
          `$${life.faceAmount.toLocaleString()} face amount at risk score ${ctx.risk.score} exceeds the automated-underwriting envelope. Medical director review required.`,
          "Life Underwriting Manual §8.2",
        )
      : pass(
          "R-LIFE-01",
          "Large-face-amount medical review",
          `$${life.faceAmount.toLocaleString()} face amount at risk score ${ctx.risk.score} is inside the automated envelope.`,
          "Life Underwriting Manual §8.2",
        ),
  );

  const bmi = medical?.bmi;
  out.push(
    bmi !== undefined && bmi >= 32
      ? refer(
          "R-LIFE-02",
          "Build within automated-issue table",
          `BMI of ${bmi} is above the 32 automated-issue limit; table rating must be assigned manually.`,
          "Life Underwriting Manual §4.4",
        )
      : pass(
          "R-LIFE-02",
          "Build within automated-issue table",
          bmi !== undefined ? `BMI of ${bmi}.` : "No build data available.",
          "Life Underwriting Manual §4.4",
        ),
  );

  const copd = medical?.flaggedConditions.some((c) => c.toLowerCase().includes("copd")) ?? false;
  out.push(
    ctx.applicant.tobaccoUse && age >= 65 && copd
      ? fail(
          "R-LIFE-03",
          "Impairment combination within appetite",
          `Age ${age}, current tobacco use, and COPD in combination fall outside life appetite at any rate class.`,
          "Life Underwriting Manual §9.1",
        )
      : pass(
          "R-LIFE-03",
          "Impairment combination within appetite",
          "No disqualifying impairment combination present.",
          "Life Underwriting Manual §9.1",
        ),
  );

  return out;
}

function umbrellaRules(ctx: RuleContext): RuleEvaluation[] {
  if (ctx.application.line !== "umbrella") return [];
  const out: RuleEvaluation[] = [];

  // Umbrella sits above the underlying policies, so a structural problem on an
  // underlying risk has to resolve first. We evaluate the sibling submissions'
  // structural facts directly — the enriched data is already per-applicant, so
  // this needs no extra vendor calls.
  const blockers: string[] = [];
  for (const sibling of ctx.siblingApplications) {
    if (sibling.home) {
      if (sibling.home.distanceToCoastMiles < 1) {
        blockers.push(`${sibling.id}: tier-1 wind band exposure`);
      }
      if (sibling.home.roofAgeYears >= 15) {
        blockers.push(`${sibling.id}: roof age ${sibling.home.roofAgeYears} years`);
      }
      if ((ctx.enriched.catastrophe?.wildfireScore ?? 0) >= 70) {
        blockers.push(`${sibling.id}: wildfire score above threshold`);
      }
    }
    if (sibling.auto && (ctx.enriched.mvr?.majorViolations ?? 0) >= 1) {
      blockers.push(`${sibling.id}: major violation on the underlying MVR`);
    }
  }

  out.push(
    blockers.length > 0
      ? refer(
          "R-UMB-01",
          "Underlying policies bound and clean",
          `Excess liability cannot bind while an underlying risk is unresolved — ${[...new Set(blockers)].join("; ")}.`,
          "Umbrella Manual §2.2",
        )
      : pass(
          "R-UMB-01",
          "Underlying policies bound and clean",
          "No unresolved exposure on the underlying submissions.",
          "Umbrella Manual §2.2",
        ),
  );

  const underlying = ctx.siblingApplications.some((s) => s.line === "auto" || s.line === "home");
  out.push(
    underlying
      ? pass(
          "R-UMB-02",
          "Required underlying coverage present",
          "Applicant has at least one underlying auto or home submission.",
          "Umbrella Manual §2.1",
        )
      : refer(
          "R-UMB-02",
          "Required underlying coverage present",
          "No underlying auto or home policy on file. Umbrella requires qualifying underlying limits.",
          "Umbrella Manual §2.1",
        ),
  );

  return out;
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

function deriveConditions(ctx: RuleContext, rules: RuleEvaluation[]): UnderwritingCondition[] {
  const conditions: UnderwritingCondition[] = [];
  const triggered = new Set(rules.filter((r) => r.outcome !== "pass").map((r) => r.ruleId));

  if (ctx.enriched.credit?.thinFile) {
    conditions.push({
      id: "thin-file-surcharge",
      label: "Thin-file surcharge applies until 12 months of loss history accrues.",
      blocking: false,
    });
  }
  if (triggered.has("R-HOME-01")) {
    conditions.push({ id: "roof-inspection", label: "Roof inspection report required.", blocking: true });
  }
  if (triggered.has("R-HOME-02")) {
    conditions.push({
      id: "wind-mitigation",
      label: "Wind-mitigation inspection (opening protection, roof-deck attachment) required.",
      blocking: true,
    });
  }
  if (triggered.has("R-HOME-03")) {
    conditions.push({
      id: "defensible-space",
      label: "Defensible-space verification within 100 ft required.",
      blocking: true,
    });
  }
  if (triggered.has("R-HOME-04")) {
    conditions.push({ id: "four-point", label: "Four-point inspection required.", blocking: true });
  }
  if (triggered.has("R-AUTO-01")) {
    conditions.push({
      id: "tnc-endorsement",
      label: "Transportation-network endorsement or commercial auto referral required.",
      blocking: true,
    });
  }
  if (triggered.has("R-AUTO-02")) {
    conditions.push({
      id: "surcharge-tier",
      label: "Assign surcharge tier for major violation; re-rate at 36-month violation anniversary.",
      blocking: false,
    });
  }
  if (triggered.has("R-LIFE-01") || triggered.has("R-LIFE-02")) {
    conditions.push({
      id: "medical-director",
      label: "Medical director review and table-rating assignment required.",
      blocking: true,
    });
  }
  if (triggered.has("R-UMB-01") || triggered.has("R-UMB-02")) {
    conditions.push({
      id: "underlying-bind",
      label: "Bind underlying auto and home policies at qualifying limits before issuing excess.",
      blocking: true,
    });
  }
  if (ctx.enriched.catastrophe?.floodZone && ctx.enriched.catastrophe.floodZone !== "X") {
    conditions.push({
      id: "flood-placement",
      label: `Property is in FEMA zone ${ctx.enriched.catastrophe.floodZone}; flood must be placed separately (NFIP or excess).`,
      blocking: false,
    });
  }

  return conditions;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface RulesResult {
  outcome: DecisionOutcome;
  rules: RuleEvaluation[];
  conditions: UnderwritingCondition[];
  referralReasons: string[];
  confidence: number;
}

export function evaluateRules(ctx: RuleContext): RulesResult {
  const rules = [
    ...universalRules(ctx),
    ...autoRules(ctx),
    ...homeRules(ctx),
    ...lifeRules(ctx),
    ...umbrellaRules(ctx),
  ];

  const failures = rules.filter((r) => r.outcome === "fail");
  const referrals = rules.filter((r) => r.outcome === "refer");

  const outcome: DecisionOutcome =
    failures.length > 0 ? "decline" : referrals.length > 0 ? "refer" : "approve";

  const referralReasons = (failures.length > 0 ? failures : referrals).map(
    (r) => `${r.ruleId}: ${r.detail}`,
  );

  return {
    outcome,
    rules,
    conditions: deriveConditions(ctx, rules),
    referralReasons: outcome === "approve" ? [] : referralReasons,
    confidence: scoreConfidence(ctx, outcome, failures.length, referrals.length),
  };
}

/**
 * Confidence reflects how far the case sits from a decision boundary and how
 * complete the data was — not how fluent the model's explanation reads.
 */
function scoreConfidence(
  ctx: RuleContext,
  outcome: DecisionOutcome,
  failureCount: number,
  referralCount: number,
): number {
  let confidence = 0.92;

  // Proximity to the decline threshold makes the call less certain.
  const threshold = DECLINE_THRESHOLD[ctx.application.line];
  const distance = Math.abs(ctx.risk.score - threshold);
  if (distance < 6) confidence -= 0.12;
  else if (distance < 12) confidence -= 0.05;

  if (ctx.risk.dataGaps.length > 0) confidence -= 0.06 * ctx.risk.dataGaps.length;

  const degraded = ctx.enriched.sources.filter((s) => s.status === "degraded").length;
  confidence -= 0.03 * degraded;

  // Multiple independent signals pointing the same way is corroboration.
  if (outcome === "decline" && failureCount > 1) confidence += 0.04;
  if (outcome === "refer" && referralCount > 2) confidence += 0.03;

  return Number(Math.max(0.35, Math.min(0.99, confidence)).toFixed(2));
}
