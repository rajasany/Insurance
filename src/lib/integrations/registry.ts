import {
  MockClaimsExchange,
  MockClinicalProvider,
  MockCreditBureau,
  MockGeospatialProvider,
  MockMvrProvider,
  MockPolicyAdmin,
} from "./mock";
import type { IntegrationRegistry } from "./types";

/**
 * Single wiring point for the external systems.
 *
 * Swapping in a live vendor means constructing a real client here; nothing
 * upstream of this file knows which implementation it is talking to.
 */
let registry: IntegrationRegistry | null = null;

export function getIntegrations(): IntegrationRegistry {
  if (!registry) {
    registry = {
      credit: new MockCreditBureau(),
      mvr: new MockMvrProvider(),
      claims: new MockClaimsExchange(),
      geospatial: new MockGeospatialProvider(),
      clinical: new MockClinicalProvider(),
      policyAdmin: new MockPolicyAdmin(),
    };
  }
  return registry;
}

/** Test/eval seam for injecting alternate implementations. */
export function setIntegrations(next: IntegrationRegistry): void {
  registry = next;
}
