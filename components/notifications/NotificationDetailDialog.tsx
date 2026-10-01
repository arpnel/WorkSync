"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getPublicIdentities } from "@/services/profile/publicIdentityService";
import type { NotificationRecord } from "@/services/notification/notificationService";
import { Button } from "@/components/ui/button";
import { listMyAssessments } from "@/services/assessments/assessmentService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Detail = {
  sender?: string;
  body?: string;
  href?: string;
  action?: string;
};
export function NotificationDetailDialog({
  item,
  onClose,
}: {
  item: NotificationRecord;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    async function load(): Promise<Detail> {
      if (!item.relatedId) return {};
      const id = item.relatedId;
      if (item.type === "skill_assessment") {
        const opening = (await listMyAssessments()).find(
          (row) => row.id === id,
        );
        if (!opening)
          return { body: "This assessment is unavailable for this account." };
        const closed =
          opening.status === "closed" || opening.attempt?.status === "expired";
        return {
          body: `${opening.category} · ${closed ? "Closed / expired" : opening.status === "scheduled" ? "Scheduled" : "Available"}\nCloses ${new Date(opening.closesAt).toLocaleString()}`,
          href: `/home/assessments?opening=${encodeURIComponent(id)}`,
          action:
            opening.attempt?.status === "submitted"
              ? "View Result"
              : closed
                ? "View Assessment"
                : "Take Assessment",
        };
      }
      if (item.type?.includes("message")) {
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
          sender: sender
            ? sender.display_name ||
              [sender.first_name, sender.last_name].filter(Boolean).join(" ")
            : undefined,
          href: `/home/messages?conversation=${encodeURIComponent(conversationId)}`,
          action: "Open Conversation",
        };
      }
      if (item.type?.includes("application")) {
        const result = await supabase
          .from("jobs")
          .select("title,description")
          .eq("job_id", id)
          .maybeSingle();
        if (result.error) throw result.error;
        return result.data
          ? {
              body: `${result.data.title}\n\n${result.data.description}`,
              href: `/home/projects?status=Request&job=${encodeURIComponent(id)}`,
              action: "View Application",
            }
          : {};
      }
      if (
        /service_request|project|contract|agreement|review/.test(
          item.type ?? "",
        )
      ) {
        const result = await supabase
          .from("service_orders")
          .select(
            "order_id,client_id,freelancer_id,services(title,service_type),contracts(terms,final_price,delivery_time_days)",
          )
          .eq("order_id", id)
          .maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) return {};
        const order = result.data;
        const identities = await getPublicIdentities({
          clientIds: [order.client_id],
          freelancerIds: [order.freelancer_id],
        });
        const { data: auth } = await supabase.auth.getSession();
        const sender = identities.profiles.find(
          (profile) => profile.user_id !== auth.session?.user.id,
        );
        const service = Array.isArray(order.services)
          ? order.services[0]
          : order.services;
        const contract = Array.isArray(order.contracts)
          ? order.contracts[0]
          : order.contracts;
        let terms: { projectTitle?: string; description?: string } = {};
        try {
          terms =
            typeof contract?.terms === "string"
              ? JSON.parse(contract.terms)
              : (contract?.terms ?? {});
        } catch {
          /* Older agreements can contain plain text. */
        }
        return {
          sender: sender
            ? sender.display_name ||
              [sender.first_name, sender.last_name].filter(Boolean).join(" ")
            : undefined,
          body: [
            terms.projectTitle || service?.title,
            terms.description,
            contract?.final_price != null
              ? `Budget: PHP ${Number(contract.final_price).toLocaleString()}`
              : null,
            contract?.delivery_time_days
              ? `Delivery: ${contract.delivery_time_days} days`
              : null,
          ]
            .filter(Boolean)
            .join("\n\n"),
          href: `/home/projects/${service?.service_type === "milestone" ? "milestone" : "standard"}/${encodeURIComponent(id)}`,
          action: item.type?.includes("service_request")
            ? "View Request"
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
  }, [item]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>
            {item.type === "service_request" && /new/i.test(item.title)
              ? "New Service Request"
              : item.title}
          </DialogTitle>
          <DialogDescription>
            {(item.type ?? "Notification").replaceAll("_", " ")}
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-muted-foreground">From</dt>
            <dd>
              {detail.sender || (loading ? "Loading sender…" : "Not specified")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Date</dt>
            <dd>{new Date(item.createdAt).toLocaleString()}</dd>
          </div>
        </dl>
        <p className="whitespace-pre-wrap text-sm">{item.description}</p>
        {detail.body && (
          <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm">
            {detail.body}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            Related details could not load: {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {detail.href && (
            <Button asChild>
              <Link href={detail.href}>{detail.action}</Link>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
