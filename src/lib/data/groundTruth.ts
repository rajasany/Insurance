import type { DecisionOutcome, Severity } from "@/lib/domain/types";

/**
 * Labeled evaluation set backing the two success metrics.
 *
 * These labels were authored against the product appetite and rating manual
 * *independently of the scoring engine* — that is the whole point. If the
 * engine drifts, accuracy drops and the metrics page shows it rather than
 * quietly re-baselining.
 *
 * `baselineManualMinutes` is the current-state, human-only cycle time for the
 * submission: intake, ordering third-party reports, waiting on them, rating,
 * and writing the decision.
 *
 * `assistedReviewMinutes` is an *estimate* of the residual human time when the
 * system refers a case and the underwriter opens a pre-assembled packet. It is
 * an assumption, not a measurement, and the metrics page labels it as such.
 * Replace it with observed desk timings once the pilot produces them.
 */
export interface GroundTruthLabel {
  applicationId: string;
  expectedOutcome: DecisionOutcome;
  /**
   * Products a senior underwriter would accept as the rank-1 recommendation.
   * Multiple entries because "best fit" has legitimate latitude; the metric
   * counts a hit when rank 1 lands inside this set.
   */
  acceptableTopProducts: string[];
  expectedRiskBand: Severity;
  baselineManualMinutes: number;
  assistedReviewMinutes: number;
  /** Why the label is what it is — shown in the metrics drill-down. */
  labelNote: string;
}

export const groundTruth: GroundTruthLabel[] = [
  {
    applicationId: "SUB-24001",
    expectedOutcome: "approve",
    acceptableTopProducts: ["AUTO-STD", "AUTO-PRM"],
    expectedRiskBand: "low",
    baselineManualMinutes: 42,
    assistedReviewMinutes: 0,
    labelNote:
      "Clean MVR, 16 years continuous coverage, low-mileage garaged late-model vehicle. Straight-through approve.",
  },
  {
    applicationId: "SUB-24002",
    expectedOutcome: "approve",
    acceptableTopProducts: ["HOME-STD", "HOME-PRM"],
    expectedRiskBand: "low",
    baselineManualMinutes: 55,
    assistedReviewMinutes: 0,
    labelNote:
      "2004 construction, 6-year roof, monitored alarm, inland. No appetite concerns at the requested limit.",
  },
  {
    applicationId: "SUB-24003",
    expectedOutcome: "refer",
    acceptableTopProducts: ["AUTO-ESS"],
    expectedRiskBand: "high",
    baselineManualMinutes: 68,
    assistedReviewMinutes: 22,
    labelNote:
      "Declared rideshare use is outside the personal-auto form. Must be referred for a commercial or TNC endorsement decision.",
  },
  {
    applicationId: "SUB-24004",
    expectedOutcome: "refer",
    acceptableTopProducts: ["HOME-STD", "HOME-PRM"],
    expectedRiskBand: "elevated",
    baselineManualMinutes: 95,
    assistedReviewMinutes: 34,
    labelNote:
      "0.4 miles to coast, 19-year roof, prior carrier non-renewal for wind. Requires wind-mitigation inspection before binding. Either home product is defensible as rank 1: Estate carries the right settlement terms for a $1.3M dwelling, but is off-appetite at this score, so Secure with a wind-mitigation condition is what the desk would actually write.",
  },
  {
    applicationId: "SUB-24005",
    expectedOutcome: "refer",
    acceptableTopProducts: ["UMB-STD"],
    expectedRiskBand: "low",
    baselineManualMinutes: 50,
    assistedReviewMinutes: 18,
    labelNote:
      "Umbrella cannot be bound before the underlying homeowners decision resolves. Referred pending SUB-24004.",
  },
  {
    applicationId: "SUB-24006",
    expectedOutcome: "refer",
    acceptableTopProducts: ["LIFE-STD"],
    expectedRiskBand: "moderate",
    baselineManualMinutes: 85,
    assistedReviewMinutes: 30,
    labelNote:
      "BMI 33 with prediabetes and a first-degree family history. Table rating likely; medical director review required at $1.5M.",
  },
  {
    applicationId: "SUB-24007",
    expectedOutcome: "refer",
    acceptableTopProducts: ["HOME-STD"],
    expectedRiskBand: "moderate",
    baselineManualMinutes: 78,
    assistedReviewMinutes: 26,
    labelNote:
      "1926 construction in a named-storm county with no monitored alarm. Refer for four-point inspection.",
  },
  {
    applicationId: "SUB-24008",
    expectedOutcome: "approve",
    acceptableTopProducts: ["LIFE-PRM"],
    expectedRiskBand: "low",
    baselineManualMinutes: 60,
    assistedReviewMinutes: 0,
    labelNote:
      "Age 35, BMI 22, non-tobacco, no conditions or family history. Preferred-plus rate class.",
  },
  {
    applicationId: "SUB-24009",
    expectedOutcome: "decline",
    acceptableTopProducts: [],
    expectedRiskBand: "high",
    baselineManualMinutes: 90,
    assistedReviewMinutes: 12,
    labelNote:
      "Age 70, current smoker with COPD and hypertension, BMI 36. Outside life appetite at any rate class.",
  },
  {
    applicationId: "SUB-24010",
    expectedOutcome: "refer",
    acceptableTopProducts: ["AUTO-ESS", "AUTO-STD"],
    expectedRiskBand: "elevated",
    baselineManualMinutes: 62,
    assistedReviewMinutes: 20,
    labelNote:
      "Recent major violation on the MVR. Premier tier is off-appetite; refer for surcharge tier placement.",
  },
  {
    applicationId: "SUB-24011",
    expectedOutcome: "approve",
    acceptableTopProducts: ["AUTO-ESS", "AUTO-STD"],
    expectedRiskBand: "moderate",
    baselineManualMinutes: 45,
    assistedReviewMinutes: 0,
    labelNote:
      "Thin file and young driver, but clean record, low mileage, and a low-value vehicle. Approve with a thin-file surcharge.",
  },
  {
    applicationId: "SUB-24012",
    expectedOutcome: "refer",
    acceptableTopProducts: ["HOME-PRM"],
    expectedRiskBand: "moderate",
    baselineManualMinutes: 88,
    assistedReviewMinutes: 28,
    labelNote:
      "Wildfire score above the straight-through threshold at a $1.95M dwelling value. Refer for defensible-space verification.",
  },
];

export function labelFor(applicationId: string): GroundTruthLabel | undefined {
  return groundTruth.find((l) => l.applicationId === applicationId);
}

export const BASELINE_TOTAL_MINUTES = groundTruth.reduce(
  (sum, l) => sum + l.baselineManualMinutes,
  0,
);
