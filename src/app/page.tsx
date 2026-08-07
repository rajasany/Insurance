import Link from "next/link";
import { ageOf, listCustomers } from "@/lib/data/customers";
import { labelFor } from "@/lib/data/groundTruth";
import { Chip } from "@/components/Badge";

export const dynamic = "force-dynamic";

const LINE_LABEL: Record<string, string> = {
  auto: "Auto",
  home: "Home",
  life: "Life",
  umbrella: "Umbrella",
};

export default function SubmissionQueue() {
  const customers = listCustomers();
  const submissions = customers.flatMap((c) =>
    c.applications.map((a) => ({ applicant: c.applicant, application: a })),
  );

  const baselineTotal = submissions.reduce(
    (sum, s) => sum + (labelFor(s.application.id)?.baselineManualMinutes ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Submission queue</h1>
        <p className="mt-1 max-w-prose text-sm ink-secondary">
          {submissions.length} open submissions across {customers.length} customers. Current-state
          manual handling for this queue is {baselineTotal} minutes; open a submission to run the
          agent pipeline against it.
        </p>
      </header>

      <div className="card scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>Submission</th>
              <th>Applicant</th>
              <th>Line</th>
              <th className="text-right">Requested</th>
              <th className="text-right">Deductible</th>
              <th className="text-right">Manual baseline</th>
              <th>Submitted</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {submissions.map(({ applicant, application }) => {
              const label = labelFor(application.id);
              return (
                <tr key={application.id}>
                  <td className="font-medium tnum">{application.id}</td>
                  <td>
                    <div className="font-medium">{applicant.name}</div>
                    <div className="text-xs ink-muted">
                      {ageOf(applicant)} · {applicant.occupation} · {applicant.address.city},{" "}
                      {applicant.address.state}
                    </div>
                  </td>
                  <td>
                    <Chip>{LINE_LABEL[application.line]}</Chip>
                  </td>
                  <td className="text-right tnum">
                    ${application.requestedCoverage.toLocaleString()}
                  </td>
                  <td className="text-right tnum ink-secondary">
                    {application.requestedDeductible > 0
                      ? `$${application.requestedDeductible.toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="text-right tnum ink-secondary">
                    {label ? `${label.baselineManualMinutes} min` : "—"}
                  </td>
                  <td className="text-xs ink-muted tnum">
                    {application.submittedAt.replace("T", " ").slice(0, 16)}
                  </td>
                  <td className="text-right">
                    <Link className="btn !px-2.5 !py-1 !text-xs" href={`/submissions/${application.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
