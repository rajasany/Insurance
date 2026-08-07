import type { LineOfBusiness, PolicyProduct } from "@/lib/domain/types";

/**
 * Product catalog with rating parameters and appetite limits.
 *
 * `maxAcceptableRisk` encodes appetite: a product simply isn't offered above
 * that risk score. That keeps eligibility a data question rather than
 * something the model has to reason about, so recommendations stay auditable.
 */

const products: PolicyProduct[] = [
  // ----------------------------- auto -----------------------------
  {
    id: "AUTO-ESS",
    name: "RoadStart Essential",
    line: "auto",
    tier: "essential",
    baseRatePer1k: 3.1,
    minCoverage: 25000,
    maxCoverage: 300000,
    availableDeductibles: [500, 1000, 2500],
    maxAcceptableRisk: 82,
    coverageBreadth: 0.45,
    summary: "State-minimum-plus liability with collision. Built for price-sensitive drivers.",
    coverages: [
      { id: "bi", label: "Bodily injury liability", limit: 100000, description: "Per-person limit for injuries you cause." },
      { id: "pd", label: "Property damage liability", limit: 50000, description: "Damage you cause to others' property." },
      { id: "coll", label: "Collision", limit: null, description: "Not included at this tier." },
      { id: "comp", label: "Comprehensive", limit: null, description: "Not included at this tier." },
      { id: "um", label: "Uninsured motorist", limit: 50000, description: "Covers you when the other driver has no insurance." },
      { id: "rental", label: "Rental reimbursement", limit: null, description: "Not included at this tier." },
      { id: "roadside", label: "Roadside assistance", limit: null, description: "Not included at this tier." },
    ],
  },
  {
    id: "AUTO-STD",
    name: "RoadStart Complete",
    line: "auto",
    tier: "standard",
    baseRatePer1k: 4.4,
    minCoverage: 50000,
    maxCoverage: 500000,
    availableDeductibles: [250, 500, 1000, 2500],
    maxAcceptableRisk: 68,
    coverageBreadth: 0.85,
    summary: "Full first-party and third-party protection. The default recommendation for most drivers.",
    coverages: [
      { id: "bi", label: "Bodily injury liability", limit: 250000, description: "Per-person limit for injuries you cause." },
      { id: "pd", label: "Property damage liability", limit: 100000, description: "Damage you cause to others' property." },
      { id: "coll", label: "Collision", limit: 50000, description: "Repairs to your vehicle after an at-fault accident." },
      { id: "comp", label: "Comprehensive", limit: 50000, description: "Theft, hail, vandalism, animal strikes." },
      { id: "um", label: "Uninsured motorist", limit: 250000, description: "Covers you when the other driver has no insurance." },
      { id: "rental", label: "Rental reimbursement", limit: 1500, description: "Rental car while yours is in the shop." },
      { id: "roadside", label: "Roadside assistance", limit: 500, description: "Towing and jump-starts." },
    ],
  },
  {
    id: "AUTO-PRM",
    name: "RoadStart Signature",
    line: "auto",
    tier: "premier",
    baseRatePer1k: 6.2,
    minCoverage: 100000,
    maxCoverage: 1000000,
    availableDeductibles: [0, 250, 500, 1000],
    maxAcceptableRisk: 52,
    coverageBreadth: 1.0,
    summary: "OEM parts guarantee, diminishing deductible, and agreed-value settlement.",
    coverages: [
      { id: "bi", label: "Bodily injury liability", limit: 500000, description: "Per-person limit for injuries you cause." },
      { id: "pd", label: "Property damage liability", limit: 250000, description: "Damage you cause to others' property." },
      { id: "coll", label: "Collision", limit: 150000, description: "Agreed-value settlement with OEM parts." },
      { id: "comp", label: "Comprehensive", limit: 150000, description: "Theft, hail, vandalism, animal strikes." },
      { id: "um", label: "Uninsured motorist", limit: 500000, description: "Covers you when the other driver has no insurance." },
      { id: "rental", label: "Rental reimbursement", limit: 5000, description: "Comparable-class rental, no daily cap." },
      { id: "roadside", label: "Roadside assistance", limit: 1500, description: "Concierge towing, trip interruption." },
    ],
  },

  // ----------------------------- home -----------------------------
  {
    id: "HOME-ESS",
    name: "Homestead Core",
    line: "home",
    tier: "essential",
    baseRatePer1k: 2.7,
    minCoverage: 100000,
    maxCoverage: 750000,
    availableDeductibles: [1000, 2500, 5000],
    maxAcceptableRisk: 84,
    coverageBreadth: 0.4,
    summary: "Named-peril dwelling coverage. Lowest premium, narrowest protection.",
    coverages: [
      { id: "dwelling", label: "Dwelling", limit: 750000, description: "Named perils only — fire, lightning, explosion, theft." },
      { id: "contents", label: "Personal property", limit: 200000, description: "Actual cash value settlement." },
      { id: "liab", label: "Personal liability", limit: 100000, description: "Injuries to others on your property." },
      { id: "loss_use", label: "Loss of use", limit: 50000, description: "Hotel and meals while your home is uninhabitable." },
      { id: "water", label: "Water backup", limit: null, description: "Not included at this tier." },
      { id: "ordinance", label: "Ordinance or law", limit: null, description: "Not included at this tier." },
      { id: "replacement", label: "Extended replacement cost", limit: null, description: "Not included at this tier." },
    ],
  },
  {
    id: "HOME-STD",
    name: "Homestead Secure",
    line: "home",
    tier: "standard",
    baseRatePer1k: 3.9,
    minCoverage: 150000,
    maxCoverage: 1500000,
    availableDeductibles: [1000, 2500, 5000, 10000],
    maxAcceptableRisk: 70,
    coverageBreadth: 0.85,
    summary: "Open-peril dwelling with replacement-cost contents. Fits most owner-occupied homes.",
    coverages: [
      { id: "dwelling", label: "Dwelling", limit: 1500000, description: "Open perils — everything not specifically excluded." },
      { id: "contents", label: "Personal property", limit: 750000, description: "Replacement-cost settlement." },
      { id: "liab", label: "Personal liability", limit: 500000, description: "Injuries to others on your property." },
      { id: "loss_use", label: "Loss of use", limit: 300000, description: "Hotel and meals while your home is uninhabitable." },
      { id: "water", label: "Water backup", limit: 25000, description: "Sump-pump and sewer backup." },
      { id: "ordinance", label: "Ordinance or law", limit: 100000, description: "Code upgrades required during a rebuild." },
      { id: "replacement", label: "Extended replacement cost", limit: null, description: "Not included at this tier." },
    ],
  },
  {
    id: "HOME-PRM",
    name: "Homestead Estate",
    line: "home",
    tier: "premier",
    baseRatePer1k: 5.4,
    minCoverage: 500000,
    maxCoverage: 5000000,
    availableDeductibles: [2500, 5000, 10000, 25000],
    maxAcceptableRisk: 58,
    coverageBreadth: 1.0,
    summary: "Guaranteed replacement cost, cash-settlement option, and scheduled-item coverage.",
    coverages: [
      { id: "dwelling", label: "Dwelling", limit: 5000000, description: "Guaranteed replacement cost, no percentage cap." },
      { id: "contents", label: "Personal property", limit: 2500000, description: "Replacement cost with scheduled-item riders." },
      { id: "liab", label: "Personal liability", limit: 1000000, description: "Injuries to others on your property." },
      { id: "loss_use", label: "Loss of use", limit: 1000000, description: "Comparable-home rental for up to 24 months." },
      { id: "water", label: "Water backup", limit: 100000, description: "Sump-pump, sewer backup, and service-line failure." },
      { id: "ordinance", label: "Ordinance or law", limit: 500000, description: "Code upgrades required during a rebuild." },
      { id: "replacement", label: "Extended replacement cost", limit: 5000000, description: "Guaranteed, uncapped rebuild." },
    ],
  },

  // ----------------------------- life -----------------------------
  {
    id: "LIFE-ESS",
    name: "Horizon Term Basic",
    line: "life",
    tier: "essential",
    baseRatePer1k: 0.94,
    minCoverage: 50000,
    maxCoverage: 500000,
    availableDeductibles: [0],
    maxAcceptableRisk: 88,
    coverageBreadth: 0.5,
    summary: "Simplified-issue term. No labs, faster decision, higher rate per $1k.",
    coverages: [
      { id: "death", label: "Death benefit", limit: 500000, description: "Level term death benefit." },
      { id: "conversion", label: "Conversion privilege", limit: null, description: "Not included at this tier." },
      { id: "waiver", label: "Waiver of premium", limit: null, description: "Not included at this tier." },
      { id: "accel", label: "Accelerated death benefit", limit: 100000, description: "Early payout on terminal diagnosis." },
      { id: "child", label: "Child rider", limit: null, description: "Not included at this tier." },
    ],
  },
  {
    id: "LIFE-STD",
    name: "Horizon Term Select",
    line: "life",
    tier: "standard",
    baseRatePer1k: 0.62,
    minCoverage: 100000,
    maxCoverage: 2000000,
    availableDeductibles: [0],
    maxAcceptableRisk: 66,
    coverageBreadth: 0.9,
    summary: "Fully underwritten term with conversion rights. Best rate for standard risks.",
    coverages: [
      { id: "death", label: "Death benefit", limit: 2000000, description: "Level term death benefit." },
      { id: "conversion", label: "Conversion privilege", limit: 2000000, description: "Convert to permanent without new evidence." },
      { id: "waiver", label: "Waiver of premium", limit: 2000000, description: "Premiums waived during total disability." },
      { id: "accel", label: "Accelerated death benefit", limit: 1000000, description: "Early payout on terminal diagnosis." },
      { id: "child", label: "Child rider", limit: 25000, description: "Coverage for dependent children." },
    ],
  },
  {
    id: "LIFE-PRM",
    name: "Horizon Preferred Plus",
    line: "life",
    tier: "premier",
    baseRatePer1k: 0.48,
    minCoverage: 500000,
    maxCoverage: 10000000,
    availableDeductibles: [0],
    maxAcceptableRisk: 38,
    coverageBreadth: 1.0,
    summary: "Preferred-plus rate class. Requires clean labs and non-tobacco status.",
    coverages: [
      { id: "death", label: "Death benefit", limit: 10000000, description: "Level term death benefit." },
      { id: "conversion", label: "Conversion privilege", limit: 10000000, description: "Convert to permanent without new evidence." },
      { id: "waiver", label: "Waiver of premium", limit: 10000000, description: "Premiums waived during total disability." },
      { id: "accel", label: "Accelerated death benefit", limit: 5000000, description: "Early payout on terminal diagnosis." },
      { id: "child", label: "Child rider", limit: 50000, description: "Coverage for dependent children." },
    ],
  },

  // --------------------------- umbrella ---------------------------
  {
    id: "UMB-STD",
    name: "Overwatch Umbrella",
    line: "umbrella",
    tier: "standard",
    baseRatePer1k: 0.11,
    minCoverage: 1000000,
    maxCoverage: 5000000,
    availableDeductibles: [0],
    maxAcceptableRisk: 60,
    coverageBreadth: 0.85,
    summary: "Excess liability sitting above your auto and home limits.",
    coverages: [
      { id: "excess", label: "Excess liability", limit: 5000000, description: "Liability above underlying policy limits." },
      { id: "defense", label: "Defense costs", limit: 5000000, description: "Legal defense outside the limit." },
      { id: "libel", label: "Personal injury (libel, slander)", limit: 1000000, description: "Reputational-harm claims." },
      { id: "worldwide", label: "Worldwide coverage", limit: 5000000, description: "Applies outside the United States." },
    ],
  },
  {
    id: "UMB-PRM",
    name: "Overwatch Umbrella Elite",
    line: "umbrella",
    tier: "premier",
    baseRatePer1k: 0.16,
    minCoverage: 2000000,
    maxCoverage: 10000000,
    availableDeductibles: [0],
    maxAcceptableRisk: 46,
    coverageBreadth: 1.0,
    summary: "Higher excess limits plus not-for-profit board and employment-practices coverage.",
    coverages: [
      { id: "excess", label: "Excess liability", limit: 10000000, description: "Liability above underlying policy limits." },
      { id: "defense", label: "Defense costs", limit: 10000000, description: "Legal defense outside the limit." },
      { id: "libel", label: "Personal injury (libel, slander)", limit: 2000000, description: "Reputational-harm claims." },
      { id: "worldwide", label: "Worldwide coverage", limit: 10000000, description: "Applies outside the United States." },
      { id: "board", label: "Not-for-profit board liability", limit: 1000000, description: "Volunteer directorship exposure." },
    ],
  },
];

export function listProducts(): PolicyProduct[] {
  return products;
}

export function productsForLine(line: LineOfBusiness): PolicyProduct[] {
  return products.filter((p) => p.line === line);
}

export function getProduct(id: string): PolicyProduct | undefined {
  return products.find((p) => p.id === id);
}

/** Union of coverage ids across a line, so comparison tables have stable rows. */
export function coverageRowsForLine(line: LineOfBusiness): Array<{ id: string; label: string }> {
  const seen = new Map<string, string>();
  for (const product of productsForLine(line)) {
    for (const coverage of product.coverages) {
      if (!seen.has(coverage.id)) seen.set(coverage.id, coverage.label);
    }
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
}
