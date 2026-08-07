import Link from "next/link";
import { notFound } from "next/navigation";
import { UnderwritingWorkspace } from "@/components/UnderwritingWorkspace";
import { Chip } from "@/components/Badge";
import { agentRoster } from "@/lib/agents/orchestrator";
import { ageOf, getApplicant, getApplication, listApplications } from "@/lib/data/customers";
import { labelFor } from "@/lib/data/groundTruth";

export const dynamic = "force-dynamic";

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const application = getApplication(id);
  if (!application) notFound();
  const applicant = getApplicant(application.applicantId);
  if (!applicant) notFound();

  const siblings = listApplications().filter(
    (a) => a.applicantId === applicant.id && a.id !== application.id,
  );
  const label = labelFor(application.id);

  return (
    <div className="space-y-5">
      <nav className="text-xs ink-muted">
        <Link href="/" className="hover:underline">
          Submissions
        </Link>{" "}
        / {application.id}
      </nav>

      <header className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {applicant.name} · {application.id}
            </h1>
            <p className="mt-1 text-sm ink-secondary">
              {ageOf(applicant)}-year-old {applicant.occupation.toLowerCase()} in{" "}
              {applicant.address.city}, {applicant.address.state}. Household of{" "}
              {applicant.householdSize}, ${applicant.annualIncome.toLocaleString()} stated income,{" "}
              {applicant.yearsInsured} year{applicant.yearsInsured === 1 ? "" : "s"} of prior
              coverage.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Chip>{application.line}</Chip>
              <Chip>${application.requestedCoverage.toLocaleString()} requested</Chip>
              {application.requestedDeductible > 0 ? (
                <Chip>${application.requestedDeductible.toLocaleString()} deductible</Chip>
              ) : null}
              {applicant.tobaccoUse ? <Chip>Tobacco user</Chip> : null}
              {label ? <Chip>{label.baselineManualMinutes} min manual baseline</Chip> : null}
            </div>
          </div>

          {siblings.length > 0 ? (
            <div className="text-xs">
              <p className="font-semibold">Other submissions</p>
              <ul className="mt-1 space-y-0.5">
                {siblings.map((s) => (
                  <li key={s.id}>
                    <Link href={`/submissions/${s.id}`} className="ink-secondary hover:underline">
                      {s.id} · {s.line} · ${s.requestedCoverage.toLocaleString()}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {application.notes ? (
          <p className="mt-3 border-t pt-3 text-sm ink-secondary">
            <span className="font-medium">Producer note: </span>
            {application.notes}
          </p>
        ) : null}
      </header>

      <UnderwritingWorkspace
        applicant={applicant}
        application={application}
        roster={agentRoster()}
      />
    </div>
  );
}
