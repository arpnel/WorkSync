import {
  workspaceStatus,
  contractStatus,
  orderStatus,
  milestoneStatus,
} from "@/types/project/status";
import { supabase } from "@/lib/supabaseClient";
import { getActiveAccountContext } from "@/services/marketplace/AccountServices";
import { traceProjectFlow } from "@/services/project/projectFlowDiagnostics";
import {
  LARGE_FILE_MAX_BYTES,
  SUPABASE_MAX_FILE_BYTES,
  usesR2Storage,
} from "@/lib/storage/hybridStorage";
import {
  deleteUnusedLargeFile,
  getLargeFileUrl,
  uploadLargeFile,
} from "@/services/storage/hybridStorageClient";
import { createSignedUrlMap } from "@/services/storage/signedUrlBatch";
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
const MAX_ATTACHMENT_SIZE = LARGE_FILE_MAX_BYTES;
const PROJECT_MESSAGE_PAGE_SIZE = 50;

async function messageAttachmentUrls(
  rows: Array<{ message_id: string; attachment_url: string | null }>,
): Promise<Map<string, string | null>> {
  const paths = rows
    .map((row) => row.attachment_url)
    .filter(
      (path): path is string =>
        typeof path === "string" &&
        !/^https?:\/\//.test(path) &&
        !path.startsWith("r2:"),
    );
  const signed = await createSignedUrlMap(
    supabase,
    MESSAGE_ATTACHMENTS_BUCKET,
    paths,
    60 * 60,
  );
  const resolved = new Map<string, string | null>();
  await Promise.all(
    rows.map(async (row) => {
      const path = row.attachment_url;
      if (!path) return;
      if (/^https?:\/\//.test(path)) resolved.set(row.message_id, path);
      else if (path.startsWith("r2:"))
        resolved.set(row.message_id, await attachmentUrl(path, row.message_id));
      else resolved.set(row.message_id, signed.get(path) ?? null);
    }),
  );
  return resolved;
}

async function attachmentUrl(
  value: string | null,
  messageId?: string,
): Promise<string | null> {
  if (!value || /^https?:\/\//.test(value)) return value;
  if (value.startsWith("r2:")) {
    if (!messageId) return null;
    try {
      return await getLargeFileUrl("message", messageId);
    } catch (error) {
      console.warn(
        "Project attachment is unavailable:",
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

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
  "order_id, service_id, freelancer_id, client_id, status, created_at, services(title, description, price, service_type, delivery_time_days, revisions_count, category_id), client_profiles(user_id), freelancer_profiles(user_id), projects(project_id, title, description, budget, status, start_date, due_date, milestones(milestone_id, title, description, amount, due_date, status, display_order)), contracts(contract_id, final_price, delivery_time_days, revisions_count, terms, status, client_signed_at, freelancer_signed_at)";

export async function getProjectWorkspace(
  serviceOrderId: string,
): Promise<ProjectWorkspace> {
  const account = await getActiveAccountContext();
  const userId = account.userId;
  traceProjectFlow("querying service_orders workspace", {
    filterColumn: "order_id",
    filterIdType: "service_order_id",
    filterId: serviceOrderId,
  });
  const { data, error } = await supabase
    .from("service_orders")
    .select(WORKSPACE_SELECT)
    .eq("order_id", serviceOrderId)
    .maybeSingle();
  traceProjectFlow("service_orders workspace query returned", {
    filterId: serviceOrderId,
    found: Boolean(data),
    returnedOrderId: data?.order_id ?? null,
    errorCode: error?.code ?? null,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project not found or you do not have access.");

  const row = data as unknown as Record<string, unknown>;
  const service = record(row.services);
  const project = record(row.projects);
  const contract = record(row.contracts);
  let requestTitle = "";
  let requestDescription = "";
  let requestCategoryId = "";
  let requestCategoryName = "";
  const rawTerms = text(contract?.terms);
  if (rawTerms) {
    try {
      const requestDetails = JSON.parse(rawTerms) as Record<string, unknown>;
      requestTitle = text(requestDetails.projectTitle);
      requestDescription = text(requestDetails.description);
      requestCategoryId = text(requestDetails.categoryId);
      requestCategoryName = text(requestDetails.categoryName);
    } catch {
      requestDescription = rawTerms;
    }
  }
  const client = record(row.client_profiles);
  const freelancer = record(row.freelancer_profiles);
  const clientUserId = text(client?.user_id);
  const freelancerUserId = text(freelancer?.user_id);
  const activeRoleOwnsOrder =
    account.profileId != null &&
    (account.role === "client"
      ? row.client_id === account.profileId
      : row.freelancer_id === account.profileId);
  if (!activeRoleOwnsOrder)
    throw new Error("This project is not part of your active account role.");
  const categoryId = requestCategoryId || text(service?.category_id);
  const participantIds = [clientUserId, freelancerUserId].filter(Boolean);
  const [categoryResult, profilesResult, conversationResult] =
    await Promise.all([
      categoryId
        ? supabase
            .from("job_categories")
            .select("name")
            .eq("id", categoryId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      participantIds.length
        ? supabase
            .from("profiles")
            .select("user_id, display_name, first_name, last_name, avatar_url")
            .in("user_id", participantIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("conversations")
        .select("conversation_id")
        .eq("order_id", serviceOrderId)
        .maybeSingle(),
    ]);
  if (categoryResult.error) {
    console.warn(
      "Project category is unavailable:",
      categoryResult.error.message,
    );
  }

  if (profilesResult.error) throw new Error(profilesResult.error.message);
  const profileMap = new Map(
    (profilesResult.data ?? []).map((item) => [
      item.user_id,
      item as Record<string, unknown>,
    ]),
  );

  const { data: conversation, error: conversationError } = conversationResult;
  if (conversationError) {
    console.warn(
      "Project conversation is unavailable:",
      conversationError.message,
    );
  }
  let messages: WorkspaceMessage[] = [];
  let hasOlderMessages = false;
  if (!conversationError && conversation?.conversation_id) {
    const result = await supabase
      .from("messages")
      .select(
        "message_id, sender_id, message, attachment_url, attachment_type, created_at",
      )
      .eq("conversation_id", conversation.conversation_id)
      .order("created_at", { ascending: false })
      .order("message_id", { ascending: false })
      .limit(PROJECT_MESSAGE_PAGE_SIZE + 1);
    if (result.error) throw new Error(result.error.message);
    hasOlderMessages = (result.data?.length ?? 0) > PROJECT_MESSAGE_PAGE_SIZE;
    const page = (result.data ?? [])
      .slice(0, PROJECT_MESSAGE_PAGE_SIZE)
      .reverse();
    const attachments = await messageAttachmentUrls(page);
    messages = page.map((message) => ({
      id: message.message_id,
      senderId: message.sender_id,
      senderName: displayName(
        profileMap.get(message.sender_id) ?? null,
        message.sender_id === userId ? "You" : "Project member",
      ),
      senderAvatarUrl:
        text(profileMap.get(message.sender_id)?.avatar_url) || null,
      message: message.message,
      attachmentUrl: attachments.get(message.message_id) ?? null,
      attachmentType: message.attachment_type,
      createdAt: message.created_at,
      mine: message.sender_id === userId,
    }));
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

  let milestoneRows = records(project?.milestones);
  const draftMilestones =
    text(service?.service_type) === "milestone" &&
    !!contractId &&
    !["active", "completed"].includes(text(contract?.status)) &&
    (!project || ["", "pending"].includes(text(project.status)));
  if (draftMilestones) {
    const draft = await supabase.rpc("worksync_draft_milestones", {
      p_order: serviceOrderId,
      p_action: "list",
    });
    if (draft.error)
      throw new Error(
        "Unable to load draft milestones: " + draft.error.message,
      );
    if (!Array.isArray(draft.data))
      throw new Error("Invalid draft milestone response.");
    milestoneRows = records(draft.data);
  }
  const milestones: WorkspaceMilestone[] = milestoneRows
    .map((milestone) => ({
      id: text(
        draftMilestones
          ? milestone.contract_milestone_id
          : milestone.milestone_id,
      ),
      title: text(milestone.title, "Untitled milestone"),
      description: text(milestone.description),
      amount: numeric(milestone.amount),
      dueDate: text(milestone.due_date) || null,
      status: milestoneStatus(text(milestone.status, "pending")),
      displayOrder: numeric(milestone.display_order),
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const clientSignedAt = text(contract?.client_signed_at) || null;
  const freelancerSignedAt = text(contract?.freelancer_signed_at) || null;

  return {
    orderId: text(row.order_id),
    currentUserId: userId,
    currentParty: userId === clientUserId ? "client" : "freelancer",
    contractId: contractId || null,
    projectId: text(project?.project_id) || null,
    conversationId: conversation?.conversation_id ?? null,
    type: service?.service_type === "milestone" ? "milestone" : "standard",
    title:
      text(project?.title) ||
      requestTitle ||
      text(service?.title, "Untitled Project"),
    categoryName:
      requestCategoryName || text(categoryResult.data?.name) || null,
    description:
      text(project?.description) ||
      requestDescription ||
      text(service?.description),
    status: workspaceStatus(
      text(project?.status) || null,
      text(contract?.status) || null,
      text(row.status),
      clientSignedAt,
      freelancerSignedAt,
    ),
    orderStatus: orderStatus(text(row.status)),
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
    terms: requestDescription || rawTerms || null,
    contractStatus: contract?.status
      ? contractStatus(text(contract.status))
      : null,
    clientSignedAt,
    freelancerSignedAt,
    milestones,
    agreementItems,
    messages,
    hasOlderMessages,
  };
}

export async function getOlderProjectMessages(
  conversationId: string,
  currentUserId: string,
  before: { createdAt: string; messageId: string },
): Promise<{ messages: WorkspaceMessage[]; hasOlderMessages: boolean }> {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "message_id, sender_id, message, attachment_url, attachment_type, created_at",
    )
    .eq("conversation_id", conversationId)
    .or(
      `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},message_id.lt.${before.messageId})`,
    )
    .order("created_at", { ascending: false })
    .order("message_id", { ascending: false })
    .limit(PROJECT_MESSAGE_PAGE_SIZE + 1);
  if (error) throw new Error(error.message);
  const hasOlderMessages = (data?.length ?? 0) > PROJECT_MESSAGE_PAGE_SIZE;
  const rows = (data ?? []).slice(0, PROJECT_MESSAGE_PAGE_SIZE).reverse();
  if (!rows.length) return { messages: [], hasOlderMessages: false };

  const senderIds = [...new Set(rows.map((message) => message.sender_id))];
  const profilesResult = await supabase
    .from("profiles")
    .select("user_id, display_name, first_name, last_name, avatar_url")
    .in("user_id", senderIds);
  if (profilesResult.error) throw new Error(profilesResult.error.message);
  const profileMap = new Map(
    (profilesResult.data ?? []).map((profile) => [profile.user_id, profile]),
  );
  const attachments = await messageAttachmentUrls(rows);

  const messages = rows.map((message) => {
    const profile = profileMap.get(message.sender_id);
    return {
      id: message.message_id,
      senderId: message.sender_id,
      senderName:
        message.sender_id === currentUserId
          ? "You"
          : displayName(profile ?? null, "Project member"),
      senderAvatarUrl: profile?.avatar_url ?? null,
      message: message.message,
      attachmentUrl: attachments.get(message.message_id) ?? null,
      attachmentType: message.attachment_type,
      createdAt: message.created_at,
      mine: message.sender_id === currentUserId,
    };
  });
  return { messages, hasOlderMessages };
}

export async function getProjectConversationMessages(
  conversationId: string,
  currentUserId: string,
  after?: { createdAt: string; messageId: string },
): Promise<WorkspaceMessage[]> {
  let query = supabase
    .from("messages")
    .select(
      "message_id, sender_id, message, attachment_url, attachment_type, created_at",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .order("message_id", { ascending: true })
    .limit(500);
  if (after) {
    query = query.or(
      `created_at.gt.${after.createdAt},and(created_at.eq.${after.createdAt},message_id.gt.${after.messageId})`,
    );
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data?.length) return [];

  const senderIds = [...new Set(data.map((message) => message.sender_id))];
  const profilesResult = await supabase
    .from("profiles")
    .select("user_id, display_name, first_name, last_name, avatar_url")
    .in("user_id", senderIds);
  if (profilesResult.error) throw new Error(profilesResult.error.message);
  const profileMap = new Map(
    (profilesResult.data ?? []).map((profile) => [profile.user_id, profile]),
  );
  const attachments = await messageAttachmentUrls(data);

  return data.map((message) => {
    const profile = profileMap.get(message.sender_id);
    return {
      id: message.message_id,
      senderId: message.sender_id,
      senderName:
        message.sender_id === currentUserId
          ? "You"
          : displayName(profile ?? null, "Project member"),
      senderAvatarUrl: profile?.avatar_url ?? null,
      message: message.message,
      attachmentUrl: attachments.get(message.message_id) ?? null,
      attachmentType: message.attachment_type,
      createdAt: message.created_at,
      mine: message.sender_id === currentUserId,
    };
  });
}

export async function sendProjectMessage(
  orderId: string,
  message: string,
  messageId: string,
  attachment?: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{
  attachmentUrl: string | null;
  attachmentType: string | null;
  conversationId: string | null;
}> {
  const senderId = await currentUserId();
  const content = message.trim();
  if (!content && !attachment) {
    return { attachmentUrl: null, attachmentType: null, conversationId: null };
  }
  const { data: conversationId, error: conversationError } = await supabase.rpc(
    "worksync_ensure_order_conversation",
    { p_order: orderId },
  );
  if (conversationError) throw new Error(conversationError.message);
  if (typeof conversationId !== "string")
    throw new Error("Unable to open the project conversation.");
  let attachmentUrl: string | null = null;
  let attachmentType: string | null = null;
  let uploadedPath: string | null = null;
  let r2UploadId: string | null = null;

  if (attachment) {
    if (attachment.size > MAX_ATTACHMENT_SIZE) {
      throw new Error("Attachments must be 1 GB or smaller.");
    }

    if (usesR2Storage(attachment.size)) {
      const uploaded = await uploadLargeFile(
        attachment,
        {
          purpose: "message",
          targetId: conversationId,
        },
        onProgress,
        signal,
      );
      uploadedPath = uploaded.reference;
      r2UploadId = uploaded.uploadId;
      attachmentType = uploaded.contentType;
    } else {
      if (attachment.size > SUPABASE_MAX_FILE_BYTES)
        throw new Error("Attachments must be 50 MB or smaller.");
      const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${senderId}/${conversationId}/${messageId}-${safeName}`;
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
  }

  const { error: messageError } = await supabase.from("messages").insert({
    message_id: messageId,
    conversation_id: conversationId,
    sender_id: senderId,
    message: content || attachment?.name || "Attachment",
    attachment_url: uploadedPath,
    attachment_type: attachmentType,
  });
  if (messageError) {
    if (r2UploadId) {
      await deleteUnusedLargeFile(r2UploadId).catch(() => undefined);
    } else if (uploadedPath) {
      await supabase.storage
        .from(MESSAGE_ATTACHMENTS_BUCKET)
        .remove([uploadedPath]);
    }
    throw new Error(messageError.message);
  }

  if (r2UploadId) {
    try {
      attachmentUrl = await getLargeFileUrl("message", messageId);
    } catch {
      attachmentUrl = null;
    }
  }

  return { attachmentUrl, attachmentType, conversationId };
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
  const [orderResult, clientResult, freelancerResult] = await Promise.all([
    supabase
      .from("service_orders")
      .select("client_id, freelancer_id, service_id")
      .eq("order_id", orderId)
      .maybeSingle(),
    supabase
      .from("client_profiles")
      .select("client_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("freelancer_profiles")
      .select("freelancer_id")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const firstError =
    orderResult.error || clientResult.error || freelancerResult.error;
  if (firstError) throw new Error(firstError.message);
  if (!orderResult.data) throw new Error("Project order not found.");

  const party =
    clientResult.data?.client_id === orderResult.data.client_id
      ? "client"
      : freelancerResult.data?.freelancer_id === orderResult.data.freelancer_id
        ? "freelancer"
        : null;
  if (!party) {
    throw new Error("Only project participants can update this agreement.");
  }

  const existingContract = await supabase
    .from("contracts")
    .select("contract_id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (existingContract.error) throw new Error(existingContract.error.message);

  let contractId = existingContract.data?.contract_id;
  if (!contractId) {
    const serviceResult = await supabase
      .from("services")
      .select("price, delivery_time_days, revisions_count")
      .eq("service_id", orderResult.data.service_id)
      .maybeSingle();
    if (serviceResult.error) throw new Error(serviceResult.error.message);
    if (!serviceResult.data) {
      throw new Error("The service for this project could not be found.");
    }

    const createdContract = await supabase
      .from("contracts")
      .insert({
        order_id: orderId,
        final_price: serviceResult.data.price,
        delivery_time_days: serviceResult.data.delivery_time_days,
        revisions_count: serviceResult.data.revisions_count,
      })
      .select("contract_id")
      .single();

    if (createdContract.error) {
      if (createdContract.error.code !== "23505") {
        throw new Error(
          `This project has no agreement yet and it could not be created: ${createdContract.error.message}`,
        );
      }
      const concurrentContract = await supabase
        .from("contracts")
        .select("contract_id")
        .eq("order_id", orderId)
        .single();
      if (concurrentContract.error)
        throw new Error(concurrentContract.error.message);
      contractId = concurrentContract.data.contract_id;
    } else {
      contractId = createdContract.data.contract_id;
    }
  }

  return { contractId, party };
}

export async function respondToProjectAgreement(
  orderId: string,
  accepted: boolean,
): Promise<void> {
  const { contractId, party } = await getAgreementContext(orderId);
  const signatureColumn =
    party === "client" ? "client_signed_at" : "freelancer_signed_at";
  const update = {
    [signatureColumn]: accepted ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from("contracts")
    .update(update)
    .eq("contract_id", contractId)
    .select("contract_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      "The agreement was not updated. Check the contracts update policy.",
    );
  }
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

  // The checked contract trigger resets approvals in the same transaction.
}

export async function respondToProjectAgreementItem(
  orderId: string,
  itemKey: string,
  approved: boolean,
): Promise<void> {
  const { contractId, party } = await getAgreementContext(orderId);
  const timestampColumn =
    party === "client" ? "client_approved_at" : "freelancer_approved_at";
  const values = approved
    ? { [timestampColumn]: new Date().toISOString() }
    : { client_approved_at: null, freelancer_approved_at: null };
  // Both participants can approve a new item at nearly the same time. Upsert
  // against the unique key applies their timestamps to the same approval row.
  const { data, error } = await supabase
    .from("contract_item_approvals")
    .upsert(
      { contract_id: contractId, item_key: itemKey, ...values },
      { onConflict: "contract_id,item_key" },
    )
    .select("approval_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      "The item approval was not updated. Check the approval table policies.",
    );
  }
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

  // The checked contract trigger resets approvals in the same transaction.
}
