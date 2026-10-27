import { readPageCache } from "@/lib/pageReadCache";
import { supabase } from "@/lib/supabaseClient";
import { getActiveAccountContext } from "@/services/marketplace/AccountServices";
import { LARGE_FILE_MAX_BYTES, SUPABASE_MAX_FILE_BYTES, usesR2Storage } from "@/lib/storage/hybridStorage";
import { deleteUnusedLargeFile, getLargeFileUrl, uploadLargeFile } from "@/services/storage/hybridStorageClient";
import type {
  ChatMessage,
  MessageConversation,
  MessageParticipant,
} from "@/types/message/message";

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!user) {
    throw new Error("User not authenticated.");
  }

  return user.id;
}

function getParticipants(
  userIds: string[],
): Promise<Map<string, MessageParticipant>> {
  const ids = [...new Set(userIds)].sort();
  return readPageCache("message-participants:" + ids.join(","), () =>
    fetchParticipants(ids),
  );
}
async function fetchParticipants(
  userIds: string[],
): Promise<Map<string, MessageParticipant>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const [profilesResult, usersResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, display_name, first_name, last_name, avatar_url")
      .in("user_id", userIds),
    supabase
      .from("Users")
      .select("user_id, email, role")
      .in("user_id", userIds),
  ]);

  if (profilesResult.error) {
    throw profilesResult.error;
  }

  if (usersResult.error) {
    throw usersResult.error;
  }

  const profiles = new Map(
    (profilesResult.data ?? []).map((profile) => [profile.user_id, profile]),
  );
  const users = new Map(
    (usersResult.data ?? []).map((user) => [user.user_id, user]),
  );

  return new Map(
    userIds.map((userId) => {
      const profile = profiles.get(userId);
      const user = users.get(userId);
      const fullName = [profile?.first_name, profile?.last_name]
        .filter(Boolean)
        .join(" ");

      return [
        userId,
        {
          userId,
          name:
            profile?.display_name?.trim() ||
            fullName ||
            user?.email ||
            "WorkSync user",
          role: user?.role ?? null,
          avatarUrl: profile?.avatar_url ?? null,
        },
      ];
    }),
  );
}

export async function getMessageConversations(): Promise<{
  currentUserId: string;
  conversations: MessageConversation[];
}> {
  const account = await getActiveAccountContext();
  const currentUserId = account.userId;
  const activeProfileId = account.profileId;
  if (!activeProfileId) return { currentUserId, conversations: [] };

  const { data: summaryRows, error: summaryError } = await supabase.rpc(
    "worksync_get_message_conversation_summaries",
  );
  if (summaryError) throw summaryError;
  const summaries = (summaryRows ?? []) as {
    conversation_id: string;
    last_message: string | null;
    last_message_at: string;
    unread_count: number | string;
  }[];
  const conversationIds = [
    ...new Set(summaries.map((row) => row.conversation_id)),
  ];

  if (conversationIds.length === 0) {
    return { currentUserId, conversations: [] };
  }

  const [conversationsResult, participantsResult] = await Promise.all([
      supabase
        .from("conversations")
        .select("conversation_id, project_id, order_id, job_id, created_at")
        .in("conversation_id", conversationIds),
      supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", conversationIds),
    ]);

  if (conversationsResult.error) {
    throw conversationsResult.error;
  }

  if (participantsResult.error) {
    throw participantsResult.error;
  }

  const projectIds = [
    ...new Set(
      (conversationsResult.data ?? [])
        .map((conversation) => conversation.project_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const orderIds = [
    ...new Set(
      (conversationsResult.data ?? [])
        .map((conversation) => conversation.order_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const jobIds = [
    ...new Set(
      (conversationsResult.data ?? [])
        .map((conversation) => conversation.job_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const activeJobApplications =
    account.role === "freelancer" && jobIds.length
      ? supabase
          .from("job_applications")
          .select("job_id")
          .eq("freelancer_id", activeProfileId)
          .in("job_id", jobIds)
      : Promise.resolve({ data: [], error: null });

  const [
    projectsResult,
    projectsByOrderResult,
    jobsResult,
    serviceOrdersResult,
    contractsResult,
    activeJobApplicationsResult,
  ] = await Promise.all([
    projectIds.length
      ? supabase
          .from("projects")
          .select("project_id, title, client_id, freelancer_id")
          .in("project_id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase
          .from("projects")
          .select("order_id, title")
          .in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length
      ? supabase
          .from("jobs")
          .select("job_id, title, client_id")
          .in("job_id", jobIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase
          .from("service_orders")
          .select("order_id, service_id, client_id, freelancer_id")
          .in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase
          .from("contracts")
          .select("order_id, terms")
          .in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    activeJobApplications,
  ]);

  if (serviceOrdersResult.error) throw serviceOrdersResult.error;
  if (contractsResult.error) throw contractsResult.error;
  if (projectsByOrderResult.error) throw projectsByOrderResult.error;
  if (jobsResult.error) throw jobsResult.error;
  if (activeJobApplicationsResult.error)
    throw activeJobApplicationsResult.error;
  const serviceIds = [
    ...new Set(
      (serviceOrdersResult.data ?? [])
        .map((order) => order.service_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const servicesResult = serviceIds.length
    ? await supabase
        .from("services")
        .select("service_id, title")
        .in("service_id", serviceIds)
    : { data: [], error: null };
  if (servicesResult.error) throw servicesResult.error;
  if (projectsResult.error) {
    throw projectsResult.error;
  }

  const projectsById = new Map(
    (projectsResult.data ?? []).map((project) => [project.project_id, project]),
  );
  const ordersById = new Map(
    (serviceOrdersResult.data ?? []).map((order) => [order.order_id, order]),
  );
  const jobsById = new Map(
    (jobsResult.data ?? []).map((job) => [job.job_id, job]),
  );
  const activeJobIds = new Set(
    (activeJobApplicationsResult.data ?? []).map((application) => application.job_id),
  );
  const belongsToActiveProfile = (owner: {
    client_id?: string | null;
    freelancer_id?: string | null;
  } | undefined) =>
    account.role === "client"
      ? owner?.client_id === activeProfileId
      : owner?.freelancer_id === activeProfileId;
  const conversationRows = (conversationsResult.data ?? []).filter(
    (conversation) =>
      (conversation.project_id &&
        belongsToActiveProfile(projectsById.get(conversation.project_id))) ||
      (conversation.order_id &&
        belongsToActiveProfile(ordersById.get(conversation.order_id))) ||
      (conversation.job_id &&
        (account.role === "client"
          ? jobsById.get(conversation.job_id)?.client_id === activeProfileId
          : activeJobIds.has(conversation.job_id))),
  );
  if (conversationRows.length === 0)
    return { currentUserId, conversations: [] };

  const visibleConversationIds = new Set(
    conversationRows.map((conversation) => conversation.conversation_id),
  );
  const visibleParticipantRows = (participantsResult.data ?? []).filter(
    (participant) => visibleConversationIds.has(participant.conversation_id),
  );
  const participantUserIds = [
    ...new Set([
      ...visibleParticipantRows.map((participant) => participant.user_id),
      currentUserId,
    ]),
  ];
  const participantProfiles = await getParticipants(participantUserIds);

  const projectTitles = new Map(
    (projectsResult.data ?? []).map((project) => [
      project.project_id,
      project.title,
    ]),
  );
  const orderProjectTitles = new Map(
    (projectsByOrderResult.data ?? []).map((project) => [
      project.order_id,
      project.title,
    ]),
  );
  const jobTitles = new Map(
    (jobsResult.data ?? []).map((job) => [job.job_id, job.title]),
  );
  const serviceTitles = new Map(
    (servicesResult.data ?? []).map((service) => [
      service.service_id,
      service.title,
    ]),
  );
  const serviceIdByOrder = new Map(
    (serviceOrdersResult.data ?? []).map((order) => [
      order.order_id,
      order.service_id,
    ]),
  );
  const contractTitles = new Map(
    (contractsResult.data ?? []).map((contract) => {
      let title: unknown = null;
      try {
        const terms =
          typeof contract.terms === "string"
            ? JSON.parse(contract.terms)
            : contract.terms;
        title =
          terms && typeof terms === "object"
            ? (terms as Record<string, unknown>).projectTitle
            : null;
      } catch {
        title = null;
      }
      return [contract.order_id, typeof title === "string" ? title : null];
    }),
  );
  const cleanTitle = (title: string | null | undefined) => {
    const cleaned = title?.trim();
    return cleaned &&
      ![
        "worksync project",
        "project",
        "project conversation",
        "order conversation",
        "job discussion",
      ].includes(cleaned.toLowerCase())
      ? cleaned
      : null;
  };
  const participantByConversation = new Map<
    string,
    MessageParticipant | undefined
  >(
    visibleParticipantRows
      .filter((participant) => participant.user_id !== currentUserId)
      .map((participant) => {
        const person = participantProfiles.get(participant.user_id);
        return [
          participant.conversation_id,
          person
            ? {
                ...person,
                role: account.role === "client" ? "freelancer" : "client",
              }
            : undefined,
        ] as const;
      }),
  );

  const participantsByConversation = new Map<
    string,
    typeof participantsResult.data
  >();
  for (const participant of visibleParticipantRows) {
    const rows =
      participantsByConversation.get(participant.conversation_id) ?? [];
    rows.push(participant);
    participantsByConversation.set(participant.conversation_id, rows);
  }
  const summaryByConversation = new Map(
    summaries.map((summary) => [summary.conversation_id, summary]),
  );

  const conversations = conversationRows.map(
    (conversation): MessageConversation => {
      const summary = summaryByConversation.get(conversation.conversation_id);
      const participantRows =
        participantsByConversation.get(conversation.conversation_id) ?? [];
      const participant = participantByConversation.get(
        conversation.conversation_id,
      ) ?? {
        userId: "",
        name: "Conversation",
        role: null,
        avatarUrl: null,
      };
      const orderId = conversation.order_id;
      const linkedTitle =
        cleanTitle(
          conversation.project_id
            ? projectTitles.get(conversation.project_id)
            : null,
        ) ??
        cleanTitle(orderId ? orderProjectTitles.get(orderId) : null) ??
        cleanTitle(orderId ? contractTitles.get(orderId) : null) ??
        cleanTitle(
          orderId
            ? serviceTitles.get(serviceIdByOrder.get(orderId) ?? "")
            : null,
        ) ??
        cleanTitle(
          conversation.job_id ? jobTitles.get(conversation.job_id) : null,
        );

      return {
        conversationId: conversation.conversation_id,
        projectId: conversation.project_id,
        orderId: conversation.order_id,
        jobId: conversation.job_id,
        projectTitle: conversation.project_id ? linkedTitle : null,
        conversationTitle:
          linkedTitle ??
          (conversation.order_id
            ? "Order conversation"
            : conversation.job_id
              ? "Job discussion"
              : "Project conversation"),
        participantIntro: (() => {
          const people = participantRows
            .filter((row) => row.user_id !== currentUserId)
            .map((row) => participantProfiles.get(row.user_id))
            .filter((person): person is MessageParticipant => Boolean(person));
          return people.length > 1
            ? `You and ${people.length} participants are now in this chat.`
            : people[0]
              ? `You and ${people[0].name} are now in this chat.`
              : "You are now in this chat.";
        })(),
        participant,
        lastMessage: summary?.last_message ?? "No messages yet",
        lastMessageAt: summary?.last_message_at ?? conversation.created_at,
        unreadCount: Number(summary?.unread_count ?? 0),
      };
    },
  );

  conversations.sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );

  return { currentUserId, conversations };
}

export async function getConversationMessages(
  conversationId: string,
): Promise<ChatMessage[]> {
  const currentUserId = await getCurrentUserId();

  const { data: membership, error: membershipError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", currentUserId)
    .maybeSingle();

  if (membershipError) {
    throw membershipError;
  }

  if (!membership) {
    throw new Error("You are not a participant in this conversation.");
  }

  // Fetch every page so shared history/search includes older attachments.
  const messages: {
    message_id: string;
    conversation_id: string;
    sender_id: string;
    message: string | null;
    attachment_url: string | null;
    attachment_type: string | null;
    created_at: string;
    read_at: string | null;
  }[] = [];
  const pageSize = 500;
  const seenMessageIds = new Set<string>();
  let cursor: { createdAt: string; messageId: string } | null = null;
  for (;;) {
    let query = supabase
      .from("messages")
      .select(
        "message_id, conversation_id, sender_id, message, attachment_url, attachment_type, created_at, read_at",
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .order("message_id", { ascending: true })
      .limit(pageSize);
    if (cursor) {
      query = query.or(
        `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},message_id.gt.${cursor.messageId})`,
      );
    }
    const { data, error } = await query;
    if (error) throw error;
    let added = 0;
    for (const message of data ?? []) {
      // Keep the data boundary scoped even if a stale/invalid response arrives.
      if (
        message.conversation_id !== conversationId ||
        seenMessageIds.has(message.message_id)
      )
        continue;
      seenMessageIds.add(message.message_id);
      messages.push(message);
      added += 1;
    }
    if (!data || data.length < pageSize || added === 0) break;
    const last = data[data.length - 1];
    cursor = { createdAt: last.created_at, messageId: last.message_id };
  }

  const senderIds = [
    ...new Set((messages ?? []).map((message) => message.sender_id)),
  ];
  const participants = await getParticipants(senderIds);

  return (messages ?? []).map((message) => {
    const sender = participants.get(message.sender_id);

    return {
      messageId: message.message_id,
      conversationId: message.conversation_id,
      senderId: message.sender_id,
      senderName:
        message.sender_id === currentUserId ? "You" : (sender?.name ?? "User"),
      senderAvatarUrl: sender?.avatarUrl ?? null,
      message: message.message ?? "",
      attachmentUrl: message.attachment_url,
      attachmentType: message.attachment_type,
      createdAt: message.created_at,
      readAt: message.read_at,
    };
  });
}

export async function sendConversationMessage(
  conversationId: string,
  message: string,
  attachment?: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const senderId = await getCurrentUserId();
  const cleanMessage = message.trim();
  if (!cleanMessage && !attachment) return;
  if (cleanMessage.length > 10000)
    throw new Error("Messages must be 10,000 characters or shorter.");
  let path: string | null = null;
  let r2UploadId: string | null = null;
  const messageId = crypto.randomUUID();
  if (attachment) {
    if (attachment.size > LARGE_FILE_MAX_BYTES)
      throw new Error("Files must be 1 GB or smaller.");
    if (usesR2Storage(attachment.size)) {
      const uploaded = await uploadLargeFile(attachment, { purpose: "message", targetId: conversationId }, onProgress, signal);
      path = uploaded.reference;
      r2UploadId = uploaded.uploadId;
    } else {
      if (attachment.size > SUPABASE_MAX_FILE_BYTES)
        throw new Error("Files must be 50 MB or smaller.");
      const name = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      path = senderId + "/" + conversationId + "/" + crypto.randomUUID() + "-" + name;
      const { error } = await supabase.storage.from("message-attachments").upload(path, attachment);
      if (error)
        throw new Error("Unable to upload the file. Please try again or contact support.");
    }
  }
  const { error } = await supabase.from("messages").insert({
    message_id: messageId,
    conversation_id: conversationId,
    sender_id: senderId,
    message: cleanMessage || attachment?.name || "Attachment",
    attachment_url: path,
    attachment_type: attachment
      ? attachment.type || "application/octet-stream"
      : null,
  });
  if (error) {
    if (r2UploadId) await deleteUnusedLargeFile(r2UploadId).catch(() => undefined);
    else if (path) await supabase.storage.from("message-attachments").remove([path]);
    throw new Error(error.message);
  }
}

export function isMessagingSetupMissing(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "PGRST205" || error.code === "42P01";
}

export async function getMessagingPreferences(): Promise<
  import("@/types/message/message").MessagingPreferences
> {
  const userId = await getCurrentUserId();
  const [preferences, blocks] = await Promise.all([
    supabase
      .from("conversation_preferences")
      .select("conversation_id, is_archived, is_pinned")
      .eq("user_id", userId),
    supabase
      .from("user_blocks")
      .select("blocker_id, blocked_id")
      .or("blocker_id.eq." + userId + ",blocked_id.eq." + userId),
  ]);
  if (preferences.error) throw preferences.error;
  if (blocks.error) throw blocks.error;
  return {
    preferences: preferences.data ?? [],
    blockedUserIds: (blocks.data ?? [])
      .filter((b) => b.blocker_id === userId)
      .map((b) => b.blocked_id),
    blockedByUserIds: (blocks.data ?? [])
      .filter((b) => b.blocked_id === userId)
      .map((b) => b.blocker_id),
  };
}

export async function saveConversationPreference(
  conversationId: string,
  preference: { is_archived: boolean; is_pinned: boolean },
) {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from("conversation_preferences").upsert(
    {
      conversation_id: conversationId,
      user_id: userId,
      ...preference,
    },
    { onConflict: "conversation_id,user_id" },
  );
  if (error) throw error;
}

export async function setUserBlocked(blockedId: string, blocked: boolean) {
  const userId = await getCurrentUserId();
  if (!blockedId || blockedId === userId) throw new Error("Invalid user.");
  const result = blocked
    ? await supabase
        .from("user_blocks")
        .upsert(
          { blocker_id: userId, blocked_id: blockedId },
          { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
        )
    : await supabase
        .from("user_blocks")
        .delete()
        .eq("blocker_id", userId)
        .eq("blocked_id", blockedId);
  if (result.error) throw result.error;
}

export async function getMessageAttachmentUrl(value: string, messageId?: string): Promise<string> {
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("r2:")) {
    if (!messageId) throw new Error("This attachment is missing its message reference.");
    return getLargeFileUrl("message", messageId);
  }
  const { data, error } = await supabase.storage
    .from("message-attachments")
    .createSignedUrl(value, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}

export async function markConversationRead(
  conversationId: string,
): Promise<void> {
  const currentUserId = await getCurrentUserId();

  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_id", currentUserId)
    .is("read_at", null);

  if (error) {
    throw error;
  }
}

export function createMessageTypingChannel(
  conversationId: string,
  currentUserId: string,
  onTypingChange: (isTyping: boolean) => void,
) {
  const channel = supabase
    .channel(`message-typing:${conversationId}`, {
      config: { broadcast: { self: false } },
    })
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload.userId !== currentUserId)
        onTypingChange(Boolean(payload.isTyping));
    })
    .subscribe();

  return {
    channel,
    sendTyping: (isTyping: boolean) => {
      void channel.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: currentUserId, isTyping },
      });
    },
  };
}
export function subscribeToConversationMessages(
  conversationId: string,
  onChange: () => void,
  event: "*" | "INSERT" = "*",
) {
  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event,
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToUserConversations(onChange: () => void) {
  const channel = supabase
    .channel("message-conversations")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
