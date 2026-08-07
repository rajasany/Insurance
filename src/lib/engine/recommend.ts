import { ageOf } from "@/lib/data/customers";
import { productsForLine } from "@/lib/data/products";
import type {
  Applicant,
  Application,
  EnrichedRiskData,
  PolicyProduct,
  PolicyRecommendation,
  RiskAssessment,
  Severity,
} from "@/lib/domain/types";
import { closestDeductible, ratePremium } from "./pricing";

/**
 * Product fitting.
 *
 * Fit is a weighted blend of five components rather than a single heuristic,
 * because "best policy" means different things to a customer (price), an agent
 * (coverage adequacy), and the carrier (appetite). Keeping the components
 * separate lets the UI show *why* a product ranked where it did.
 *
 * `breadth` exists because `needs` alone is a presence check, and presence is
 * not adequacy: a named-peril form with actual-cash-value settlement lists the
 * same "Dwelling" coverage as a guaranteed-replacement-cost form and pays a
 * total loss very differently. Without this term, cheap narrow products win on
 * price for applicants who should be steered to broader coverage.
 */
const WEIGHTS = {
  coverage: 0.3,
  breadth: 0.2,
  tier: 0.2,
  affordability: 0.15,
  needs: 0.15,
} as const;

const TIER_AFFINITY: Record<Severity, Record<PolicyProduct["tier"], number>> = {
  low: { premier: 1.0, standard: 0.8, essential: 0.45 },
  moderate: { premier: 0.7, standard: 1.0, essential: 0.7 },
  elevated: { premier: 0.4, standard: 0.85, essential: 1.0 },
  high: { premier: 0.2, standard: 0.6, essential: 1.0 },
};

/**
 * Coverages the applicant actually needs, inferred from the household and the
 * property/vehicle. Drives both `needsMatch` and the `gaps` list a customer
 * sees on the comparison table.
 */
export function inferNeededCoverages(
  applicant: Applicant,
  application: Application,
  enriched: EnrichedRiskData,
): string[] {
  const needs: string[] = [];
  const age = ageOf(applicant);

  switch (application.line) {
    case "auto": {
      needs.push("bi", "pd");
      const auto = application.auto;
      if (auto && new Date().getUTCFullYear() - auto.vehicleYear <= 8) needs.push("coll", "comp");
      if (applicant.householdSize >= 3) needs.push("rental");
      if (auto && auto.annualMileage > 15000) needs.push("roadside");
      break;
    }
    case "home": {
      needs.push("dwelling", "contents", "liab", "loss_use");
      const home = application.home;
      const zone = enriched.catastrophe?.floodZone;
      if ((zone && zone !== "X") || (home && home.yearBuilt < 1980)) needs.push("water");
      if (home && home.yearBuilt < 1990) needs.push("ordinance");
      if (home && home.dwellingValue > 1_000_000) needs.push("replacement");
      break;
    }
    case "life": {
      needs.push("death");
      const life = application.life;
      if (life && life.termYears >= 20) needs.push("conversion");
      if (age < 60) needs.push("waiver");
      if (applicant.householdSize >= 3) needs.push("child");
      break;
    }
    case "umbrella": {
      needs.push("excess", "defense", "libel");
      if (applicant.annualIncome > 150_000) needs.push("worldwide");
      break;
    }
  }
  return needs;
}

function coverageFit(product: PolicyProduct, requested: number): number {
  const span = product.maxCoverage - product.minCoverage;
  if (span <= 0) return 1;
  const position = (requested - product.minCoverage) / span;
  // Peaks when the requested limit sits comfortably inside the product's band;
  // penalises products the applicant is scraping the floor or ceiling of.
  return Math.max(0, Math.min(1, 1 - Math.abs(position - 0.55) * 1.2));
}

function affordabilityFit(annualPremium: number, income: number): number {
  if (income <= 0) return 0.5;
  const share = annualPremium / income;
  if (share <= 0.02) return 1;
  if (share >= 0.12) return 0;
  return Math.max(0, Math.min(1, 1 - (share - 0.02) / 0.1));
}

export function buildRecommendations(
  applicant: Applicant,
  application: Application,
  risk: RiskAssessment,
  enriched: EnrichedRiskData,
): PolicyRecommendation[] {
  const needed = inferNeededCoverages(applicant, application, enriched);
  const candidates = productsForLine(application.line);

  const scored = candidates.map((product) => {
    const coverageAmount = Math.max(
      product.minCoverage,
      Math.min(product.maxCoverage, application.requestedCoverage),
    );
    const deductible = closestDeductible(product, application.requestedDeductible);
    const premium = ratePremium(
      product,
      coverageAmount,
      deductible,
      applicant,
      application,
      risk,
      enriched,
    );

    const covered = new Set(
      product.coverages.filter((c) => c.limit !== null).map((c) => c.id),
    );
    const gaps = needed.filter((id) => !covered.has(id));
    const needsMatch = needed.length === 0 ? 1 : (needed.length - gaps.length) / needed.length;

    const components = {
      coverage: coverageFit(product, application.requestedCoverage),
      breadth: product.coverageBreadth,
      tier: TIER_AFFINITY[risk.band][product.tier],
      affordability: affordabilityFit(premium.annualTotal, applicant.annualIncome),
      needs: needsMatch,
    };

    const fitScore = Number(
      (
        components.coverage * WEIGHTS.coverage +
        components.breadth * WEIGHTS.breadth +
        components.tier * WEIGHTS.tier +
        components.affordability * WEIGHTS.affordability +
        components.needs * WEIGHTS.needs
      ).toFixed(4),
    );

    // Eligibility is appetite plus limit availability — data questions, kept
    // out of the model's hands so a recommendation can never quietly exceed
    // what the carrier is willing to write.
    const overAppetite = risk.score > product.maxAcceptableRisk;
    const belowMin = application.requestedCoverage < product.minCoverage;
    const aboveMax = application.requestedCoverage > product.maxCoverage;
    const eligible = !overAppetite && !belowMin && !aboveMax;

    let ineligibleReason: string | undefined;
    if (overAppetite) {
      ineligibleReason = `Risk score ${risk.score} exceeds this product's appetite limit of ${product.maxAcceptableRisk}.`;
    } else if (belowMin) {
      ineligibleReason = `Requested $${application.requestedCoverage.toLocaleString()} is below the $${product.minCoverage.toLocaleString()} minimum.`;
    } else if (aboveMax) {
      ineligibleReason = `Requested $${application.requestedCoverage.toLocaleString()} exceeds the $${product.maxCoverage.toLocaleString()} maximum.`;
    }

    const gapLabels = gaps.map(
      (id) => product.coverages.find((c) => c.id === id)?.label ?? id,
    );

    return {
      product,
      recommendation: {
        productId: product.id,
        productName: product.name,
        tier: product.tier,
        coverageAmount,
        deductible,
        premium,
        fitScore,
        rank: 0,
        rationale: buildRationale(product, components, risk),
        tradeoffs: buildTradeoffs(product, components, premium.annualTotal),
        gaps: gapLabels,
        eligible,
        ineligibleReason,
      } satisfies PolicyRecommendation,
    };
  });

  // Eligible products always outrank ineligible ones. Ineligible products stay
  // in the list because a referred case still needs a starting point for manual
  // placement — dropping them would leave the underwriter with nothing.
  scored.sort((a, b) => {
    if (a.recommendation.eligible !== b.recommendation.eligible) {
      return a.recommendation.eligible ? -1 : 1;
    }
    return b.recommendation.fitScore - a.recommendation.fitScore;
  });

  return scored.map((s, i) => ({ ...s.recommendation, rank: i + 1 }));
}

interface FitComponents {
  coverage: number;
  breadth: number;
  tier: number;
  affordability: number;
  needs: number;
}

function buildRationale(
  product: PolicyProduct,
  components: FitComponents,
  risk: RiskAssessment,
): string {
  const parts: string[] = [];
  if (components.coverage > 0.8) {
    parts.push("the requested limit sits mid-band for this product, so it rates efficiently");
  } else if (components.coverage < 0.5) {
    parts.push("the requested limit sits at the edge of this product's band");
  }
  if (components.tier >= 0.85) {
    parts.push(`the ${product.tier} tier matches a ${risk.band} risk profile`);
  } else if (components.tier <= 0.5) {
    parts.push(`the ${product.tier} tier is a weaker match for a ${risk.band} risk profile`);
  }
  if (components.needs === 1) parts.push("it covers every inferred need");
  else if (components.needs < 0.75) parts.push("it leaves material coverage gaps");
  if (components.breadth <= 0.5) {
    parts.push("settlement is on narrow terms, so a total loss may not be made whole");
  } else if (components.breadth >= 0.95) {
    parts.push("settlement terms are the broadest in the line");
  }
  if (components.affordability >= 0.9) parts.push("the premium is comfortable against stated income");
  else if (components.affordability <= 0.4) parts.push("the premium is a large share of stated income");

  return parts.length > 0
    ? `${product.name}: ${parts.join("; ")}.`
    : `${product.name}: no distinguishing fit signals.`;
}

function buildTradeoffs(
  product: PolicyProduct,
  components: FitComponents,
  annualPremium: number,
): string[] {
  const out: string[] = [];
  const excluded = product.coverages.filter((c) => c.limit === null);
  if (excluded.length > 0) {
    out.push(`Excludes ${excluded.map((c) => c.label.toLowerCase()).join(", ")}.`);
  }
  if (product.tier === "premier") {
    out.push(`Highest premium of the line at $${annualPremium.toLocaleString()}/year.`);
  }
  if (product.tier === "essential") {
    out.push("Lowest premium, but settlement is on narrower terms.");
  }
  if (components.affordability <= 0.4) {
    out.push("Premium-to-income ratio is above the affordability guideline.");
  }
  return out;
}
