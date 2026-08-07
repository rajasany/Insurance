import { NextResponse } from "next/server";
import { listCustomers } from "@/lib/data/customers";
import { labelFor } from "@/lib/data/groundTruth";

export const runtime = "nodejs";

export async function GET() {
  const customers = listCustomers().map((customer) => ({
    ...customer,
    applications: customer.applications.map((application) => ({
      ...application,
      // The baseline cycle time is what the "before" side of the time metric is
      // measured against, so the queue view shows it inline.
      baselineManualMinutes: labelFor(application.id)?.baselineManualMinutes ?? null,
    })),
  }));

  return NextResponse.json({ customers });
}
