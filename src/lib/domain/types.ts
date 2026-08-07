/**
 * Core domain model.
 *
 * The vocabulary here is deliberately close to how an underwriting desk talks:
 * an *applicant* submits an *application* for a *product*; the desk produces a
 * *risk assessment*, a set of *recommendations*, and a *decision*.
 */

export type LineOfBusiness = "auto" | "home" | "life" | "umbrella";

export type DecisionOutcome = "approve" | "refer" | "decline";

export type Severity = "low" | "moderate" | "elevated" | "high";

// ---------------------------------------------------------------------------
// Customer / application
// ---------------------------------------------------------------------------

export interface Applicant {
  id: string;
  name: string;
  dateOfBirth: string; // ISO date
  occupation: string;
  address: {
    line1: string;
    city: string;
    state: string;
    postalCode: string;
  };
  /** Years the applicant has been continuously insured somewhere. */
  yearsInsured: number;
  /** Self-reported annual income, in USD. */
  annualIncome: number;
  maritalStatus: "single" | "married" | "domestic_partner" | "divorced" | "widowed";
  householdSize: number;
  tobaccoUse: boolean;
}

export interface AutoDetails {
  vehicleYear: number;
  vehicleMake: string;
  vehicleModel: string;
  annualMileage: number;
  primaryUse: "commute" | "pleasure" | "business";
  garaged: boolean;
  antiTheft: boolean;
}

export interface HomeDetails {
  yearBuilt: number;
  squareFeet: number;
  construction: "frame" | "masonry" | "mixed";
  roofAgeYears: number;
  dwellingValue: number;
  distanceToHydrantFt: number;
  distanceToCoastMiles: number;
  hasMonitoredAlarm: boolean;
  priorRenovationYear?: number;
}

export interface LifeDetails {
  faceAmount: number;
  termYears: number;
  heightInches: number;
  weightPounds: number;
  familyHistory: string[];
  conditions: string[];
}

export interface Application {
  id: string;
  applicantId: string;
  line: LineOfBusiness;
  requestedCoverage: number;
  requestedDeductible: number;
  submittedAt: string; // ISO datetime
  auto?: AutoDetails;
  home?: HomeDetails;
  life?: LifeDetails;
  /** Free-text notes captured by the agent or portal. */
  notes?: string;
}

export interface Customer {
  applicant: Applicant;
  applications: Application[];
}

// ---------------------------------------------------------------------------
// External data (populated by the integration adapters)
// ---------------------------------------------------------------------------

export interface CreditRiskSignal {
  /** Insurance credit-based score, 300–900. Higher is better. */
  insuranceScore: number;
  bureau: string;
  thinFile: boolean;
  derogatoryMarks: number;
  retrievedAt: string;
}

export interface MotorVehicleRecord {
  licenseNumber: string;
  licenseState: string;
  licensedSinceYear: number;
  violations: Array<{
    code: string;
    description: string;
    date: string;
    points: number;
  }>;
  atFaultAccidents: number;
  majorViolations: number;
}

export interface ClaimsHistoryRecord {
  line: LineOfBusiness;
  date: string;
  paidAmount: number;
  cause: string;
  atFault: boolean;
}

export interface CatastropheExposure {
  /** 0–100. Higher means more exposed. */
  wildfireScore: number;
  floodZone: string;
  windHailScore: number;
  earthquakeScore: number;
  crimeIndex: number;
}

export interface MedicalSummary {
  /** Aggregated prescription/lab signals; no raw PHI reaches the model. */
  bmi: number;
  bloodPressureBand: "normal" | "elevated" | "stage_1" | "stage_2";
  cholesterolBand: "normal" | "borderline" | "high";
  flaggedConditions: string[];
  labsRetrieved: boolean;
}

export interface EnrichedRiskData {
  credit?: CreditRiskSignal;
  mvr?: MotorVehicleRecord;
  claims: ClaimsHistoryRecord[];
  catastrophe?: CatastropheExposure;
  medical?: MedicalSummary;
  /** Provenance so the explanation dashboard can cite sources. */
  sources: DataSource[];
}

export interface DataSource {
  name: string;
  kind: "credit_bureau" | "mvr" | "claims_exchange" | "geospatial" | "clinical" | "policy_admin";
  latencyMs: number;
  status: "ok" | "degraded" | "unavailable";
  retrievedAt: string;
}

// ---------------------------------------------------------------------------
// Risk assessment
// ---------------------------------------------------------------------------

export interface RiskFactor {
  id: string;
  label: string;
  /**
   * Signed contribution to the 0–100 risk score. Positive adds risk.
   * These sum (plus the base rate) to `RiskAssessment.score`, which is what
   * makes the waterfall chart in the explanation dashboard honest.
   */
  contribution: number;
  severity: Severity;
  /** Human-readable justification, sourced from data not vibes. */
  evidence: string;
  source: string;
}

export interface RiskAssessment {
  /** 0–100. Higher is riskier. */
  score: number;
  band: Severity;
  baseline: number;
  factors: RiskFactor[];
  /** Loss cost multiplier derived from the score; drives pricing. */
  lossCostMultiplier: number;
  /** Factors the engine could not evaluate because data was missing. */
  dataGaps: string[];
  /**
   * Plain-language reading of the factor set, written by the risk agent. Prose
   * only — it never changes the score.
   */
  narrative?: string;
}

// ---------------------------------------------------------------------------
// Products and recommendations
// ---------------------------------------------------------------------------

export interface Coverage {
  id: string;
  label: string;
  limit: number | null; // null == not included
  description: string;
}

export interface PolicyProduct {
  id: string;
  name: string;
  line: LineOfBusiness;
  tier: "essential" | "standard" | "premier";
  /** Annual base premium before risk load, per $1k of coverage. */
  baseRatePer1k: number;
  minCoverage: number;
  maxCoverage: number;
  availableDeductibles: number[];
  coverages: Coverage[];
  /** Risk score above which this product is not offered. */
  maxAcceptableRisk: number;
  /**
   * 0–1 measure of how broadly the form actually pays: named-peril with
   * actual-cash-value settlement sits low, open-peril with guaranteed
   * replacement cost sits at 1. Distinct from whether a coverage is *present* —
   * two products can both list "Dwelling" and settle a loss very differently.
   */
  coverageBreadth: number;
  summary: string;
}

export interface PremiumBreakdown {
  base: number;
  riskLoad: number;
  deductibleCredit: number;
  discounts: Array<{ id: string; label: string; amount: number }>;
  fees: number;
  annualTotal: number;
  monthlyTotal: number;
}

export interface PolicyRecommendation {
  productId: string;
  productName: string;
  tier: PolicyProduct["tier"];
  coverageAmount: number;
  deductible: number;
  premium: PremiumBreakdown;
  /** 0–1. How well this product fits the applicant's profile and needs. */
  fitScore: number;
  rank: number;
  rationale: string;
  tradeoffs: string[];
  /** Coverage gaps this product leaves open, given the applicant's exposure. */
  gaps: string[];
  eligible: boolean;
  ineligibleReason?: string;
}

// ---------------------------------------------------------------------------
// Underwriting decision
// ---------------------------------------------------------------------------

export interface UnderwritingCondition {
  id: string;
  label: string;
  blocking: boolean;
}

export interface RuleEvaluation {
  ruleId: string;
  description: string;
  outcome: "pass" | "fail" | "refer";
  detail: string;
  /** Cited manual/appetite reference so an auditor can trace the call. */
  reference: string;
}

export interface UnderwritingDecision {
  outcome: DecisionOutcome;
  /** 0–1 model confidence in the outcome. */
  confidence: number;
  rationale: string;
  conditions: UnderwritingCondition[];
  rules: RuleEvaluation[];
  /** Non-empty when a human underwriter must sign off. */
  referralReasons: string[];
  reviewedBy: "automated" | "referred_to_underwriter";
}

export interface ComplianceReview {
  passed: boolean;
  findings: Array<{
    id: string;
    severity: "info" | "warning" | "violation";
    message: string;
    regulation: string;
  }>;
  /** Adverse-action notice text, required when declining or rating up. */
  adverseActionNotice?: string;
}

// ---------------------------------------------------------------------------
// Agent coordination
// ---------------------------------------------------------------------------

export type AgentId =
  | "data-analysis"
  | "risk-assessment"
  | "policy-recommendation"
  | "underwriting"
  | "compliance";

export type AgentStatus = "pending" | "running" | "complete" | "failed" | "skipped";

export interface AgentTrace {
  agent: AgentId;
  status: AgentStatus;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  /** Short human-readable log lines, streamed to the coordination timeline. */
  log: string[];
  /** Which agents' outputs this agent read. */
  consumed: AgentId[];
  tokensIn?: number;
  tokensOut?: number;
  error?: string;
  /** True when the deterministic engine ran but the LLM narration was mocked. */
  usedMockLlm?: boolean;
}

/** The shared blackboard every agent reads from and writes to. */
export interface UnderwritingCase {
  runId: string;
  application: Application;
  applicant: Applicant;
  enriched?: EnrichedRiskData;
  analysis?: DataAnalysisResult;
  risk?: RiskAssessment;
  recommendations?: PolicyRecommendation[];
  /** Customer-facing framing of the recommendation set. */
  recommendationSummary?: string;
  decision?: UnderwritingDecision;
  compliance?: ComplianceReview;
  /** Which provider served this run, surfaced in the UI so results are honest. */
  llm?: { kind: "claude" | "mock"; model: string };
}

export interface DataAnalysisResult {
  /** Normalized, model-facing summary of who this applicant is. */
  profileSummary: string;
  /** Signals worth an underwriter's attention, ranked. */
  findings: Array<{
    id: string;
    label: string;
    detail: string
    severity: Severity;
    source: string;
  }>;
  /** Fields that were missing or contradictory in the submission. */
  dataQualityIssues: string[];
  /** Coverage needs inferred from the household profile. */
  inferredNeeds: string[];
}

export type OrchestratorEvent =
  | { type: "run_started"; runId: string; applicationId: string; at: number }
  | { type: "agent_started"; agent: AgentId; consumed: AgentId[]; at: number }
  | { type: "agent_log"; agent: AgentId; message: string; at: number }
  | {
      type: "agent_finished";
      agent: AgentId;
      durationMs: number;
      at: number;
      usedMockLlm: boolean;
    }
  | { type: "agent_failed"; agent: AgentId; error: string; at: number }
  | { type: "case_updated"; patch: Partial<UnderwritingCase>; at: number }
  | {
      type: "run_finished";
      runId: string;
      durationMs: number;
      at: number;
      traces: AgentTrace[];
    }
  | { type: "run_failed"; runId: string; error: string; at: number };

export interface UnderwritingRunResult {
  runId: string;
  case: UnderwritingCase;
  traces: AgentTrace[];
  durationMs: number;
  startedAt: number;
  finishedAt: number;
}
