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

/**
 * Ports for the external systems this application depends on.
 *
 * Every method returns its own `DataSource` provenance record alongside the
 * payload, because the explanation dashboard has to be able to say *where* a
 * risk factor came from and *when* it was pulled. A vendor swap is a new class
 * implementing these interfaces plus one line in `registry.ts`.
 */

export interface Sourced<T> {
  data: T | undefined;
  source: DataSource;
}

/** Credit-based insurance scoring bureau (e.g. LexisNexis, TransUnion). */
export interface CreditBureauPort {
  readonly name: string;
  fetchInsuranceScore(applicant: Applicant): Promise<Sourced<CreditRiskSignal>>;
}

/** Motor vehicle records provider. */
export interface MvrPort {
  readonly name: string;
  fetchMvr(applicant: Applicant): Promise<Sourced<MotorVehicleRecord>>;
}

/** Industry claims exchange (e.g. CLUE / A-PLUS). */
export interface ClaimsExchangePort {
  readonly name: string;
  fetchClaims(applicant: Applicant): Promise<Sourced<ClaimsHistoryRecord[]>>;
}

/** Geospatial peril and crime scoring. */
export interface GeospatialPort {
  readonly name: string;
  fetchExposure(applicant: Applicant): Promise<Sourced<CatastropheExposure>>;
}

/** Clinical/prescription aggregator for life underwriting. */
export interface ClinicalPort {
  readonly name: string;
  fetchMedicalSummary(
    applicant: Applicant,
    application: Application,
  ): Promise<Sourced<MedicalSummary>>;
}

/** Policy administration system of record. */
export interface PolicyAdminPort {
  readonly name: string;
  listApplications(): Promise<Application[]>;
  listApplicants(): Promise<Applicant[]>;
  getApplication(id: string): Promise<Application | undefined>;
  getApplicant(id: string): Promise<Applicant | undefined>;
}

export interface IntegrationRegistry {
  credit: CreditBureauPort;
  mvr: MvrPort;
  claims: ClaimsExchangePort;
  geospatial: GeospatialPort;
  clinical: ClinicalPort;
  policyAdmin: PolicyAdminPort;
}
