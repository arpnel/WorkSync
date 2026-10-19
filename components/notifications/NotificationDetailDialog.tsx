"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  BellRing,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  FileCheck2,
  MessageCircle,
  Tag,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getPublicIdentities } from "@/services/profile/publicIdentityService";
import { respondToServiceRequest } from "@/services/project/projectService";
import { listMyAssessments } from "@/services/assessments/assessmentService";
import { markNotificationUnread } from "@/services/notification/notificationService";
import type { NotificationRecord } from "@/services/notification/notificationService";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Detail = {
  sender?: string;
  avatar?: string | null;
  senderSubtitle?: string;
  title?: string;
  body?: string;
  budget?: string;
  projectBudget?: string;
  delivery?: string;
  projectType?: string;
  dueDate?: string;
  status?: string;
  proposal?: string;
  href?: string;
  action?: string;
  requestPending?: boolean;
  steps?: Array<{
    id: string;
    title: string;
    status: string;
    dueDate?: string;
  }>;
};
const initials = (name?: string) =>
  name
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "WS";
const displayName = (profile?: {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}) =>
  profile?.display_name ||
  [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
  undefined;

export function NotificationDetailDialog({
  item,
  onClose,
  inline = false,
}: {
  item: NotificationRecord;
  onClose: () => void;
  inline?: boolean;
}) {
  const [detail, setDetail] = useState<Detail>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [responding, setResponding] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [responseSaved, setResponseSaved] = useState(false);
  const type = item.type ?? "";
  const lowerTitle = item.title.toLowerCase();
  const isMessage = type.includes("message");
  const isDeclined =
    lowerTitle.includes("declined") || lowerTitle.includes("rejected");
  const isSelectedApplication =
    type.includes("application") &&
    /selected|discussion|accepted/.test(lowerTitle) &&
    !isDeclined;
  const isDeadline =
    /deadline|due date/.test(lowerTitle) || type.includes("deadline");
  const isRequest = type === "service_request" && lowerTitle.includes("new");
  const kind = isMessage
    ? "Message"
    : isDeadline
      ? "Deadline"
      : isDeclined
        ? "Application update"
        : isRequest
          ? "Custom order request"
          : /application/.test(type)
            ? "Application"
            : /service/.test(type)
              ? "Request"
              : /agreement|contract/.test(type)
                ? "Agreement"
                : /project|milestone/.test(type)
                  ? "Project update"
                  : "Notification";
  const Icon = isMessage
    ? MessageCircle
    : isDeadline
      ? Clock3
      : isDeclined
        ? AlertCircle
        : isRequest
          ? FileCheck2
          : /project|service|application/.test(type)
            ? BriefcaseBusiness
            : BellRing;
  const tone = isDeadline
    ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300"
    : isDeclined
      ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
      : isMessage
        ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
        : "border-primary/15 bg-primary/[0.04] text-primary";

  useEffect(() => {
    let alive = true;
    async function load(): Promise<Detail> {
      const id = item.relatedId;
      if (!id) return {};
      if (type === "skill_assessment") {
        const opening = (await listMyAssessments()).find(
          (row) => row.id === id,
        );
        if (!opening)
          return { body: "This assessment is unavailable for this account." };
        const closed =
          opening.status === "closed" || opening.attempt?.status === "expired";
        return {
          title: opening.category,
          body:
            (closed
              ? "Closed / expired"
              : opening.status === "scheduled"
                ? "Scheduled"
                : "Available") +
            "\nCloses " +
            new Date(opening.closesAt).toLocaleString(),
          href: "/home/assessments?opening=" + encodeURIComponent(id),
          action:
            opening.attempt?.status === "submitted"
              ? "View Result"
              : closed
                ? "View Assessment"
                : "Take Assessment",
        };
      }
      if (isMessage) {
        const message = await supabase
          .from("messages")
          .select("conversation_id,sender_id,message")
          .eq("message_id", id)
          .maybeSingle();
        if (message.error) throw message.error;
        const conversationId = message.data?.conversation_id ?? id;
        const conversation = await supabase
          .from("conversations")
          .select("conversation_id")
          .eq("conversation_id", conversationId)
          .maybeSingle();
        if (conversation.error) throw conversation.error;
        if (!conversation.data) return {};
        const identities = message.data?.sender_id
          ? await getPublicIdentities({ userIds: [message.data.sender_id] })
          : null;
        const sender = identities?.profiles[0];
        return {
          sender: displayName(sender),
          avatar: sender?.avatar_url,
          senderSubtitle: "WorkSync member",
          body: message.data?.message || item.description,
          href:
            "/home/messages?conversation=" + encodeURIComponent(conversationId),
          action:
            "Reply to " + (displayName(sender)?.split(" ")[0] || "message"),
        };
      }
      if (type.includes("application")) {
        const job = await supabase
          .from("jobs")
          .select("job_id,title,description,budget_min,budget_max,client_id")
          .eq("job_id", id)
          .maybeSingle();
        if (job.error || !job.data) {
          let href = "/home/projects?job=" + encodeURIComponent(id);
          try {
            const conversation = await supabase
              .from("conversations")
              .select("conversation_id")
              .eq("job_id", id)
              .limit(1)
              .maybeSingle();
            if (conversation.data?.conversation_id) {
              href =
                "/home/messages?conversation=" +
                encodeURIComponent(conversation.data.conversation_id);
            }
          } catch {
            // Keep the project link available when conversation lookup is unavailable.
          }
          return {
            href,
            action: "Open discussion",
          };
        }
        const auth = await supabase.auth.getUser();
        if (auth.error) throw auth.error;
        const [freelancer, client] = await Promise.all([
          supabase
            .from("freelancer_profiles")
            .select("freelancer_id")
            .eq("user_id", auth.data.user?.id ?? "")
            .maybeSingle(),
          getPublicIdentities({ clientIds: [job.data.client_id] }),
        ]);
        if (freelancer.error) throw freelancer.error;
        const clientIdentity = client.profiles[0];
        const appQuery = supabase
          .from("job_applications")
          .select("proposal,proposed_price,estimated_days,status,created_at")
          .eq("job_id", id);
        const appResult = freelancer.data
          ? await appQuery
              .eq("freelancer_id", freelancer.data.freelancer_id)
              .maybeSingle()
          : await appQuery
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
        if (appResult.error) throw appResult.error;
        const budget = job.data.budget_max ?? job.data.budget_min;
        let href = "/home/marketplace/jobs/" + encodeURIComponent(id);
        let action = isDeclined ? "Browse projects" : "View application";
        if (isSelectedApplication) {
          const conversation = await supabase
            .from("conversations")
            .select("conversation_id")
            .eq("job_id", id)
            .limit(1)
            .maybeSingle();
          if (conversation.error) throw conversation.error;
          if (conversation.data?.conversation_id) {
            href =
              "/home/messages?conversation=" +
              encodeURIComponent(conversation.data.conversation_id);
            action = "Continue discussion";
          } else {
            href = "/home/projects?filter=In%20Discussion";
            action = "View discussion";
          }
        }
        return {
          sender: displayName(clientIdentity),
          avatar: clientIdentity?.avatar_url,
          senderSubtitle: "Client",
          title: job.data.title,
          body: job.data.description || undefined,
          proposal: appResult.data?.proposal || undefined,
          dueDate: appResult.data?.created_at,
          budget:
            appResult.data?.proposed_price == null
              ? undefined
              : "PHP " + Number(appResult.data.proposed_price).toLocaleString(),
          projectBudget:
            budget == null
              ? undefined
              : "PHP " + Number(budget).toLocaleString(),
          delivery: appResult.data?.estimated_days
            ? appResult.data.estimated_days + " days"
            : undefined,
          status: appResult.data?.status,
          projectType: "Fixed Price",
          href,
          action,
        };
      }
      if (
        /service_request|project|contract|agreement|review|deadline/.test(
          type,
        ) ||
        isDeadline
      ) {
        const result = await supabase
          .from("service_orders")
          .select(
            "order_id,status,client_id,freelancer_id,services(title,description,price,service_type,delivery_time_days),contracts(terms,final_price,delivery_time_days),projects(project_id,title,description,budget,status,due_date,milestones(milestone_id,title,status,due_date,display_order))",
          )
          .eq("order_id", id)
          .maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) {
          if (!isDeadline) return {};
          const project = await supabase
            .from("projects")
            .select(
              "project_id,order_id,client_id,freelancer_id,title,description,budget,status,due_date,milestones(milestone_id,title,status,due_date,display_order)",
            )
            .eq("project_id", id)
            .maybeSingle();
          if (project.error) throw project.error;
          if (!project.data) return {};
          const p = project.data;
          const identities = await getPublicIdentities({
            clientIds: [p.client_id],
            freelancerIds: [p.freelancer_id],
          });
          const { data: session } = await supabase.auth.getSession();
          const sender = identities.profiles.find(
            (profile) => profile.user_id !== session.session?.user.id,
          );
          return {
            sender: displayName(sender),
            avatar: sender?.avatar_url,
            senderSubtitle: "Project",

            title: p.title,
            body: p.description || undefined,
            budget:
              p.budget == null
                ? undefined
                : "PHP " + Number(p.budget).toLocaleString(),
            dueDate: p.due_date,
            steps: Array.isArray(p.milestones)
              ? p.milestones
                  .sort((a, b) => a.display_order - b.display_order)
                  .map((step) => ({
                    id: step.milestone_id,
                    title: step.title,
                    status: step.status,
                    dueDate: step.due_date,
                  }))
              : [],
            status: p.status,
            href: "/home/projects/standard/" + encodeURIComponent(p.order_id),
            action: "View Project",
          };
        }
        const order = result.data;
        const service = Array.isArray(order.services)
          ? order.services[0]
          : order.services;
        const contract = Array.isArray(order.contracts)
          ? order.contracts[0]
          : order.contracts;
        const project = Array.isArray(order.projects)
          ? order.projects[0]
          : order.projects;
        const identities = await getPublicIdentities({
          clientIds: [order.client_id],
          freelancerIds: [order.freelancer_id],
        });
        const { data: session } = await supabase.auth.getSession();
        const sender = identities.profiles.find(
          (profile) => profile.user_id !== session.session?.user.id,
        );
        let terms: { projectTitle?: string; description?: string } = {};
        try {
          terms =
            typeof contract?.terms === "string"
              ? JSON.parse(contract.terms)
              : (contract?.terms ?? {});
        } catch {
          /* Older agreements can contain plain text. */
        }
        const price =
          contract?.final_price ?? service?.price ?? project?.budget;
        const days =
          contract?.delivery_time_days ?? service?.delivery_time_days;
        return {
          sender: displayName(sender),
          avatar: sender?.avatar_url,
          senderSubtitle:
            service?.service_type === "milestone"
              ? "Milestone Project"
              : "Custom Order",
          title: project?.title || terms.projectTitle || service?.title,
          body:
            project?.description ||
            terms.description ||
            service?.description ||
            undefined,
          budget:
            price == null ? undefined : "PHP " + Number(price).toLocaleString(),
          delivery: days ? days + " days" : undefined,
          projectType:
            service?.service_type === "milestone" ? "Milestone" : "Fixed Price",
          dueDate: project?.due_date,
          steps: Array.isArray(project?.milestones)
            ? project.milestones
                .sort((a, b) => a.display_order - b.display_order)
                .map((step) => ({
                  id: step.milestone_id,
                  title: step.title,
                  status: step.status,
                  dueDate: step.due_date,
                }))
            : [],
          status: project?.status || order.status,
          requestPending: isRequest && order.status === "pending",
          href:
            "/home/projects/" +
            (service?.service_type === "milestone" ? "milestone" : "standard") +
            "/" +
            encodeURIComponent(id),
          action: isDeadline
            ? "View Project"
            : isRequest
              ? "Review Request"
              : "View Project",
        };
      }
      return {};
    }
    void load()
      .then((value) => {
        if (alive) setDetail(value);
      })
      .catch((cause) => {
        if (alive)
          setError(
            cause instanceof Error
              ? cause.message
              : "Related details are unavailable.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [
    item,
    isDeadline,
    isMessage,
    isRequest,
    isDeclined,
    isSelectedApplication,
    type,
  ]);

  const received = new Date(item.createdAt);
  const respond = async (accept: boolean) => {
    if (!item.relatedId) return;
    setResponding(true);
    setError("");
    try {
      await respondToServiceRequest(item.relatedId, accept);
      setResponseSaved(true);
      setDetail((current) => ({
        ...current,
        requestPending: false,
        status: accept ? "accepted" : "declined",
      }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update this request.",
      );
    } finally {
      setResponding(false);
    }
  };
  const remindLater = async () => {
    setReminding(true);
    setError("");
    try {
      await markNotificationUnread(item.id);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save this reminder.",
      );
    } finally {
      setReminding(false);
    }
  };
  const dateText = (value?: string) =>
    value && !Number.isNaN(new Date(value).getTime())
      ? new Date(value).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Not available";

  const panel = (
    <>
      <SheetHeader className="shrink-0 border-b px-5 py-5 sm:px-9 lg:px-10">
        <div className="flex items-start gap-4">
          <span
            className={
              "flex size-12 shrink-0 items-center justify-center rounded-full border " +
              tone
            }
          >
            <Icon className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {inline ? (
                <h2 className="min-w-0 break-words text-lg font-semibold leading-snug sm:text-xl">
                  {item.title}
                </h2>
              ) : (
                <SheetTitle className="min-w-0 break-words text-lg font-semibold leading-snug sm:text-xl">
                  {item.title}
                </SheetTitle>
              )}
              <span
                className={
                  "rounded-full px-2 py-1 text-xs font-medium " +
                  (isDeclined || isDeadline
                    ? "bg-orange-100 text-orange-800"
                    : item.unread
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground")
                }
              >
                {isDeclined || isDeadline
                  ? "Important"
                  : item.unread
                    ? "New"
                    : kind}
              </span>
            </div>
            {inline ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDistanceToNow(received, { addSuffix: true })}
              </p>
            ) : (
              <SheetDescription className="mt-1">
                {formatDistanceToNow(received, { addSuffix: true })}
              </SheetDescription>
            )}
          </div>
        </div>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-9 sm:py-7 lg:px-10 @container">
        <div className={"flex gap-3 rounded-xl border p-4 " + tone}>
          <Icon className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">
              {isSelectedApplication
                ? "Your application was selected!"
                : isRequest
                  ? "You have a new custom order request!"
                  : isDeadline
                    ? "A project deadline is coming up."
                    : isDeclined
                      ? "Your application was not selected."
                      : isMessage
                        ? "You have a new message."
                        : item.title}
            </p>
            <p className="mt-1 text-sm opacity-80">
              {isSelectedApplication
                ? "The client would like to discuss your application. Review your proposal, then continue the conversation."
                : isDeclined
                  ? "Unfortunately, your proposal was not selected for this project. Keep applying; the right client is just around the corner."
                  : item.description ||
                    "Review the details below for more information."}
            </p>
          </div>
        </div>

        {detail.sender &&
          !isDeclined &&
          !isDeadline &&
          !isSelectedApplication && (
            <div className="flex items-center gap-3 border-b pb-5">
              <Avatar size="lg" className="size-14">
                <AvatarImage src={detail.avatar ?? undefined} alt="" />
                <AvatarFallback>{initials(detail.sender)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{detail.sender}</p>
                <p className="text-sm text-muted-foreground">
                  {detail.senderSubtitle || "WorkSync member"}
                </p>
              </div>
              {detail.status && (
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize">
                  {detail.status.replaceAll("_", " ")}
                </span>
              )}
            </div>
          )}

        {isMessage ? (
          <section className="space-y-4">
            {detail.title && (
              <div className="flex items-center justify-between gap-3 border-b pb-4">
                <div>
                  <p className="text-xs text-muted-foreground">Regarding</p>
                  <p className="mt-1 font-semibold">{detail.title}</p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/home/projects" onClick={onClose}>
                    View Project
                  </Link>
                </Button>
              </div>
            )}
            <div>
              <h3 className="mb-2 font-semibold">Message</h3>
              <div className="whitespace-pre-wrap rounded-xl bg-muted/50 p-4 text-sm leading-6">
                {detail.body || item.description}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {formatDistanceToNow(received, { addSuffix: true })}
              </p>
            </div>
          </section>
        ) : isSelectedApplication ? (
          <section className="mx-auto w-full max-w-2xl space-y-6">
            {(detail.sender || detail.title) && (
              <div className="rounded-xl border bg-card p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Discussion details
                </p>
                {detail.title && (
                  <h3 className="mt-2 break-words text-lg font-semibold">
                    {detail.title}
                  </h3>
                )}
                {detail.sender && (
                  <div className="mt-4 flex items-center gap-3 border-t pt-4">
                    <Avatar size="lg" className="size-11 shrink-0">
                      <AvatarImage src={detail.avatar ?? undefined} alt="" />
                      <AvatarFallback>{initials(detail.sender)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{detail.sender}</p>
                      <p className="text-sm text-muted-foreground">Client</p>
                    </div>
                  </div>
                )}
                {detail.body && detail.body !== item.description && (
                  <p className="mt-4 whitespace-pre-wrap border-t pt-4 text-sm leading-6 text-muted-foreground">
                    {detail.body}
                  </p>
                )}
              </div>
            )}

            {(detail.proposal ||
              detail.budget ||
              detail.delivery ||
              detail.dueDate) && (
              <div className="space-y-4 rounded-xl border p-5">
                <h3 className="font-semibold">Your application</h3>
                {detail.proposal && (
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {detail.proposal}
                  </p>
                )}
                <dl className="grid grid-cols-1 gap-4 border-t pt-4 text-sm sm:grid-cols-2">
                  {detail.budget && (
                    <div>
                      <dt className="text-muted-foreground">Proposed price</dt>
                      <dd className="mt-1 font-medium">{detail.budget}</dd>
                    </div>
                  )}
                  {detail.delivery && (
                    <div>
                      <dt className="text-muted-foreground">
                        Estimated delivery
                      </dt>
                      <dd className="mt-1 font-medium">{detail.delivery}</dd>
                    </div>
                  )}
                  {detail.dueDate && (
                    <div>
                      <dt className="text-muted-foreground">Applied</dt>
                      <dd className="mt-1 font-medium">
                        {dateText(detail.dueDate)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            )}

            <div className="rounded-xl bg-muted/40 p-5 sm:p-6">
              <h3 className="text-base font-semibold">Next steps</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Continue the conversation with the client to turn the selection
                into a clear plan for the work.
              </p>
              <ol className="mt-5 space-y-4">
                <li className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-sm font-semibold">
                    1
                  </span>
                  <div>
                    <p className="font-medium">Confirm the project scope</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Review the requirements, deliverables, and any open
                      questions with the client.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-sm font-semibold">
                    2
                  </span>
                  <div>
                    <p className="font-medium">Agree on the terms</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Confirm the price, delivery timeline, revisions, and
                      milestones before work begins.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-sm font-semibold">
                    3
                  </span>
                  <div>
                    <p className="font-medium">
                      Keep the agreement in WorkSync
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Review the final project agreement with the client, then
                      use the project workspace to track the work.
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          </section>
        ) : isDeclined ? (
          <section className="min-w-0 space-y-5">
            <div className="flex items-center gap-4 rounded-xl border p-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
                <BriefcaseBusiness className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{detail.title || "Application"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {detail.projectType || "Fixed Price"}
                  {detail.projectBudget || detail.budget
                    ? " | " + (detail.projectBudget || detail.budget)
                    : ""}
                </p>
                {detail.sender && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Posted by {detail.sender}
                  </p>
                )}
              </div>
              <Button asChild variant="outline" size="sm">
                <Link
                  href={detail.href || "/home/marketplace"}
                  onClick={onClose}
                >
                  View Project
                </Link>
              </Button>
            </div>

            <div className="border-b pb-5">
              <h3 className="mb-3 font-semibold">Application details</h3>
              <dl className="space-y-3 text-sm">
                {detail.dueDate && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Applied on</dt>
                    <dd>{dateText(detail.dueDate)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Your proposal</dt>
                  <dd>
                    {detail.proposal
                      ? "Cover letter submitted"
                      : "No proposal details available"}
                  </dd>
                </div>
                {detail.delivery && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Proposed delivery</dt>
                    <dd>{detail.delivery}</dd>
                  </div>
                )}
                {detail.budget && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Proposed price</dt>
                    <dd>{detail.budget}</dd>
                  </div>
                )}
              </dl>
              {detail.proposal && (
                <div className="mt-4 rounded-lg bg-muted/40 p-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Proposal
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-6">
                    {detail.proposal}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-xl bg-muted/50 p-4">
              <p className="flex items-center gap-2 font-semibold">
                <MessageCircle className="size-4 text-muted-foreground" />
                Client feedback
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                No additional written feedback was included with this
                notification.
              </p>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4">
              <p className="font-semibold">Keep going!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Top freelancers stay active and keep improving their profiles.
              </p>
              <Button
                asChild
                variant="outline"
                className="mt-4 w-full border-primary/30 text-primary hover:bg-primary/5"
              >
                <Link href="/home/marketplace" onClick={onClose}>
                  Browse New Projects
                </Link>
              </Button>
            </div>
          </section>
        ) : isDeadline ? (
          <section className="space-y-6">
            <div className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <Avatar size="lg" className="size-12">
                  <AvatarImage src={detail.avatar ?? undefined} alt="" />
                  <AvatarFallback>{initials(detail.sender)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {detail.title || "Project deadline"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {detail.senderSubtitle || "Project"}
                    {detail.sender ? " - " + detail.sender : ""}
                  </p>
                </div>
                {detail.status && (
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium capitalize text-blue-700">
                    {detail.status.replaceAll("_", " ")}
                  </span>
                )}
              </div>
              <dl className="mt-5 grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-3">
                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Due date</dt>
                    <dd className="mt-1 font-medium">
                      {dateText(detail.dueDate)}
                    </dd>
                    {detail.dueDate && (
                      <dd className="mt-1 text-xs text-destructive">
                        {(() => {
                          const days = Math.ceil(
                            (new Date(detail.dueDate).getTime() - Date.now()) /
                              86400000,
                          );
                          return days < 0
                            ? "Overdue by " +
                                Math.abs(days) +
                                (Math.abs(days) === 1 ? " day" : " days")
                            : days === 0
                              ? "Due today"
                              : "In " + days + (days === 1 ? " day" : " days");
                        })()}
                      </dd>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Tag className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Project type
                    </dt>
                    <dd className="mt-1 font-medium">
                      {detail.projectType || "Project"}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <BriefcaseBusiness className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Budget</dt>
                    <dd className="mt-1 font-medium">
                      {detail.budget || "Not specified"}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
            <section>
              <h3 className="font-semibold">What is due</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {detail.body ||
                  "Complete the outstanding work for this project."}
              </p>
            </section>
            <section>
              <h3 className="mb-3 font-semibold">Next steps</h3>
              {detail.steps?.length ? (
                <ol className="space-y-4">
                  {detail.steps.map((step) => {
                    const complete = /complete|done|approved/i.test(
                      step.status,
                    );
                    return (
                      <li key={step.id} className="flex items-start gap-3">
                        {complete ? (
                          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
                        ) : (
                          <Circle className="mt-0.5 size-5 shrink-0 text-orange-500" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{step.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {complete ? "Completed" : "Due"}
                            {step.dueDate ? " " + dateText(step.dueDate) : ""}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No milestone checklist has been added to this project yet.
                </p>
              )}
            </section>
            <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CalendarDays className="size-4" />
              </span>
              <p className="text-sm leading-6">
                <span className="font-semibold">Tip: </span>Delivering on time
                strengthens your reputation and increases your chances of repeat
                business.
              </p>
            </div>
          </section>
        ) : (
          <div className="grid min-w-0 gap-6 @min-[720px]:grid-cols-[minmax(0,1fr)_minmax(250px,0.8fr)]">
            <section className="min-w-0 space-y-5">
              <div>
                <h3 className="mb-2 border-l-2 border-primary pl-3 font-semibold">
                  {isDeadline
                    ? "Project details"
                    : isRequest
                      ? "Request details"
                      : "Details"}
                </h3>
                <p className="whitespace-pre-wrap pl-3 text-sm leading-6 text-muted-foreground">
                  {detail.body ||
                    (loading
                      ? "Loading related details..."
                      : item.description ||
                        "There are no additional details for this notification.")}
                </p>
              </div>
              <div>
                <h3 className="mb-3 border-l-2 border-primary pl-3 font-semibold">
                  Key information
                </h3>
                {detail.title && (
                  <p className="mb-3 pl-3 font-medium">{detail.title}</p>
                )}
                <dl className="space-y-3 pl-3 text-sm">
                  {detail.budget && (
                    <div className="flex justify-between gap-3">
                      <dt className="flex items-center gap-2 text-muted-foreground">
                        <BriefcaseBusiness className="size-4 text-primary" />
                        Budget
                      </dt>
                      <dd>{detail.budget}</dd>
                    </div>
                  )}
                  {detail.delivery && (
                    <div className="flex justify-between gap-3">
                      <dt className="flex items-center gap-2 text-muted-foreground">
                        <CalendarDays className="size-4 text-primary" />
                        Delivery timeline
                      </dt>
                      <dd>{detail.delivery}</dd>
                    </div>
                  )}
                  {detail.projectType && (
                    <div className="flex justify-between gap-3">
                      <dt className="flex items-center gap-2 text-muted-foreground">
                        <Tag className="size-4 text-primary" />
                        Project type
                      </dt>
                      <dd>{detail.projectType}</dd>
                    </div>
                  )}
                  {detail.dueDate && (
                    <div className="flex justify-between gap-3">
                      <dt className="flex items-center gap-2 text-muted-foreground">
                        <Clock3 className="size-4 text-primary" />
                        {isDeadline ? "Due date" : "Received"}
                      </dt>
                      <dd className="text-right">{dateText(detail.dueDate)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Received</dt>
                    <dd className="text-right">
                      {formatDistanceToNow(received, { addSuffix: true })}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>
            <aside
              className={
                "h-fit min-w-0 rounded-xl border p-4 sm:p-5 " +
                (isDeadline
                  ? "border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20"
                  : "border-primary/15 bg-primary/[0.035]")
              }
            >
              <h3 className="mb-3 flex items-center gap-2 font-semibold">
                <MessageCircle className="size-4 text-primary" />
                {detail.sender
                  ? "Message from " + detail.sender.split(" ")[0]
                  : "Notification message"}
              </h3>
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {item.description || "No message was included."}
              </p>
            </aside>
          </div>
        )}

        {responseSaved && (
          <p
            role="status"
            className="rounded-lg bg-primary/10 p-3 text-sm text-primary"
          >
            Your response has been sent.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </div>
      <div
        className={
          "flex shrink-0 flex-col gap-2 border-t bg-background px-5 py-4 sm:flex-row sm:px-9 lg:px-10 " +
          (isDeadline ? "sm:justify-between" : "sm:justify-end")
        }
      >
        {isDeadline ? (
          <>
            <Button
              variant="outline"
              disabled={reminding}
              onClick={() => void remindLater()}
            >
              <Clock3 className="size-4" />
              {reminding ? "Saving..." : "Remind me later"}
            </Button>
            {detail.href && (
              <Button asChild>
                <Link href={detail.href} onClick={onClose}>
                  View Project
                </Link>
              </Button>
            )}
          </>
        ) : isRequest && detail.requestPending ? (
          <>
            <Button
              variant="outline"
              disabled={responding}
              onClick={() => void respond(false)}
            >
              <X className="size-4" />
              Decline Request
            </Button>
            <Button disabled={responding} onClick={() => void respond(true)}>
              <Check className="size-4" />
              {responding ? "Saving..." : "Accept Request"}
            </Button>
          </>
        ) : detail.href ? (
          <Button asChild>
            <Link href={detail.href} onClick={onClose}>
              {detail.action || "View details"}
            </Link>
          </Button>
        ) : (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </>
  );

  if (inline) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col gap-0 overflow-hidden rounded-xl border bg-background text-sm text-foreground shadow-sm">
        {panel}
      </div>
    );
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="h-dvh max-h-dvh !w-screen !max-w-none gap-0 overflow-hidden rounded-none border-0 bg-background p-0 md:!w-[min(90vw,600px)] md:!max-w-[600px] md:rounded-l-xl md:border-l"
      >
        {panel}
      </SheetContent>
    </Sheet>
  );
}
