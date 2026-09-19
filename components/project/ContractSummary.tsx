import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

function date(value: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString()
    : "Not set";
}

export function ContractSummary({ project }: { project: ProjectWorkspace }) {
  const agreedAt =
    project.clientSignedAt && project.freelancerSignedAt
      ? new Date(
          Math.max(
            Date.parse(project.clientSignedAt),
            Date.parse(project.freelancerSignedAt),
          ),
        ).toISOString()
      : null;
  return (
    <Card id="contract" className="scroll-mt-6 break-words">
      <CardHeader>
        <CardTitle>Contract · {project.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="whitespace-pre-wrap text-sm leading-6">
          {project.description || "No description provided."}
        </p>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Client", project.clientName],
            ["Freelancer", project.freelancerName],
            ["Agreed amount", `PHP ${project.budget.toLocaleString()}`],
            ["Request created", date(project.createdAt)],
            [
              "Client confirmed",
              project.clientSignedAt
                ? date(project.clientSignedAt)
                : "Awaiting confirmation",
            ],
            [
              "Freelancer confirmed",
              project.freelancerSignedAt
                ? date(project.freelancerSignedAt)
                : "Awaiting confirmation",
            ],
            [
              "Both parties agreed",
              agreedAt ? date(agreedAt) : "Awaiting both confirmations",
            ],
            ["Work started", date(project.startDate)],
            ["Delivery deadline", date(project.dueDate)],
            [
              "Delivery",
              project.deliveryDays == null
                ? "Not set"
                : `${project.deliveryDays} days`,
            ],
            [
              "Revisions",
              project.revisions == null ? "Not set" : String(project.revisions),
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="min-w-0 rounded-xl border bg-muted/20 p-3"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
