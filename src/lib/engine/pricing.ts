import type {
  Applicant,
  Application,
  EnrichedRiskData,
  PolicyProduct,
  PremiumBreakdown,
  RiskAssessment,
} from "@/lib/domain/types";

const POLICY_FEE = 42;

/**
 * Rating. `base` comes from the product's per-$1k rate, `riskLoad` applies the
 * loss-cost multiplier derived from the risk score, and discounts are additive
 * credits applied after the load.
 *
 * The breakdown is returned in full rather than as a single number so the
 * comparison UI can show a customer exactly why one quote differs from another.
 */
export function ratePremium(
  product: PolicyProduct,
  coverageAmount: number,
  deductible: number,
  applicant: Applicant,
  application: Application,
  risk: RiskAssessment,
  enriched: EnrichedRiskData,
): PremiumBreakdown {
  const base = (coverageAmount / 1000) * product.baseRatePer1k;
  const riskLoad = base * (risk.lossCostMultiplier - 1);
  const loaded = base + riskLoad;

  // Deductible adjustment, measured against the mid-point of the product's
  // ladder. A deductible above the mid-point earns a credit (negative);
  // below it carries a surcharge (positive). Capped at ±18% of the loaded
  // premium either way.
  const ladder = product.availableDeductibles;
  const median = ladder[Math.floor(ladder.length / 2)] ?? 0;
  const spread = (ladder[ladder.length - 1] ?? 0) - (ladder[0] ?? 0);
  const cap = loaded * 0.18;
  const deductibleCredit =
    spread > 0
      ? Math.max(-cap, Math.min(cap, -cap * ((deductible - median) / spread)))
      : 0;

  const discounts: PremiumBreakdown["discounts"] = [];

  if (applicant.yearsInsured >= 10) {
    discounts.push({ id: "tenure", label: "Continuous-coverage credit", amount: -loaded * 0.07 });
  }
  if (application.line === "auto" && application.auto?.antiTheft) {
    discounts.push({ id: "anti-theft", label: "Anti-theft device", amount: -loaded * 0.03 });
  }
  if (application.line === "auto" && (application.auto?.annualMileage ?? Infinity) < 8000) {
    discounts.push({ id: "low-mileage", label: "Low-mileage credit", amount: -loaded * 0.05 });
  }
  if (application.line === "home" && application.home?.hasMonitoredAlarm) {
    discounts.push({ id: "alarm", label: "Monitored alarm", amount: -loaded * 0.05 });
  }
  if (application.line === "home" && (application.home?.roofAgeYears ?? Infinity) <= 5) {
    discounts.push({ id: "new-roof", label: "New-roof credit", amount: -loaded * 0.06 });
  }
  if (application.line === "life" && !applicant.tobaccoUse) {
    discounts.push({ id: "non-tobacco", label: "Non-tobacco class", amount: -loaded * 0.12 });
  }
  if (enriched.claims.length === 0) {
    discounts.push({ id: "claims-free", label: "Claims-free credit", amount: -loaded * 0.06 });
  }

  const discountTotal = discounts.reduce((sum, d) => sum + d.amount, 0);
  const annualTotal = Math.max(
    120,
    Math.round(loaded + deductibleCredit + discountTotal + POLICY_FEE),
  );

  return {
    base: Math.round(base),
    riskLoad: Math.round(riskLoad),
    deductibleCredit: Math.round(deductibleCredit),
    discounts: discounts.map((d) => ({ ...d, amount: Math.round(d.amount) })),
    fees: POLICY_FEE,
    annualTotal,
    monthlyTotal: Math.round((annualTotal / 12) * 100) / 100,
  };
}

/** Nearest offered deductible to what the applicant asked for. */
export function closestDeductible(product: PolicyProduct, requested: number): number {
  return product.availableDeductibles.reduce(
    (best, d) => (Math.abs(d - requested) < Math.abs(best - requested) ? d : best),
    product.availableDeductibles[0] ?? 0,
  );
}
