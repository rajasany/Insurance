import {
  getApplicant as seedApplicant,
  getApplication as seedApplication,
  listApplicants as seedApplicants,
  listApplications as seedApplications,
  ageOf,
} from "@/lib/data/customers";
import type {
  Applicant,
  Application,
  CatastropheExposure,
  ClaimsHistoryRecord,
  CreditRiskSignal,
  DataSource,
  MedicalSummary,
  MotorVehicleRecord,
} from "@/lib/domain/types";
import type {
  ClaimsExchangePort,
  ClinicalPort,
  CreditBureauPort,
  GeospatialPort,
  MvrPort,
  PolicyAdminPort,
  Sourced,
} from "./types";

/**
 * Deterministic stand-ins for the external systems.
 *
 * Each fixture is keyed by applicant so a given submission scores identically
 * on every run — which is what makes the evaluation harness meaningful. The
 * simulated latency is deliberately small (tens of milliseconds) so the UI
 * shows real concurrency without making the demo slow; the *real* multi-day
 * wait for third-party reports is modeled in `groundTruth.baselineManualMinutes`
 * instead of being faked here.
 */

const RETRIEVED_AT = "2026-08-07T12:00:00Z";

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function source(
  name: string,
  kind: DataSource["kind"],
  latencyMs: number,
  status: DataSource["status"] = "ok",
): DataSource {
  return { name, kind, latencyMs, status, retrievedAt: RETRIEVED_AT };
}

// ---------------------------------------------------------------------------
// Credit bureau
// ---------------------------------------------------------------------------

const creditFixtures: Record<string, CreditRiskSignal> = {
  "APP-1001": { insuranceScore: 812, bureau: "Meridian Risk Bureau", thinFile: false, derogatoryMarks: 0, retrievedAt: RETRIEVED_AT },
  "APP-1002": { insuranceScore: 598, bureau: "Meridian Risk Bureau", thinFile: false, derogatoryMarks: 2, retrievedAt: RETRIEVED_AT },
  "APP-1003": { insuranceScore: 845, bureau: "Meridian Risk Bureau", thinFile: false, derogatoryMarks: 0, retrievedAt: RETRIEVED_AT },
  "APP-1004": { insuranceScore: 704, bureau: "Meridian Risk Bureau", thinFile: false, derogatoryMarks: 1, retrievedAt: RETRIEVED_AT },
  "APP-1005": { insuranceScore: 838, bureau: "Meridian Risk Bureau", thinFile: false, derogatoryMarks: 0, retrievedAt: RETRIEVED_AT },
  "APP-1006": { insuranceScore: 690, bureau: "Meridian Risk Bureau", thinFile: false, derogatoryMarks: 0, retrievedAt: RETRIEVED_AT },
  "APP-1007": { insuranceScore: 790, bureau: "Meridian Risk Bureau", thinFile: false, derogatoryMarks: 0, retrievedAt: RETRIEVED_AT },
  // No credit history to score against — the engine must handle this as a gap,
  // not as a zero score.
  "APP-1008": { insuranceScore: 0, bureau: "Meridian Risk Bureau", thinFile: true, derogatoryMarks: 0, retrievedAt: RETRIEVED_AT },
};

export class MockCreditBureau implements CreditBureauPort {
  readonly name = "Meridian Risk Bureau";

  async fetchInsuranceScore(applicant: Applicant): Promise<Sourced<CreditRiskSignal>> {
    await delay(45);
    return {
      data: creditFixtures[applicant.id],
      source: source(this.name, "credit_bureau", 45),
    };
  }
}

// ---------------------------------------------------------------------------
// Motor vehicle records
// ---------------------------------------------------------------------------

const mvrFixtures: Record<string, MotorVehicleRecord> = {
  "APP-1001": {
    licenseNumber: "W-4482-1193-0055",
    licenseState: "WI",
    licensedSinceYear: 2003,
    violations: [],
    atFaultAccidents: 0,
    majorViolations: 0,
  },
  "APP-1002": {
    licenseNumber: "I-9920-4471-8802",
    licenseState: "IL",
    licensedSinceYear: 2018,
    violations: [
      { code: "SP-15", description: "Speeding 15 mph over limit", date: "2025-04-11", points: 3 },
      { code: "SP-10", description: "Speeding 10 mph over limit", date: "2024-09-02", points: 2 },
      { code: "FTY", description: "Failure to yield", date: "2024-02-19", points: 3 },
    ],
    atFaultAccidents: 1,
    majorViolations: 0,
  },
  "APP-1003": {
    licenseNumber: "F-1120-7788-4410",
    licenseState: "FL",
    licensedSinceYear: 1980,
    violations: [],
    atFaultAccidents: 0,
    majorViolations: 0,
  },
  "APP-1004": {
    licenseNumber: "L-3345-2201-9987",
    licenseState: "LA",
    licensedSinceYear: 1996,
    violations: [
      { code: "SP-10", description: "Speeding 10 mph over limit", date: "2023-06-30", points: 2 },
    ],
    atFaultAccidents: 0,
    majorViolations: 0,
  },
  "APP-1005": {
    licenseNumber: "C-8871-4402-1130",
    licenseState: "CA",
    licensedSinceYear: 2009,
    violations: [],
    atFaultAccidents: 0,
    majorViolations: 0,
  },
  "APP-1006": {
    licenseNumber: "P-2201-9987-4455",
    licenseState: "PA",
    licensedSinceYear: 1973,
    violations: [],
    atFaultAccidents: 0,
    majorViolations: 0,
  },
  "APP-1007": {
    licenseNumber: "T-5590-1123-7788",
    licenseState: "TX",
    licensedSinceYear: 2006,
    violations: [
      { code: "RECK", description: "Reckless driving", date: "2025-11-14", points: 6 },
      { code: "SP-20", description: "Speeding 20 mph over limit", date: "2025-11-14", points: 4 },
    ],
    atFaultAccidents: 1,
    majorViolations: 1,
  },
  "APP-1008": {
    licenseNumber: "M-7741-0022-9931",
    licenseState: "MN",
    licensedSinceYear: 2019,
    violations: [],
    atFaultAccidents: 0,
    majorViolations: 0,
  },
};

export class MockMvrProvider implements MvrPort {
  readonly name = "StateLink MVR Gateway";

  async fetchMvr(applicant: Applicant): Promise<Sourced<MotorVehicleRecord>> {
    await delay(70);
    return {
      data: mvrFixtures[applicant.id],
      source: source(this.name, "mvr", 70),
    };
  }
}

// ---------------------------------------------------------------------------
// Claims exchange
// ---------------------------------------------------------------------------

const claimsFixtures: Record<string, ClaimsHistoryRecord[]> = {
  "APP-1001": [
    { line: "home", date: "2019-05-22", paidAmount: 3400, cause: "Hail damage to gutters", atFault: false },
  ],
  "APP-1002": [
    { line: "auto", date: "2024-02-19", paidAmount: 8900, cause: "Rear-end collision", atFault: true },
  ],
  "APP-1003": [
    { line: "home", date: "2022-09-28", paidAmount: 74000, cause: "Hurricane wind — roof and soffit", atFault: false },
    { line: "home", date: "2017-09-10", paidAmount: 21500, cause: "Wind-driven rain", atFault: false },
  ],
  "APP-1004": [
    { line: "home", date: "2021-08-29", paidAmount: 46200, cause: "Water damage following named storm", atFault: false },
  ],
  "APP-1005": [],
  "APP-1006": [],
  "APP-1007": [
    { line: "auto", date: "2025-11-14", paidAmount: 27400, cause: "Single-vehicle loss of control", atFault: true },
  ],
  "APP-1008": [],
};

export class MockClaimsExchange implements ClaimsExchangePort {
  readonly name = "National Loss Exchange";

  async fetchClaims(applicant: Applicant): Promise<Sourced<ClaimsHistoryRecord[]>> {
    await delay(55);
    return {
      data: claimsFixtures[applicant.id] ?? [],
      source: source(this.name, "claims_exchange", 55),
    };
  }
}

// ---------------------------------------------------------------------------
// Geospatial peril scoring
// ---------------------------------------------------------------------------

const geoFixtures: Record<string, CatastropheExposure> = {
  "APP-1001": { wildfireScore: 4, floodZone: "X", windHailScore: 34, earthquakeScore: 3, crimeIndex: 28 },
  "APP-1002": { wildfireScore: 2, floodZone: "X", windHailScore: 30, earthquakeScore: 5, crimeIndex: 81 },
  "APP-1003": { wildfireScore: 6, floodZone: "AE", windHailScore: 91, earthquakeScore: 2, crimeIndex: 35 },
  "APP-1004": { wildfireScore: 5, floodZone: "AO", windHailScore: 76, earthquakeScore: 3, crimeIndex: 64 },
  "APP-1005": { wildfireScore: 79, floodZone: "X", windHailScore: 12, earthquakeScore: 71, crimeIndex: 22 },
  "APP-1006": { wildfireScore: 3, floodZone: "X", windHailScore: 41, earthquakeScore: 4, crimeIndex: 44 },
  "APP-1007": { wildfireScore: 11, floodZone: "X", windHailScore: 58, earthquakeScore: 6, crimeIndex: 39 },
  "APP-1008": { wildfireScore: 2, floodZone: "X", windHailScore: 37, earthquakeScore: 2, crimeIndex: 52 },
};

export class MockGeospatialProvider implements GeospatialPort {
  readonly name = "PerilGrid Geospatial";

  async fetchExposure(applicant: Applicant): Promise<Sourced<CatastropheExposure>> {
    await delay(40);
    // Simulates a partially-degraded vendor: data still arrives, but the
    // provenance record says so, and the UI surfaces it.
    const status: DataSource["status"] = applicant.id === "APP-1004" ? "degraded" : "ok";
    return {
      data: geoFixtures[applicant.id],
      source: source(this.name, "geospatial", status === "degraded" ? 310 : 40, status),
    };
  }
}

// ---------------------------------------------------------------------------
// Clinical aggregator
// ---------------------------------------------------------------------------

function bmi(heightInches: number, weightPounds: number): number {
  return Number(((weightPounds * 703) / (heightInches * heightInches)).toFixed(1));
}

const clinicalFixtures: Record<
  string,
  Omit<MedicalSummary, "bmi"> & { note?: string }
> = {
  "APP-1004": {
    bloodPressureBand: "elevated",
    cholesterolBand: "borderline",
    flaggedConditions: ["prediabetes (A1c 6.1)"],
    labsRetrieved: true,
  },
  "APP-1005": {
    bloodPressureBand: "normal",
    cholesterolBand: "normal",
    flaggedConditions: [],
    labsRetrieved: true,
  },
  "APP-1006": {
    bloodPressureBand: "stage_2",
    cholesterolBand: "high",
    flaggedConditions: ["hypertension (treated)", "COPD (moderate)", "30 pack-year smoking history"],
    labsRetrieved: true,
  },
};

export class MockClinicalProvider implements ClinicalPort {
  readonly name = "VitalBridge Clinical Aggregator";

  async fetchMedicalSummary(
    applicant: Applicant,
    application: Application,
  ): Promise<Sourced<MedicalSummary>> {
    if (application.line !== "life" || !application.life) {
      // Not ordered for non-life lines. Reporting this as `unavailable` rather
      // than silently omitting it keeps the provenance list honest.
      return {
        data: undefined,
        source: source(this.name, "clinical", 0, "unavailable"),
      };
    }
    await delay(90);
    const fixture = clinicalFixtures[applicant.id];
    if (!fixture) {
      return { data: undefined, source: source(this.name, "clinical", 90, "unavailable") };
    }
    return {
      data: {
        ...fixture,
        bmi: bmi(application.life.heightInches, application.life.weightPounds),
      },
      source: source(this.name, "clinical", 90),
    };
  }
}

// ---------------------------------------------------------------------------
// Policy administration
// ---------------------------------------------------------------------------

export class MockPolicyAdmin implements PolicyAdminPort {
  readonly name = "Corepoint Policy Admin";

  async listApplications(): Promise<Application[]> {
    await delay(10);
    return seedApplications();
  }

  async listApplicants(): Promise<Applicant[]> {
    await delay(10);
    return seedApplicants();
  }

  async getApplication(id: string): Promise<Application | undefined> {
    await delay(5);
    return seedApplication(id);
  }

  async getApplicant(id: string): Promise<Applicant | undefined> {
    await delay(5);
    return seedApplicant(id);
  }
}

export { ageOf };
