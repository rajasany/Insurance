import type { Applicant, Application, Customer } from "@/lib/domain/types";

/**
 * Seed book of business. Twelve applications spanning three lines, chosen so
 * the risk engine and the rules engine each get exercised across their full
 * range: clean preferred risks, thin-file applicants, a coastal home with an
 * old roof, a driver with a major violation, a large face-amount life case.
 *
 * In production this comes from the policy-admin adapter; the shape is
 * identical so swapping the source is a one-line change in `insuranceDb.ts`.
 */

const applicants: Applicant[] = [
  {
    id: "APP-1001",
    name: "Marisol Okonkwo",
    dateOfBirth: "1985-03-14",
    occupation: "Pediatric nurse",
    address: { line1: "418 Larkspur Ln", city: "Madison", state: "WI", postalCode: "53703" },
    yearsInsured: 16,
    annualIncome: 104000,
    maritalStatus: "married",
    householdSize: 4,
    tobaccoUse: false,
  },
  {
    id: "APP-1002",
    name: "Desmond Reyes",
    dateOfBirth: "1999-11-02",
    occupation: "Rideshare driver",
    address: { line1: "77 Halsted St Apt 3B", city: "Chicago", state: "IL", postalCode: "60607" },
    yearsInsured: 2,
    annualIncome: 41000,
    maritalStatus: "single",
    householdSize: 1,
    tobaccoUse: true,
  },
  {
    id: "APP-1003",
    name: "Ingrid Halvorsen",
    dateOfBirth: "1962-07-28",
    occupation: "Structural engineer",
    address: { line1: "2205 Bayshore Dr", city: "Naples", state: "FL", postalCode: "34102" },
    yearsInsured: 34,
    annualIncome: 218000,
    maritalStatus: "widowed",
    householdSize: 1,
    tobaccoUse: false,
  },
  {
    id: "APP-1004",
    name: "Terrence Baptiste",
    dateOfBirth: "1978-01-09",
    occupation: "Restaurant owner",
    address: { line1: "1130 Magazine St", city: "New Orleans", state: "LA", postalCode: "70130" },
    yearsInsured: 21,
    annualIncome: 156000,
    maritalStatus: "married",
    householdSize: 5,
    tobaccoUse: false,
  },
  {
    id: "APP-1005",
    name: "Priya Ramanathan",
    dateOfBirth: "1991-05-21",
    occupation: "Software engineer",
    address: { line1: "615 Alma St", city: "Palo Alto", state: "CA", postalCode: "94301" },
    yearsInsured: 9,
    annualIncome: 265000,
    maritalStatus: "domestic_partner",
    householdSize: 2,
    tobaccoUse: false,
  },
  {
    id: "APP-1006",
    name: "Walter Kaminski",
    dateOfBirth: "1955-09-30",
    occupation: "Retired machinist",
    address: { line1: "94 Sycamore Rd", city: "Erie", state: "PA", postalCode: "16501" },
    yearsInsured: 41,
    annualIncome: 52000,
    maritalStatus: "married",
    householdSize: 2,
    tobaccoUse: true,
  },
  {
    id: "APP-1007",
    name: "Camille Beauchamp",
    dateOfBirth: "1988-12-05",
    occupation: "Commercial pilot",
    address: { line1: "3301 Turtle Creek Blvd", city: "Dallas", state: "TX", postalCode: "75219" },
    yearsInsured: 12,
    annualIncome: 189000,
    maritalStatus: "divorced",
    householdSize: 2,
    tobaccoUse: false,
  },
  {
    id: "APP-1008",
    name: "Yusuf Abdi",
    dateOfBirth: "2001-06-18",
    occupation: "Graduate student",
    address: { line1: "812 University Ave", city: "Minneapolis", state: "MN", postalCode: "55414" },
    yearsInsured: 0,
    annualIncome: 28000,
    maritalStatus: "single",
    householdSize: 1,
    tobaccoUse: false,
  },
];

const applications: Application[] = [
  {
    id: "SUB-24001",
    applicantId: "APP-1001",
    line: "auto",
    requestedCoverage: 300000,
    requestedDeductible: 1000,
    submittedAt: "2026-07-28T14:02:00Z",
    auto: {
      vehicleYear: 2022,
      vehicleMake: "Subaru",
      vehicleModel: "Outback",
      annualMileage: 9500,
      primaryUse: "commute",
      garaged: true,
      antiTheft: true,
    },
    notes: "Long-tenured customer moving over from a competitor at renewal.",
  },
  {
    id: "SUB-24002",
    applicantId: "APP-1001",
    line: "home",
    requestedCoverage: 480000,
    requestedDeductible: 2500,
    submittedAt: "2026-07-28T14:06:00Z",
    home: {
      yearBuilt: 2004,
      squareFeet: 2450,
      construction: "frame",
      roofAgeYears: 6,
      dwellingValue: 495000,
      distanceToHydrantFt: 220,
      distanceToCoastMiles: 900,
      hasMonitoredAlarm: true,
    },
  },
  {
    id: "SUB-24003",
    applicantId: "APP-1002",
    line: "auto",
    requestedCoverage: 100000,
    requestedDeductible: 500,
    submittedAt: "2026-07-30T09:41:00Z",
    auto: {
      vehicleYear: 2016,
      vehicleMake: "Nissan",
      vehicleModel: "Altima",
      annualMileage: 34000,
      primaryUse: "business",
      garaged: false,
      antiTheft: false,
    },
    notes: "Applicant states vehicle is used for rideshare 5 days a week.",
  },
  {
    id: "SUB-24004",
    applicantId: "APP-1003",
    line: "home",
    requestedCoverage: 1250000,
    requestedDeductible: 5000,
    submittedAt: "2026-07-29T11:15:00Z",
    home: {
      yearBuilt: 1978,
      squareFeet: 3800,
      construction: "masonry",
      roofAgeYears: 19,
      dwellingValue: 1310000,
      distanceToHydrantFt: 410,
      distanceToCoastMiles: 0.4,
      hasMonitoredAlarm: true,
      priorRenovationYear: 2011,
    },
    notes: "Coastal property. Prior carrier non-renewed for wind exposure.",
  },
  {
    id: "SUB-24005",
    applicantId: "APP-1003",
    line: "umbrella",
    requestedCoverage: 3000000,
    requestedDeductible: 0,
    submittedAt: "2026-07-29T11:22:00Z",
  },
  {
    id: "SUB-24006",
    applicantId: "APP-1004",
    line: "life",
    requestedCoverage: 1500000,
    requestedDeductible: 0,
    submittedAt: "2026-08-01T16:30:00Z",
    life: {
      faceAmount: 1500000,
      termYears: 20,
      heightInches: 70,
      weightPounds: 232,
      familyHistory: ["type 2 diabetes (father)", "hypertension (mother)"],
      conditions: ["prediabetes"],
    },
    notes: "Business owner; face amount supports a buy-sell agreement.",
  },
  {
    id: "SUB-24007",
    applicantId: "APP-1004",
    line: "home",
    requestedCoverage: 620000,
    requestedDeductible: 2500,
    submittedAt: "2026-08-01T16:44:00Z",
    home: {
      yearBuilt: 1926,
      squareFeet: 2900,
      construction: "frame",
      roofAgeYears: 3,
      dwellingValue: 640000,
      distanceToHydrantFt: 150,
      distanceToCoastMiles: 42,
      hasMonitoredAlarm: false,
      priorRenovationYear: 2019,
    },
  },
  {
    id: "SUB-24008",
    applicantId: "APP-1005",
    line: "life",
    requestedCoverage: 2000000,
    requestedDeductible: 0,
    submittedAt: "2026-08-02T08:12:00Z",
    life: {
      faceAmount: 2000000,
      termYears: 30,
      heightInches: 65,
      weightPounds: 132,
      familyHistory: [],
      conditions: [],
    },
  },
  {
    id: "SUB-24009",
    applicantId: "APP-1006",
    line: "life",
    requestedCoverage: 250000,
    requestedDeductible: 0,
    submittedAt: "2026-08-03T13:05:00Z",
    life: {
      faceAmount: 250000,
      termYears: 15,
      heightInches: 69,
      weightPounds: 248,
      familyHistory: ["myocardial infarction (father, age 58)"],
      conditions: ["hypertension", "COPD"],
    },
    notes: "Current smoker, ~1 pack/day for 30 years.",
  },
  {
    id: "SUB-24010",
    applicantId: "APP-1007",
    line: "auto",
    requestedCoverage: 500000,
    requestedDeductible: 1000,
    submittedAt: "2026-08-04T10:50:00Z",
    auto: {
      vehicleYear: 2024,
      vehicleMake: "BMW",
      vehicleModel: "M340i",
      annualMileage: 14000,
      primaryUse: "pleasure",
      garaged: true,
      antiTheft: true,
    },
    notes: "High-performance vehicle. MVR shows a recent major violation.",
  },
  {
    id: "SUB-24011",
    applicantId: "APP-1008",
    line: "auto",
    requestedCoverage: 50000,
    requestedDeductible: 1000,
    submittedAt: "2026-08-05T15:20:00Z",
    auto: {
      vehicleYear: 2009,
      vehicleMake: "Honda",
      vehicleModel: "Civic",
      annualMileage: 6200,
      primaryUse: "pleasure",
      garaged: false,
      antiTheft: false,
    },
    notes: "First-time buyer, no prior insurance history.",
  },
  {
    id: "SUB-24012",
    applicantId: "APP-1005",
    line: "home",
    requestedCoverage: 1900000,
    requestedDeductible: 5000,
    submittedAt: "2026-08-06T09:00:00Z",
    home: {
      yearBuilt: 1998,
      squareFeet: 2600,
      construction: "mixed",
      roofAgeYears: 11,
      dwellingValue: 1950000,
      distanceToHydrantFt: 180,
      distanceToCoastMiles: 26,
      hasMonitoredAlarm: true,
    },
    notes: "Wildfire-exposed ZIP per the geospatial feed.",
  },
];

export function listApplicants(): Applicant[] {
  return applicants;
}

export function listApplications(): Application[] {
  return applications;
}

export function getApplicant(id: string): Applicant | undefined {
  return applicants.find((a) => a.id === id);
}

export function getApplication(id: string): Application | undefined {
  return applications.find((a) => a.id === id);
}

export function listCustomers(): Customer[] {
  return applicants.map((applicant) => ({
    applicant,
    applications: applications.filter((app) => app.applicantId === applicant.id),
  }));
}

export function getCustomer(applicantId: string): Customer | undefined {
  const applicant = getApplicant(applicantId);
  if (!applicant) return undefined;
  return {
    applicant,
    applications: applications.filter((app) => app.applicantId === applicantId),
  };
}

/** Age in whole years as of `asOf`, used by the rating and rules engines. */
export function ageOf(applicant: Applicant, asOf = new Date("2026-08-07T00:00:00Z")): number {
  const dob = new Date(applicant.dateOfBirth);
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = asOf.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}
