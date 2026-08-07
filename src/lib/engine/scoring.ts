import { ageOf } from "@/lib/data/customers";
import type {
  Applicant,
  Application,
  EnrichedRiskData,
  RiskAssessment,
  RiskFactor,
  Severity,
} from "@/lib/domain/types";

/**
 * Deterministic risk scoring.
 *
 * Every factor carries a signed `contribution`, and the contributions plus the
 * baseline sum exactly to the final score. That invariant is what lets the
 * explanation dashboard draw an honest waterfall instead of a decorative one —
 * `assertFactorsSumToScore` below enforces it.
 *
 * The model never produces the number. It reads these factors and writes the
 * prose. Keeping it that way is why the same submission scores identically on
 * every run.
 */

const BASELINE = 30;

const BANDS: Array<{ max: number; band: Severity }> = [
  { max: 35, band: "low" },
  { max: 55, band: "moderate" },
  { max: 72, band: "elevated" },
  { max: Infinity, band: "high" },
];

/** Line-specific score at which the risk is outside appetite entirely. */
export const DECLINE_THRESHOLD: Record<Application["line"], number> = {
  auto: 92,
  home: 92,
  life: 90,
  umbrella: 78,
};

const PERFORMANCE_MAKES = new Set([
  "bmw",
  "porsche",
  "mercedes-benz",
  "audi",
  "maserati",
  "corvette",
  "dodge",
]);

const CLAIM_LOOKBACK_YEARS = 5;
const AS_OF = new Date("2026-08-07T00:00:00Z");

export function bandFor(score: number): Severity {
  return BANDS.find((b) => score <= b.max)!.band;
}

function severityOf(contribution: number): Severity {
  const magnitude = Math.abs(contribution);
  if (magnitude >= 12) return "high";
  if (magnitude >= 6) return "elevated";
  if (magnitude >= 3) return "moderate";
  return "low";
}

function factor(
  id: string,
  label: string,
  contribution: number,
  evidence: string,
  source: string,
): RiskFactor {
  return { id, label, contribution, severity: severityOf(contribution), evidence, source };
}

function yearsSince(iso: string): number {
  return (AS_OF.getTime() - new Date(iso).getTime()) / (365.25 * 24 * 3600 * 1000);
}

// ---------------------------------------------------------------------------
// Shared factors (apply to every line)
// ---------------------------------------------------------------------------

function creditFactors(enriched: EnrichedRiskData, gaps: string[]): RiskFactor[] {
  const credit = enriched.credit;
  if (!credit) {
    gaps.push("No credit-based insurance score returned; rated without it.");
    return [];
  }
  const out: RiskFactor[] = [];

  if (credit.thinFile) {
    gaps.push("Thin credit file — no insurance score could be calculated.");
    out.push(
      factor(
        "credit-thin",
        "Thin credit file",
        8,
        "No scoreable credit history, so the strongest available frequency predictor is unavailable.",
        credit.bureau,
      ),
    );
  } else {
    const s = credit.insuranceScore;
    const tier =
      s >= 800 ? -8 : s >= 750 ? -5 : s >= 700 ? -2 : s >= 650 ? 2 : s >= 600 ? 6 : 10;
    out.push(
      factor(
        "credit-score",
        "Credit-based insurance score",
        tier,
        `Score of ${s} from ${credit.bureau}.`,
        credit.bureau,
      ),
    );
  }

  if (credit.derogatoryMarks > 0) {
    out.push(
      factor(
        "credit-derog",
        "Derogatory credit marks",
        Math.min(credit.derogatoryMarks * 3, 9),
        `${credit.derogatoryMarks} derogatory mark${credit.derogatoryMarks === 1 ? "" : "s"} on file.`,
        credit.bureau,
      ),
    );
  }
  return out;
}

function tenureFactor(applicant: Applicant): RiskFactor {
  const y = applicant.yearsInsured;
  const contribution = y >= 15 ? -5 : y >= 10 ? -3 : y >= 5 ? -1 : y >= 1 ? 3 : 6;
  const evidence =
    y === 0
      ? "No prior insurance history on record."
      : `${y} year${y === 1 ? "" : "s"} of continuous prior coverage.`;
  return factor("tenure", "Prior coverage tenure", contribution, evidence, "Corepoint Policy Admin");
}

/**
 * Claims history. Auto submissions deliberately exclude auto claims because
 * the MVR already prices at-fault accidents — counting both would double-charge
 * the same loss.
 */
function claimsFactors(
  enriched: EnrichedRiskData,
  line: Application["line"],
): RiskFactor[] {
  const relevant = enriched.claims.filter(
    (c) => yearsSince(c.date) <= CLAIM_LOOKBACK_YEARS && (line !== "auto" || c.line !== "auto"),
  );
  if (relevant.length === 0) return [];

  let contribution = 0;
  for (const claim of relevant) {
    contribution += claim.atFault ? 6 : 2;
    if (claim.paidAmount > 50000) contribution += 4;
  }
  const summary = relevant
    .map((c) => `${c.date.slice(0, 7)} ${c.cause} ($${c.paidAmount.toLocaleString()})`)
    .join("; ");
  return [
    factor(
      "claims",
      `Claims in the last ${CLAIM_LOOKBACK_YEARS} years`,
      contribution,
      `${relevant.length} claim${relevant.length === 1 ? "" : "s"}: ${summary}.`,
      "National Loss Exchange",
    ),
  ];
}

// ---------------------------------------------------------------------------
// Auto
// ---------------------------------------------------------------------------

function autoFactors(
  applicant: Applicant,
  application: Application,
  enriched: EnrichedRiskData,
  gaps: string[],
): RiskFactor[] {
  const auto = application.auto;
  if (!auto) return [];
  const out: RiskFactor[] = [];
  const mvr = enriched.mvr;

  if (!mvr) {
    gaps.push("No motor vehicle record returned; driving history unrated.");
  } else {
    const points = mvr.violations.reduce((sum, v) => sum + v.points, 0);
    if (points > 0) {
      out.push(
        factor(
          "mvr-points",
          "Violation points",
          Math.round(points * 1.2),
          `${points} points across ${mvr.violations.length} violation(s): ${mvr.violations
            .map((v) => `${v.description} (${v.date})`)
            .join("; ")}.`,
          "StateLink MVR Gateway",
        ),
      );
    }
    if (mvr.majorViolations > 0) {
      out.push(
        factor(
          "mvr-major",
          "Major violations",
          mvr.majorViolations * 18,
          `${mvr.majorViolations} major violation(s) on record — the single strongest severity predictor in the auto model.`,
          "StateLink MVR Gateway",
        ),
      );
    }
    if (mvr.atFaultAccidents > 0) {
      out.push(
        factor(
          "mvr-atfault",
          "At-fault accidents",
          mvr.atFaultAccidents * 7,
          `${mvr.atFaultAccidents} at-fault accident(s) on the MVR.`,
          "StateLink MVR Gateway",
        ),
      );
    }
  }

  if (auto.primaryUse === "business") {
    out.push(
      factor(
        "auto-use",
        "Commercial or livery use",
        10,
        "Declared primary use is business, which materially raises exposure hours and is outside the personal-auto form.",
        "Application",
      ),
    );
  }

  const miles = auto.annualMileage;
  if (miles > 25000) {
    out.push(
      factor("auto-mileage", "High annual mileage", 6, `${miles.toLocaleString()} miles per year.`, "Application"),
    );
  } else if (miles > 15000) {
    out.push(
      factor("auto-mileage", "Above-average mileage", 4, `${miles.toLocaleString()} miles per year.`, "Application"),
    );
  } else if (miles < 8000) {
    out.push(
      factor("auto-mileage", "Low annual mileage", -3, `${miles.toLocaleString()} miles per year.`, "Application"),
    );
  }

  if (auto.garaged) {
    out.push(factor("auto-garage", "Garaged overnight", -2, "Vehicle is garaged, reducing theft and hail exposure.", "Application"));
  }
  if (auto.antiTheft) {
    out.push(factor("auto-theft", "Anti-theft device", -2, "Factory or aftermarket anti-theft system present.", "Application"));
  }

  const vehicleAge = AS_OF.getUTCFullYear() - auto.vehicleYear;
  if (vehicleAge > 12) {
    out.push(
      factor("auto-vehicle-age", "Older vehicle", 2, `${auto.vehicleYear} model year — ${vehicleAge} years old, without modern crash-avoidance systems.`, "Application"),
    );
  }
  if (PERFORMANCE_MAKES.has(auto.vehicleMake.toLowerCase()) && vehicleAge <= 4) {
    out.push(
      factor(
        "auto-performance",
        "High-performance vehicle",
        6,
        `${auto.vehicleYear} ${auto.vehicleMake} ${auto.vehicleModel} — high-horsepower class with elevated severity.`,
        "Application",
      ),
    );
  }

  const age = ageOf(applicant, AS_OF);
  if (age < 25) {
    out.push(factor("auto-driver-age", "Young driver", 10, `Rated driver is ${age}.`, "Application"));
  } else if (age < 30) {
    out.push(factor("auto-driver-age", "Under-30 driver", 4, `Rated driver is ${age}.`, "Application"));
  } else if (age >= 75) {
    out.push(factor("auto-driver-age", "Senior driver", 5, `Rated driver is ${age}.`, "Application"));
  }

  const crime = enriched.catastrophe?.crimeIndex;
  if (crime !== undefined && crime > 70) {
    out.push(
      factor("auto-crime", "High-theft garaging location", 3, `Territory crime index of ${crime}.`, "PerilGrid Geospatial"),
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function homeFactors(application: Application, enriched: EnrichedRiskData, gaps: string[]): RiskFactor[] {
  const home = application.home;
  if (!home) return [];
  const out: RiskFactor[] = [];

  const roof = home.roofAgeYears;
  if (roof >= 20) {
    out.push(factor("home-roof", "Roof at end of service life", 12, `Roof is ${roof} years old.`, "Application"));
  } else if (roof >= 15) {
    out.push(factor("home-roof", "Aging roof", 8, `Roof is ${roof} years old.`, "Application"));
  } else if (roof >= 10) {
    out.push(factor("home-roof", "Mid-life roof", 3, `Roof is ${roof} years old.`, "Application"));
  } else if (roof <= 5) {
    out.push(factor("home-roof", "New roof", -3, `Roof is ${roof} years old.`, "Application"));
  }

  if (home.yearBuilt < 1940) {
    out.push(
      factor("home-age", "Pre-1940 construction", 9, `Built ${home.yearBuilt}; original wiring and plumbing systems are a common loss driver.`, "Application"),
    );
  } else if (home.yearBuilt < 1980) {
    out.push(factor("home-age", "Mid-century construction", 4, `Built ${home.yearBuilt}.`, "Application"));
  } else if (home.yearBuilt >= 2000) {
    out.push(factor("home-age", "Modern construction", -3, `Built ${home.yearBuilt} to contemporary code.`, "Application"));
  }

  if (home.construction === "masonry") {
    out.push(factor("home-construction", "Masonry construction", -3, "Masonry resists fire and wind better than frame.", "Application"));
  } else if (home.construction === "frame") {
    out.push(factor("home-construction", "Frame construction", 1, "Frame construction carries higher fire and wind severity.", "Application"));
  }

  const cat = enriched.catastrophe;
  if (!cat) {
    gaps.push("No geospatial peril scores returned; catastrophe exposure unrated.");
  } else {
    const coast = home.distanceToCoastMiles;
    if (coast < 1) {
      out.push(factor("home-coast", "Immediate coastal exposure", 14, `${coast} miles to open water.`, "Application"));
    } else if (coast < 5) {
      out.push(factor("home-coast", "Near-coastal exposure", 8, `${coast} miles to open water.`, "Application"));
    } else if (coast < 25) {
      out.push(factor("home-coast", "Coastal county exposure", 3, `${coast} miles to open water.`, "Application"));
    }

    if (cat.windHailScore >= 85) {
      out.push(factor("home-wind", "Severe wind and hail exposure", 10, `Wind/hail score of ${cat.windHailScore}/100.`, "PerilGrid Geospatial"));
    } else if (cat.windHailScore >= 70) {
      out.push(factor("home-wind", "Elevated wind and hail exposure", 6, `Wind/hail score of ${cat.windHailScore}/100.`, "PerilGrid Geospatial"));
    } else if (cat.windHailScore >= 50) {
      out.push(factor("home-wind", "Moderate wind and hail exposure", 2, `Wind/hail score of ${cat.windHailScore}/100.`, "PerilGrid Geospatial"));
    }

    if (cat.wildfireScore >= 75) {
      out.push(factor("home-wildfire", "Severe wildfire exposure", 12, `Wildfire score of ${cat.wildfireScore}/100.`, "PerilGrid Geospatial"));
    } else if (cat.wildfireScore >= 50) {
      out.push(factor("home-wildfire", "Elevated wildfire exposure", 6, `Wildfire score of ${cat.wildfireScore}/100.`, "PerilGrid Geospatial"));
    }

    if (["A", "AE", "AO", "AH", "VE"].includes(cat.floodZone)) {
      out.push(
        factor("home-flood", "Special flood hazard area", 6, `FEMA zone ${cat.floodZone} — flood peril is excluded and must be placed separately.`, "PerilGrid Geospatial"),
      );
    }

    if (cat.earthquakeScore >= 70) {
      out.push(factor("home-quake", "Seismic exposure", 3, `Earthquake score of ${cat.earthquakeScore}/100.`, "PerilGrid Geospatial"));
    }
  }

  if (home.distanceToHydrantFt > 400) {
    out.push(factor("home-hydrant", "Poor fire-service access", 5, `${home.distanceToHydrantFt} ft to the nearest hydrant.`, "Application"));
  } else if (home.distanceToHydrantFt > 250) {
    out.push(factor("home-hydrant", "Marginal hydrant distance", 2, `${home.distanceToHydrantFt} ft to the nearest hydrant.`, "Application"));
  }

  if (home.hasMonitoredAlarm) {
    out.push(factor("home-alarm", "Monitored alarm", -3, "Central-station fire and burglary monitoring in place.", "Application"));
  }

  return out;
}

// ---------------------------------------------------------------------------
// Life
// ---------------------------------------------------------------------------

function lifeFactors(
  applicant: Applicant,
  application: Application,
  enriched: EnrichedRiskData,
  gaps: string[],
): RiskFactor[] {
  const life = application.life;
  if (!life) return [];
  const out: RiskFactor[] = [];
  const age = ageOf(applicant, AS_OF);

  const ageLoad = age < 35 ? -6 : age < 45 ? -2 : age < 55 ? 3 : age < 65 ? 9 : 16;
  out.push(factor("life-age", "Attained age", ageLoad, `Applicant is ${age}.`, "Application"));

  if (applicant.tobaccoUse) {
    out.push(factor("life-tobacco", "Tobacco use", 20, "Current tobacco user — the largest single mortality load in the model.", "Application"));
  }

  const medical = enriched.medical;
  if (!medical) {
    gaps.push("No clinical summary available; mortality rated on application data only.");
  } else {
    const b = medical.bmi;
    const bmiLoad = b >= 35 ? 12 : b >= 30 ? 7 : b >= 25 ? 2 : b >= 18.5 ? -4 : 5;
    out.push(factor("life-bmi", "Body mass index", bmiLoad, `BMI of ${b}.`, "VitalBridge Clinical Aggregator"));

    const bpLoad =
      medical.bloodPressureBand === "stage_2"
        ? 12
        : medical.bloodPressureBand === "stage_1"
          ? 6
          : medical.bloodPressureBand === "elevated"
            ? 3
            : 0;
    if (bpLoad > 0) {
      out.push(
        factor("life-bp", "Blood pressure", bpLoad, `Blood pressure in the ${medical.bloodPressureBand.replace("_", " ")} band.`, "VitalBridge Clinical Aggregator"),
      );
    }

    const cholLoad = medical.cholesterolBand === "high" ? 6 : medical.cholesterolBand === "borderline" ? 2 : 0;
    if (cholLoad > 0) {
      out.push(
        factor("life-chol", "Cholesterol", cholLoad, `Cholesterol in the ${medical.cholesterolBand} band.`, "VitalBridge Clinical Aggregator"),
      );
    }

    for (const condition of medical.flaggedConditions) {
      const lower = condition.toLowerCase();
      const load = lower.includes("copd")
        ? 16
        : lower.includes("prediabetes")
          ? 5
          : lower.includes("hypertension")
            ? 4
            : 3;
      out.push(
        factor(
          `life-cond-${lower.replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
          `Condition: ${condition}`,
          load,
          `Flagged by the clinical aggregator: ${condition}.`,
          "VitalBridge Clinical Aggregator",
        ),
      );
    }
  }

  if (life.familyHistory.length > 0) {
    out.push(
      factor(
        "life-family",
        "Family history",
        Math.min(life.familyHistory.length * 3, 6),
        life.familyHistory.join("; ") + ".",
        "Application",
      ),
    );
  }

  if (life.faceAmount > applicant.annualIncome * 10) {
    out.push(
      factor(
        "life-face-ratio",
        "Face amount vs. income",
        5,
        `Requested $${life.faceAmount.toLocaleString()} against $${applicant.annualIncome.toLocaleString()} income — above the ${10}x financial-justification guideline.`,
        "Application",
      ),
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// Umbrella
// ---------------------------------------------------------------------------

function umbrellaFactors(
  applicant: Applicant,
  application: Application,
  enriched: EnrichedRiskData,
): RiskFactor[] {
  const out: RiskFactor[] = [];
  const mvr = enriched.mvr;

  if (mvr) {
    const points = mvr.violations.reduce((sum, v) => sum + v.points, 0);
    if (points > 0) {
      out.push(factor("umb-mvr", "Underlying driving record", Math.round(points * 0.8), `${points} violation points on the underlying MVR.`, "StateLink MVR Gateway"));
    }
    if (mvr.majorViolations > 0) {
      out.push(factor("umb-major", "Underlying major violations", mvr.majorViolations * 12, `${mvr.majorViolations} major violation(s).`, "StateLink MVR Gateway"));
    }
  }

  if (application.requestedCoverage > applicant.annualIncome * 10) {
    out.push(
      factor(
        "umb-limit-ratio",
        "Limit vs. income",
        4,
        `Requested $${application.requestedCoverage.toLocaleString()} of excess limit against $${applicant.annualIncome.toLocaleString()} income.`,
        "Application",
      ),
    );
  }

  if (applicant.householdSize >= 4) {
    out.push(factor("umb-household", "Household exposure units", 2, `${applicant.householdSize}-person household increases liability-exposure count.`, "Application"));
  }

  return out;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function assessRisk(
  applicant: Applicant,
  application: Application,
  enriched: EnrichedRiskData,
): RiskAssessment {
  const dataGaps: string[] = [];
  const factors: RiskFactor[] = [
    ...creditFactors(enriched, dataGaps),
    tenureFactor(applicant),
    ...claimsFactors(enriched, application.line),
  ];

  switch (application.line) {
    case "auto":
      factors.push(...autoFactors(applicant, application, enriched, dataGaps));
      break;
    case "home":
      factors.push(...homeFactors(application, enriched, dataGaps));
      break;
    case "life":
      factors.push(...lifeFactors(applicant, application, enriched, dataGaps));
      break;
    case "umbrella":
      factors.push(...umbrellaFactors(applicant, application, enriched));
      break;
  }

  const raw = BASELINE + factors.reduce((sum, f) => sum + f.contribution, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  // Ranked most-additive first so the waterfall and the agent narration both
  // lead with what actually drove the number.
  factors.sort((a, b) => b.contribution - a.contribution);

  return {
    score,
    band: bandFor(score),
    baseline: BASELINE,
    factors,
    lossCostMultiplier: Number((0.65 + (score / 100) * 1.1).toFixed(3)),
    dataGaps,
  };
}

/**
 * Invariant check used by the tests and the eval harness: the waterfall must
 * reconcile to the score, except where clamping at 0/100 intervenes.
 */
export function assertFactorsSumToScore(assessment: RiskAssessment): boolean {
  const raw = assessment.baseline + assessment.factors.reduce((s, f) => s + f.contribution, 0);
  const clamped = Math.max(0, Math.min(100, Math.round(raw)));
  return clamped === assessment.score;
}
