import { ageOf } from "@/lib/data/customers";
import type {
  DataAnalysisResult,
  EnrichedRiskData,
  Severity,
  UnderwritingCase,
} from "@/lib/domain/types";
import { getIntegrations } from "@/lib/integrations/registry";
import { SHARED_SYSTEM, type Agent, type AgentContext, type AgentOutput } from "./base";
import type { JsonSchema } from "./llm";

/**
 * Agent 1 — customer data analysis.
 *
 * Fans out to every external source concurrently, normalizes what comes back,
 * and produces the profile the downstream agents read. It also owns data
 * quality: contradictions between the submission and third-party data get
 * surfaced here rather than silently rated.
 */

const schema: JsonSchema = {
  type: "object",
  properties: {
    profileSummary: {
      type: "string",
      description:
        "Two to three sentences describing who this applicant is and what they are asking for, in the terms an underwriter would use.",
    },
    inferredNeeds: {
      type: "array",
      description:
        "Coverage needs implied by the household and asset profile that the applicant did not explicitly request.",
      items: { type: "string" },
    },
    additionalDataQualityIssues: {
      type: "array",
      description:
        "Contradictions or omissions between the submission narrative and the third-party data that the deterministic checks did not already catch. Empty array if none.",
      items: { type: "string" },
    },
  },
  required: ["profileSummary", "inferredNeeds", "additionalDataQualityIssues"],
  additionalProperties: false,
};

export const dataAnalysisAgent: Agent = {
  id: "data-analysis",
  label: "Data Analysis",
  description:
    "Pulls credit, MVR, claims, geospatial, and clinical data concurrently, then normalizes it into one applicant profile.",
  consumes: [],

  async run(current: UnderwritingCase, ctx: AgentContext): Promise<AgentOutput> {
    const { applicant, application } = current;
    const io = getIntegrations();

    ctx.log(`Ordering third-party reports for ${applicant.id} (${application.line} submission).`);

    const [credit, mvr, claims, geo, clinical] = await Promise.all([
      io.credit.fetchInsuranceScore(applicant),
      // MVR is only relevant where driving is a rating variable.
      application.line === "auto" || application.line === "umbrella"
        ? io.mvr.fetchMvr(applicant)
        : Promise.resolve({ data: undefined, source: { name: io.mvr.name, kind: "mvr" as const, latencyMs: 0, status: "unavailable" as const, retrievedAt: new Date().toISOString() } }),
      io.claims.fetchClaims(applicant),
      io.geospatial.fetchExposure(applicant),
      io.clinical.fetchMedicalSummary(applicant, application),
    ]);

    const sources = [credit.source, mvr.source, claims.source, geo.source, clinical.source];
    const ok = sources.filter((s) => s.status === "ok").length;
    const degraded = sources.filter((s) => s.status === "degraded");

    ctx.log(
      `${ok} of ${sources.length} sources returned cleanly in ${Math.max(...sources.map((s) => s.latencyMs))}ms (parallel).`,
    );
    for (const source of degraded) {
      ctx.log(`⚠ ${source.name} responded degraded (${source.latencyMs}ms) — flagged in provenance.`);
    }

    const enriched: EnrichedRiskData = {
      credit: credit.data,
      mvr: mvr.data,
      claims: claims.data ?? [],
      catastrophe: geo.data,
      medical: clinical.data,
      sources,
    };

    const deterministic = deriveAnalysis(current, enriched);
    ctx.log(
      `${deterministic.findings.length} finding(s) surfaced; ${deterministic.dataQualityIssues.length} data-quality issue(s).`,
    );

    const result = await ctx.llm.complete<{
      profileSummary: string;
      inferredNeeds: string[];
      additionalDataQualityIssues: string[];
    }>({
      agent: "data-analysis",
      system: SHARED_SYSTEM,
      schema,
      effort: "medium",
      prompt: buildPrompt(current, enriched, deterministic),
      fallback: () => ({
        profileSummary: deterministic.profileSummary,
        inferredNeeds: deterministic.inferredNeeds,
        additionalDataQualityIssues: [],
      }),
    });

    const analysis: DataAnalysisResult = {
      ...deterministic,
      profileSummary: result.value.profileSummary,
      inferredNeeds:
        result.value.inferredNeeds.length > 0
          ? result.value.inferredNeeds
          : deterministic.inferredNeeds,
      dataQualityIssues: [
        ...deterministic.dataQualityIssues,
        ...result.value.additionalDataQualityIssues,
      ],
    };

    if (result.degradedReason) ctx.log(`⚠ ${result.degradedReason}`);

    return {
      patch: { enriched, analysis },
      usedMockLlm: result.usedMock,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    };
  },
};

// ---------------------------------------------------------------------------
// Deterministic derivation (also the LLM fallback)
// ---------------------------------------------------------------------------

function deriveAnalysis(
  current: UnderwritingCase,
  enriched: EnrichedRiskData,
): DataAnalysisResult {
  const { applicant, application } = current;
  const findings: DataAnalysisResult["findings"] = [];
  const dataQualityIssues: string[] = [];
  const inferredNeeds: string[] = [];

  const add = (
    id: string,
    label: string,
    detail: string,
    severity: Severity,
    source: string,
  ) => findings.push({ id, label, detail, severity, source });

  // --- credit -------------------------------------------------------------
  if (enriched.credit?.thinFile) {
    add(
      "thin-file",
      "No scoreable credit history",
      "The bureau returned a thin file, so the credit-based insurance score is unavailable for rating.",
      "moderate",
      enriched.credit.bureau,
    );
    dataQualityIssues.push("Credit-based insurance score unavailable (thin file).");
  } else if (enriched.credit && enriched.credit.insuranceScore < 620) {
    add(
      "low-credit",
      "Low credit-based insurance score",
      `Score of ${enriched.credit.insuranceScore}, with ${enriched.credit.derogatoryMarks} derogatory mark(s).`,
      "elevated",
      enriched.credit.bureau,
    );
  }

  // --- driving -------------------------------------------------------------
  if (enriched.mvr) {
    if (enriched.mvr.majorViolations > 0) {
      add(
        "major-violation",
        "Major violation on the MVR",
        enriched.mvr.violations
          .filter((v) => v.points >= 4)
          .map((v) => `${v.description} on ${v.date}`)
          .join("; ") || "Major violation recorded.",
        "high",
        "StateLink MVR Gateway",
      );
    }
    const points = enriched.mvr.violations.reduce((s, v) => s + v.points, 0);
    if (points >= 6 && enriched.mvr.majorViolations === 0) {
      add(
        "violation-points",
        "Accumulated violation points",
        `${points} points across ${enriched.mvr.violations.length} violations.`,
        "elevated",
        "StateLink MVR Gateway",
      );
    }
    if (enriched.mvr.licensedSinceYear > 2020) {
      add(
        "new-driver",
        "Recently licensed driver",
        `Licensed since ${enriched.mvr.licensedSinceYear}, so there is little driving history to rate.`,
        "moderate",
        "StateLink MVR Gateway",
      );
    }
  }

  // --- claims --------------------------------------------------------------
  const bigClaims = enriched.claims.filter((c) => c.paidAmount > 40000);
  if (bigClaims.length > 0) {
    add(
      "large-claims",
      "Large prior paid losses",
      bigClaims
        .map((c) => `${c.date.slice(0, 7)}: ${c.cause} — $${c.paidAmount.toLocaleString()}`)
        .join("; "),
      bigClaims.length > 1 ? "high" : "elevated",
      "National Loss Exchange",
    );
  }

  // --- property ------------------------------------------------------------
  const home = application.home;
  const cat = enriched.catastrophe;
  if (home && cat) {
    if (home.distanceToCoastMiles < 1) {
      add(
        "coastal",
        "Immediate coastal exposure",
        `${home.distanceToCoastMiles} miles to open water with a wind/hail score of ${cat.windHailScore}.`,
        "high",
        "PerilGrid Geospatial",
      );
    }
    if (cat.wildfireScore >= 70) {
      add(
        "wildfire",
        "High wildfire exposure",
        `Wildfire score of ${cat.wildfireScore}/100 at the risk address.`,
        "high",
        "PerilGrid Geospatial",
      );
    }
    if (home.roofAgeYears >= 15) {
      add(
        "roof",
        "Roof near end of service life",
        `${home.roofAgeYears}-year-old roof against a $${home.dwellingValue.toLocaleString()} dwelling value.`,
        "elevated",
        "Application",
      );
    }
    if (cat.floodZone !== "X") {
      add(
        "flood-zone",
        "Special flood hazard area",
        `FEMA zone ${cat.floodZone}. Flood is excluded from the homeowners form and needs separate placement.`,
        "moderate",
        "PerilGrid Geospatial",
      );
      inferredNeeds.push("Separate flood policy (NFIP or excess flood)");
    }
    if (home.dwellingValue > application.requestedCoverage * 1.05) {
      dataQualityIssues.push(
        `Requested dwelling limit of $${application.requestedCoverage.toLocaleString()} is below the stated replacement value of $${home.dwellingValue.toLocaleString()} — possible coinsurance shortfall.`,
      );
    }
  }

  // --- life ----------------------------------------------------------------
  const medical = enriched.medical;
  if (medical) {
    if (medical.flaggedConditions.length > 0) {
      add(
        "conditions",
        "Flagged medical conditions",
        medical.flaggedConditions.join("; ") + `. BMI ${medical.bmi}.`,
        medical.flaggedConditions.length > 2 ? "high" : "elevated",
        "VitalBridge Clinical Aggregator",
      );
    }
    if (applicant.tobaccoUse) {
      add(
        "tobacco",
        "Current tobacco use",
        "Self-reported tobacco use, corroborated by the clinical summary.",
        "high",
        "Application",
      );
    }
  } else if (application.line === "life") {
    dataQualityIssues.push("No clinical summary returned; mortality assessment is application-only.");
  }

  // --- declared use vs form -----------------------------------------------
  if (application.auto?.primaryUse === "business") {
    add(
      "commercial-use",
      "Declared commercial use",
      "Applicant states the vehicle is used for business, which the personal auto form excludes.",
      "high",
      "Application",
    );
  }

  // --- inferred needs ------------------------------------------------------
  if (applicant.householdSize >= 3 && application.line === "auto") {
    inferredNeeds.push("Rental reimbursement — multi-driver household has no spare vehicle");
  }
  if (applicant.annualIncome > 150_000 && application.line !== "umbrella") {
    inferredNeeds.push("Personal umbrella liability — asset base exceeds underlying liability limits");
  }
  if (application.line === "life" && applicant.householdSize >= 3) {
    inferredNeeds.push("Child rider — dependents in the household");
  }
  if (home && home.yearBuilt < 1990) {
    inferredNeeds.push("Ordinance-or-law coverage — code upgrades likely at rebuild");
  }

  const age = ageOf(applicant);
  const profileSummary =
    `${applicant.name}, ${age}, ${applicant.occupation.toLowerCase()} in ${applicant.address.city}, ${applicant.address.state}. ` +
    `${applicant.householdSize}-person household, $${applicant.annualIncome.toLocaleString()} stated income, ${applicant.yearsInsured} year(s) of prior coverage. ` +
    `Requesting $${application.requestedCoverage.toLocaleString()} of ${application.line} coverage at a $${application.requestedDeductible.toLocaleString()} deductible.`;

  findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  return { profileSummary, findings, dataQualityIssues, inferredNeeds };
}

function severityRank(s: Severity): number {
  return { low: 0, moderate: 1, elevated: 2, high: 3 }[s];
}

function buildPrompt(
  current: UnderwritingCase,
  enriched: EnrichedRiskData,
  deterministic: DataAnalysisResult,
): string {
  return `Summarize this submission for the underwriting file.

## Submission
${JSON.stringify(
  {
    applicant: current.applicant,
    application: current.application,
  },
  null,
  2,
)}

## Third-party data returned
${JSON.stringify(enriched, null, 2)}

## Findings the deterministic checks already produced
${deterministic.findings.map((f) => `- [${f.severity}] ${f.label}: ${f.detail}`).join("\n") || "- none"}

## Data-quality issues already flagged
${deterministic.dataQualityIssues.map((i) => `- ${i}`).join("\n") || "- none"}

Write \`profileSummary\` as the two-to-three-sentence orientation an underwriter reads first. Fill \`inferredNeeds\` with coverage the household plausibly needs but did not ask for — reason from the household size, income, property age, and location, not from a generic checklist. Use \`additionalDataQualityIssues\` only for contradictions the deterministic checks missed; return an empty array if there are none rather than restating what is already flagged.`;
}
