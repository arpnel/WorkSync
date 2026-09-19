"use client";

import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

function date(value: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString()
    : "Not set";
}

export function ProjectContractDialog({
  project,
}: {
  project: ProjectWorkspace;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <FileText className="h-4 w-4" />
          Agreed scope & contract
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Agreed scope & contract</DialogTitle>
          <DialogDescription>
            The agreement and delivery details for {project.title}.
          </DialogDescription>
        </DialogHeader>
        <article className="min-w-0 space-y-6 break-words text-sm leading-7">
          <div>
            <h2 className="text-xl font-semibold">{project.title}</h2>
            <p className="capitalize text-muted-foreground">
              {project.type} project
              {project.categoryName ? ` · ${project.categoryName}` : ""}
            </p>
          </div>
          <section className="space-y-2 border-t pt-4">
            <h3 className="font-semibold">Participants & scope</h3>
            <p>
              <strong>Client:</strong> {project.clientName}
              <br />
              <strong>Freelancer:</strong> {project.freelancerName}
            </p>
            <p className="whitespace-pre-wrap">
              {project.description || "No description provided."}
            </p>
            {project.terms && project.terms !== project.description && (
              <p className="whitespace-pre-wrap">{project.terms}</p>
            )}
          </section>
          <section className="space-y-2 border-t pt-4">
            <h3 className="font-semibold">Price & delivery</h3>
            <dl className="divide-y">
              {[
                [
                  "Agreed amount",
                  `PHP ${project.budget.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
                ],
                [
                  "Delivery period",
                  project.deliveryDays == null
                    ? "Not set"
                    : `${project.deliveryDays} days`,
                ],
                [
                  "Included revisions",
                  project.revisions == null
                    ? "Not set"
                    : String(project.revisions),
                ],
                ["Work started", date(project.startDate)],
                ["Delivery deadline", date(project.dueDate)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="grid gap-1 py-2 sm:grid-cols-[180px_1fr]"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          {project.milestones.length > 0 && (
            <section className="space-y-3 border-t pt-4">
              <h3 className="font-semibold">Agreed milestones</h3>
              <ol className="space-y-4">
                {project.milestones.map((milestone, index) => (
                  <li key={milestone.id}>
                    <h4 className="font-medium">
                      {index + 1}. {milestone.title}
                    </h4>
                    <p className="whitespace-pre-wrap">
                      {milestone.description}
                    </p>
                    <p className="text-muted-foreground">
                      PHP {milestone.amount.toLocaleString()} · Due{" "}
                      {date(milestone.dueDate)}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section className="space-y-2 border-t pt-4">
            <h3 className="font-semibold">Agreement confirmation</h3>
            <p>Request created: {date(project.createdAt)}</p>
            <p>
              Client confirmed:{" "}
              {project.clientSignedAt
                ? date(project.clientSignedAt)
                : "Awaiting confirmation"}
              <br />
              Freelancer confirmed:{" "}
              {project.freelancerSignedAt
                ? date(project.freelancerSignedAt)
                : "Awaiting confirmation"}
            </p>
          </section>
        </article>
      </DialogContent>
    </Dialog>
  );
}
