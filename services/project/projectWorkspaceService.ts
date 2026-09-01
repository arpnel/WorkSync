import { supabase } from "@/lib/supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  ProjectWorkspace,
  WorkspaceAgreementItem,
  WorkspaceMessage,
  WorkspaceMilestone,
} from "@/types/project/projectWorkspace";

function record(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  const item = Array.isArray(value) ? value[0] : value;
  return item && typeof item === "object"
    ? (item as Record<string, unknown>)
    : null;
}
function records(value: unknown): Record<string, unknown>[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object",
  );
}
function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function numeric(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function displayName(
  profile: Record<string, unknown> | null,
  fallback: string,
): string {
  const display = text(profile?.display_name).trim();
  const full = [text(profile?.first_name), text(profile?.last_name)]
    .filter(Boolean)
    .join(" ")
    .trim();
  return display || full || fallback;
}
async function currentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("You must be signed in to open a project.");
  return user.id;
}

const MESSAGE_ATTACHMENTS_BUCKET = "message-attachments";
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

async function attachmentUrl(value: string | null): Promise<string | null> {
  if (!value || /^https?:\/\//.test(value)) return value;

  const result = await supabase.storage
    .from(MESSAGE_ATTACHMENTS_BUCKET)
    .createSignedUrl(value, 60 * 60);
  if (result.error) {
    console.warn("Project attachment is unavailable:", result.error.message);
    return null;
  }
  return result.data.signedUrl;
}

const WORKSPACE_SELECT =
  "order_id, service_id, freelancer_id, client_id, status, created_at, services(title, description, price, service_type, delivery_time_days, revisions_count, job_categories(name)), client_profiles(user_id), freelancer_profiles(user_id), projects(project_id, title, description, budget, status, start_date, due_date, milestones(milestone_id, title, description, amount, due_date, status, display_order)), contracts(contract_id, final_price, delivery_time_days, revisions_count, terms, status, client_signed_at, freelancer_signed_at)";

export async function getProjectWorkspace(
  orderId: string,
): Promise<ProjectWorkspace> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("service_orders")
    .select(WORKSPACE_SELECT)
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project not found or you do not have access.");

  const row = data as unknown as Record<string, unknown>;
  const service = record(row.services);
  const project = record(row.projects);
  const category = record(service?.job_categories);
  const contract = record(row.contracts);
  const client = record(row.client_profiles);
  const freelancer = record(row.freelancer_profiles);
  const clientUserId = text(client?.user_id);
  const freelancerUserId = text(freelancer?.user_id);
  const participantIds = [clientUserId, freelancerUserId].filter(Boolean);
  const profilesResult = participantIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, display_name, first_name, last_name, avatar_url")
        .in("user_id", participantIds)
    : { data: [], error: null };
  if (profilesResult.error) throw new Error(profilesResult.error.message);
  const profileMap = new Map(
    (profilesResult.data ?? []).map((item) => [
      item.user_id,
      item as Record<string, unknown>,
    ]),
  );

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("conversation_id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (conversationError) {
    console.warn(
      "Project conversation is unavailable:",
      conversationError.message,
    );
  }
  let messages: WorkspaceMessage[] = [];
  if (!conversationError && conversation?.conversation_id) {
    const result = await supabase
      .from("messages")
      .select(
        "message_id, sender_id, message, attachment_url, attachment_type, created_at",
      )
      .eq("conversation_id", conversation.conversation_id)
      .order("created_at", { ascending: true });
    if (result.error) throw new Error(result.error.message);
    messages = await Promise.all(
      (result.data ?? []).map(async (message) => ({
        id: message.message_id,
        senderId: message.sender_id,
        senderName: displayName(
          profileMap.get(message.sender_id) ?? null,
          message.sender_id === userId ? "You" : "Project member",
        ),
        senderAvatarUrl:
          text(profileMap.get(message.sender_id)?.avatar_url) || null,
        message: message.message,
        attachmentUrl: await attachmentUrl(message.attachment_url),
        attachmentType: message.attachment_type,
        createdAt: message.created_at,
        mine: message.sender_id === userId,
      })),
    );
  }

  let agreementItems: WorkspaceAgreementItem[] = [];
  const contractId = text(contract?.contract_id);
  if (contractId) {
    const approvals = await supabase
      .from("contract_item_approvals")
      .select(
        "approval_id, item_key, client_approved_at, freelancer_approved_at",
      )
      .eq("contract_id", contractId);

    if (!approvals.error) {
      agreementItems = (approvals.data ?? []).map((item) => ({
        id: item.approval_id,
        itemKey: item.item_key,
        clientApprovedAt: item.client_approved_at,
        freelancerApprovedAt: item.freelancer_approved_at,
      }));
    } else {
      console.warn(
        "Individual agreement approvals are unavailable:",
        approvals.error.message,
      );
    }
  }

  const milestones: WorkspaceMilestone[] = records(project?.milestones)
    .map((milestone) => ({
      id: text(milestone.milestone_id),
      title: text(milestone.title, "Untitled milestone"),
      description: text(milestone.description),
      amount: numeric(milestone.amount),
      dueDate: text(milestone.due_date) || null,
      status: text(milestone.status, "pending"),
      displayOrder: numeric(milestone.display_order),
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return {
    orderId: text(row.order_id),
    currentUserId: userId,
    currentParty: userId === clientUserId ? "client" : "freelancer",
    contractId: contractId || null,
    projectId: text(project?.project_id) || null,
    conversationId: conversation?.conversation_id ?? null,
    type: service?.service_type === "milestone" ? "milestone" : "standard",
    title: text(project?.title) || text(service?.title, "Untitled Project"),
    categoryName: text(category?.name) || null,
    description: text(project?.description) || text(service?.description),
    status:
      text(project?.status) ||
      text(contract?.status) ||
      text(row.status, "pending"),
    orderStatus: text(row.status),
    clientName: displayName(profileMap.get(clientUserId) ?? null, "Client"),
    freelancerName: displayName(
      profileMap.get(freelancerUserId) ?? null,
      "Freelancer",
    ),
    createdAt: text(row.created_at),
    startDate: text(project?.start_date) || null,
    dueDate: text(project?.due_date) || null,
    budget: numeric(contract?.final_price ?? project?.budget ?? service?.price),
    deliveryDays:
      contract?.delivery_time_days == null &&
      service?.delivery_time_days == null
        ? null
        : numeric(contract?.delivery_time_days ?? service?.delivery_time_days),
    revisions:
      contract?.revisions_count == null && service?.revisions_count == null
        ? null
        : numeric(contract?.revisions_count ?? service?.revisions_count),
    terms: text(contract?.terms) || null,
    contractStatus: text(contract?.status) || null,
    clientSignedAt: text(contract?.client_signed_at) || null,
    freelancerSignedAt: text(contract?.freelancer_signed_at) || null,
    milestones,
    agreementItems,
    messages,
  };
}

export async function sendProjectMessage(
  orderId: string,
  message: string,
  messageId: string,
  attachment?: File,
): Promise<{ attachmentUrl: string | null; attachmentType: string | null }> {
  const senderId = await currentUserId();
  const content = message.trim();
  if (!content && !attachment) {
    return { attachmentUrl: null, attachmentType: null };
  }
  const { data: existingConversation, error } = await supabase
    .from("conversations")
    .select("conversation_id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  let conversation = existingConversation;
  if (!conversation) {
    const result = await supabase
      .from("conversations")
      .insert({ order_id: orderId })
      .select("conversation_id")
      .single();
    if (result.error) throw new Error(result.error.message);
    conversation = result.data;
  }
  let attachmentUrl: string | null = null;
  let attachmentType: string | null = null;
  let uploadedPath: string | null = null;

  if (attachment) {
    if (attachment.size > MAX_ATTACHMENT_SIZE) {
      throw new Error("Attachments must be 10 MB or smaller.");
    }

    const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${senderId}/${conversation.conversation_id}/${messageId}-${safeName}`;
    const upload = await supabase.storage
      .from(MESSAGE_ATTACHMENTS_BUCKET)
      .upload(filePath, attachment, { upsert: false });
    if (upload.error) throw new Error(upload.error.message);

    uploadedPath = filePath;
    const signedUrl = await supabase.storage
      .from(MESSAGE_ATTACHMENTS_BUCKET)
      .createSignedUrl(filePath, 60 * 60);
    if (signedUrl.error) {
      await supabase.storage
        .from(MESSAGE_ATTACHMENTS_BUCKET)
        .remove([filePath]);
      throw new Error(signedUrl.error.message);
    }
    attachmentUrl = signedUrl.data.signedUrl;
    attachmentType = attachment.type || "application/octet-stream";
  }

  const { error: messageError } = await supabase.from("messages").insert({
    message_id: messageId,
    conversation_id: conversation.conversation_id,
    sender_id: senderId,
    message: content || attachment?.name || "Attachment",
    attachment_url: uploadedPath,
    attachment_type: attachmentType,
  });
  if (messageError) {
    if (uploadedPath) {
      await supabase.storage
        .from(MESSAGE_ATTACHMENTS_BUCKET)
        .remove([uploadedPath]);
    }
    throw new Error(messageError.message);
  }

  return { attachmentUrl, attachmentType };
}

export function createProjectTypingChannel(
  conversationId: string,
  currentUserId: string,
  onTypingChange: (isTyping: boolean) => void,
): { channel: RealtimeChannel; sendTyping: (isTyping: boolean) => void } {
  const channel = supabase
    .channel(`project-typing:${conversationId}`, {
      config: { broadcast: { self: false } },
    })
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload.userId !== currentUserId) {
        onTypingChange(Boolean(payload.isTyping));
      }
    })
    .subscribe();

  return {
    channel,
    sendTyping: (isTyping) => {
      void channel.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: currentUserId, isTyping },
      });
    },
  };
}

async function getAgreementContext(orderId: string) {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("service_orders")
    .select(
      "client_profiles(user_id), freelancer_profiles(user_id), contracts(contract_id)",
    )
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project agreement not found.");

  const row = data as unknown as Record<string, unknown>;
  const client = record(row.client_profiles);
  const freelancer = record(row.freelancer_profiles);
  const contract = record(row.contracts);
  const party =
    text(client?.user_id) === userId
      ? "client"
      : text(freelancer?.user_id) === userId
        ? "freelancer"
        : null;
  if (!party || !contract?.contract_id) {
    throw new Error("You cannot update this agreement.");
  }

  return { contractId: text(contract.contract_id), party };
}

export async function respondToProjectAgreement(
  orderId: string,
  accepted: boolean,
): Promise<void> {
  const { contractId } = await getAgreementContext(orderId);

  if (accepted) {
    const { error } = await supabase.rpc("confirm_contract_agreement", {
      p_contract_id: contractId,
    });
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from("contracts")
    .update({ client_signed_at: null, freelancer_signed_at: null })
    .eq("contract_id", contractId);
  if (error) throw new Error(error.message);
}

export async function updateProjectAgreementTerms(
  orderId: string,
  budget: number,
  deliveryDays: number,
): Promise<void> {
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error("Budget must be greater than zero.");
  }
  if (!Number.isInteger(deliveryDays) || deliveryDays < 1) {
    throw new Error("Duration must be at least one day.");
  }

  const { contractId } = await getAgreementContext(orderId);
  const { error } = await supabase
    .from("contracts")
    .update({
      final_price: budget,
      delivery_time_days: deliveryDays,
      client_signed_at: null,
      freelancer_signed_at: null,
    })
    .eq("contract_id", contractId);
  if (error) throw new Error(error.message);

  const reset = await supabase.rpc("reset_contract_item_approvals", {
    p_contract_id: contractId,
  });
  if (reset.error) throw new Error(reset.error.message);
}

export async function respondToProjectAgreementItem(
  orderId: string,
  itemKey: string,
  approved: boolean,
): Promise<void> {
  const { contractId } = await getAgreementContext(orderId);
  const { error } = await supabase.rpc("respond_to_contract_item", {
    p_contract_id: contractId,
    p_item_key: itemKey,
    p_approved: approved,
  });
  if (error) throw new Error(error.message);
}

export async function updateProjectAgreementItem(
  orderId: string,
  itemKey: "budget" | "delivery" | "revisions",
  value: number,
): Promise<void> {
  if (
    !Number.isFinite(value) ||
    (itemKey === "revisions" ? value < 0 : value <= 0)
  ) {
    throw new Error("Enter a valid value.");
  }
  if (itemKey !== "budget" && !Number.isInteger(value)) {
    throw new Error("Delivery and revisions must be whole numbers.");
  }

  const { contractId } = await getAgreementContext(orderId);
  const column = {
    budget: "final_price",
    delivery: "delivery_time_days",
    revisions: "revisions_count",
  }[itemKey];

  const { error } = await supabase
    .from("contracts")
    .update({
      [column]: value,
      client_signed_at: null,
      freelancer_signed_at: null,
    })
    .eq("contract_id", contractId);
  if (error) throw new Error(error.message);

  const reset = await supabase.rpc("respond_to_contract_item", {
    p_contract_id: contractId,
    p_item_key: itemKey,
    p_approved: false,
  });
  if (reset.error) throw new Error(reset.error.message);
}
