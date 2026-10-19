"use client";
import GuestSignup from "@/components/marketplace/GuestSignup";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { ListingActions } from "@/components/marketplace/ListingActions";
import { useEffect, useState } from "react";
import { useFreelancerAvailability } from "@/hooks/useFreelancerAvailability";
import { getOwnFreelancerId } from "@/services/marketplace/freelancerAvailability";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  Clock3,
  MapPin,
  Wallet,
} from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
export default function MarketplaceJobDetails({
  guest = false,
}: {
  guest?: boolean;
}) {
  const [signup, setSignup] = useState(false);
  const [freelancerId, setFreelancerId] = useState<string | null>(null);
  const availability = useFreelancerAvailability(
    freelancerId ? [freelancerId] : [],
  );
  const fullyBooked = availability.get(freelancerId ?? "") === false;
  useEffect(() => {
    let alive = true;
    if (!guest)
      void getOwnFreelancerId()
        .then((id) => {
          if (alive) setFreelancerId(id);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
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
  if (
    !guest &&
    application &&
    ["accepted", "rejected"].includes(application.status)
  ) {
    const discussing = application.status === "accepted";
    return (
      <div className="mx-auto max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>
              {discussing
                ? "This job is under discussion"
                : "This application was declined"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              {discussing
                ? "Continue this opportunity from your project workspace."
                : "This job is no longer part of your active opportunities. Your application record is preserved."}
            </p>
            <div className="flex flex-wrap gap-2">
              {discussing && (
                <Button asChild>
                  <Link href="/home/projects">Open Projects</Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href="/home/marketplace">Browse marketplace</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  return (
    <div className="mx-auto grid max-w-6xl items-start gap-5 break-words lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
      <GuestSignup open={signup} onOpenChange={setSignup} />
      <Button asChild variant="outline" className="w-fit lg:col-span-2">
        <Link href={guest ? "/marketplace" : "/home/marketplace"}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          Back
        </Link>
      </Button>
      <div className="space-y-5">
        <Card className="gap-0 overflow-hidden p-0">
          <CardHeader className="border-b bg-muted/35 pb-5 pt-5 sm:px-6 sm:pt-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={job.status === "open" ? "default" : "secondary"}
                  >
                    {job.status === "open"
                      ? "Open for applications"
                      : job.status}
                  </Badge>
                  <Badge variant="outline">
                    {job.category?.name ?? "Job opportunity"}
                  </Badge>
                </div>
                <CardTitle className="text-2xl leading-tight sm:text-3xl">
                  {job.title}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Posted{" "}
                  {new Date(job.created_at).toLocaleDateString("en-PH", {
                    timeZone: "Asia/Manila",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
              <div className="shrink-0">
                <ListingActions
                  kind="job"
                  id={job.job_id}
                  onRequireAccount={guest ? () => setSignup(true) : undefined}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-background p-4">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Wallet className="size-4 text-primary" /> Budget
                </p>
                <p className="mt-2 font-semibold">
                  {job.pricing_type === "hourly" &&
                  job.budget_min !== job.budget_max
                    ? `PHP ${job.budget_min.toLocaleString()}–${job.budget_max.toLocaleString()}`
                    : `PHP ${job.budget_max.toLocaleString()}`}
                </p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">
                  {job.pricing_type}
                </p>
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="size-4 text-primary" /> Deadline
                </p>
                <p className="mt-2 font-semibold">
                  {job.deadline
                    ? new Date(job.deadline).toLocaleDateString("en-PH", {
                        timeZone: "Asia/Manila",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "Flexible"}
                </p>
                {job.deadline && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(job.deadline).toLocaleTimeString("en-PH", {
                      timeZone: "Asia/Manila",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
              <div className="rounded-xl border bg-background p-4">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock3 className="size-4 text-primary" /> Project type
                </p>
                <p className="mt-2 font-semibold">
                  {job.pricing_type === "hourly" ? "Hourly" : "Fixed price"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Propose your delivery time
                </p>
              </div>
            </div>
            <section
              aria-labelledby="job-description-heading"
              className="space-y-3"
            >
              <div>
                <h2
                  id="job-description-heading"
                  className="text-lg font-semibold"
                >
                  Project details
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Description and requirements from the client
                </p>
              </div>
              <p className="whitespace-pre-wrap leading-7 text-foreground/90">
                {job.description ||
                  "The client has not added a description yet."}
              </p>
            </section>
            <section
              className="rounded-xl border bg-muted/20 p-4 sm:p-5"
              aria-label="Client information"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-12">
                    <AvatarImage
                      src={job.client?.profile?.avatar_url ?? undefined}
                      alt=""
                    />
                    <AvatarFallback>
                      {(
                        job.client?.profile?.display_name?.[0] ?? "C"
                      ).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Posted by</p>
                    <p className="truncate font-semibold">
                      {job.client?.profile?.display_name ||
                        [
                          job.client?.profile?.first_name,
                          job.client?.profile?.last_name,
                        ]
                          .filter(Boolean)
                          .join(" ") ||
                        "Client"}
                    </p>
                    {job.client?.profile?.location && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3.5" />
                        {job.client.profile.location}
                      </p>
                    )}
                  </div>
                </div>
                {job.client?.user_id ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/home/profile/${job.client.user_id}`}>
                      View client profile
                    </Link>
                  </Button>
                ) : guest ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSignup(true)}
                  >
                    View client profile
                  </Button>
                ) : null}
              </div>
            </section>
          </CardContent>
        </Card>
      </div>
      <Card className="lg:sticky lg:top-6">
        <CardHeader className="space-y-2">
          <CardTitle>Send a proposal</CardTitle>
          <p className="text-sm text-muted-foreground">
            Share your approach, price, and timeline with the client.
          </p>
          {fullyBooked && (
            <p role="status" className="text-sm text-destructive">
              You are fully booked. Finish or cancel an existing commitment
              before applying for more work.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {guest ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Create an account to send a proposal and track the discussion.
              </p>
              <Button className="w-full" onClick={() => setSignup(true)}>
                Create an account to apply
              </Button>
            </div>
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
                  {busy ? "Cancelling..." : "Cancel application"}
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
                  rows={7}
                  placeholder="Describe your experience, proposed approach, and how you will meet the deadline."
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
                disabled={
                  busy ||
                  fullyBooked ||
                  !applicationReady ||
                  job.status !== "open"
                }
              >
                {busy ? "Submitting..." : "Submit application"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
