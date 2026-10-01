"use client";
import GuestSignup from "@/components/marketplace/GuestSignup";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { ListingActions } from "@/components/marketplace/ListingActions";
import { useEffect, useState } from "react";
import { useFreelancerAvailability } from "@/hooks/useFreelancerAvailability";
import { getOwnFreelancerId } from "@/services/marketplace/freelancerAvailability";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  getMarketplaceJob,
  type MarketplaceJob,
} from "@/services/marketplace/MarketplaceServices";
import { applyForJob } from "@/services/marketplace/listingActions";
import {
  getOwnJobApplication,
  canReapply,
  cancelJobApplication,
  type OwnJobApplication,
} from "@/services/marketplace/jobApplicationState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
export default function MarketplaceJobDetails({
  guest = false,
}: {
  guest?: boolean;
}) {
  const [signup, setSignup] = useState(false);
  const [freelancerId, setFreelancerId] = useState<string | null>(null);
  const availability = useFreelancerAvailability(freelancerId ? [freelancerId] : []);
  const fullyBooked = availability.get(freelancerId ?? "") === false;
  useEffect(() => {
    let alive = true;
    if (!guest) void getOwnFreelancerId().then(id => { if (alive) setFreelancerId(id); }).catch(() => {});
    return () => { alive = false; };
  }, [guest]);
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<MarketplaceJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState("");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [application, setApplication] = useState<OwnJobApplication | null>(
    null,
  );
  const [applicationReady, setApplicationReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      getMarketplaceJob(jobId, guest),
      guest ? Promise.resolve(null) : getOwnJobApplication(jobId),
    ])
      .then(([data, own]) => {
        if (alive) {
          setJob(data);
          setApplication(own);
          setApplicationReady(true);
        }
      })
      .catch((cause) => {
        if (alive) setError(cause.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [jobId, guest]);
  if (loading) return <ContentSkeleton label="Loading job" variant="job" />;
  if (!job) return <p role="alert">{error || "Job not found."}</p>;
  return (
    <div className="mx-auto grid max-w-6xl items-start gap-5 break-words lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <GuestSignup open={signup} onOpenChange={setSignup} />
      <Button asChild variant="default" className="w-fit lg:col-span-2">
        <Link href={guest ? "/marketplace" : "/home/marketplace"}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          Back
        </Link>
      </Button>
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <CardTitle className="min-w-0 flex-1">{job.title}</CardTitle>
            <div className="shrink-0">
              {" "}
              <ListingActions
                kind="job"
                id={job.job_id}
                onRequireAccount={guest ? () => setSignup(true) : undefined}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap border-b pb-4">{job.description}</p>
          <p>
            Budget: PHP {job.budget_min.toLocaleString()} –{" "}
            {job.budget_max.toLocaleString()} ({job.pricing_type})
          </p>
          <p>
            Deadline:{" "}
            {job.deadline
              ? new Date(job.deadline).toLocaleString()
              : "Flexible"}
          </p>
          <p className="border-b pb-4">Status: {job.status}</p>

          {guest && (
            <Button variant="link" onClick={() => setSignup(true)}>
              View client profile
            </Button>
          )}
          {job.client?.user_id && (
            <Link
              className="text-primary underline"
              href={`/home/profile/${job.client.user_id}`}
            >
              View client profile
            </Link>
          )}
        </CardContent>
      </Card>
      <Card className="lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle>Apply for this job</CardTitle>
          {fullyBooked && <p role="status" className="text-sm text-destructive">You’re fully booked. Finish or cancel an existing commitment before applying for more work.</p>}
        </CardHeader>
        <CardContent>
          {guest ? (
            <Button onClick={() => setSignup(true)}>Apply for this job</Button>
          ) : application && !canReapply(application.status) ? (
            <div className="space-y-3" role="status">
              <Badge
                variant={
                  application.status === "rejected"
                    ? "destructive"
                    : "secondary"
                }
              >
                {application.status === "rejected"
                  ? "Application rejected"
                  : application.status === "accepted"
                    ? "In discussion"
                    : "Application submitted"}
              </Badge>
              <p>
                {application.status === "rejected"
                  ? "The client rejected your application for this job. You cannot submit another application."
                  : "You have already applied to this job. Track your application in Projects."}
              </p>
              <Link href="/home/projects" className="block underline">
                View application
              </Link>
              {["pending", "in_review"].includes(application.status) && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const status = await cancelJobApplication(
                        application.application_id,
                      );
                      setApplication({ ...application, status });
                      setSent(false);
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "Unable to cancel application.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Cancelling…" : "Cancel application"}
                </Button>
              )}
              {error && (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              )}
            </div>
          ) : sent ? (
            <p role="status">
              Application submitted.{" "}
              <Link className="underline" href="/home/projects">
                Track your application in Projects.
              </Link>
            </p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                setBusy(true);
                setError("");
                try {
                  const applicationId = await applyForJob(
                    jobId,
                    proposal,
                    Number(price),
                    Number(days),
                  );
                  setSent(true);
                  setApplication({
                    application_id: applicationId,
                    status: "pending",
                  });
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Unable to submit application.",
                  );
                  try {
                    setApplication(await getOwnJobApplication(jobId));
                  } catch {
                    /* Keep the original submission error. */
                  }
                } finally {
                  setBusy(false);
                }
              }}
            >
              {application && canReapply(application.status) && (
                <p role="status" className="text-sm text-muted-foreground">
                  Your previous application was cancelled. You can submit a new
                  proposal.
                </p>
              )}
              <label className="block text-sm">
                Proposal
                <Textarea
                  required
                  maxLength={10000}
                  value={proposal}
                  onChange={(e) => setProposal(e.target.value)}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Proposed price (PHP)
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Delivery days
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                  />
                </label>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                className="w-full"
                disabled={busy || fullyBooked || !applicationReady || job.status !== "open"}
              >
                {busy ? "Submitting…" : "Submit application"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
