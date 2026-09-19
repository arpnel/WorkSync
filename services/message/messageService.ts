import { supabase } from "@/lib/supabaseClient";
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

async function getParticipants(
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
  const currentUserId = await getCurrentUserId();

  const { data: memberships, error: membershipError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", currentUserId);

  if (membershipError) {
    throw membershipError;
  }

  const conversationIds = [
    ...new Set((memberships ?? []).map((row) => row.conversation_id)),
  ];

  if (conversationIds.length === 0) {
    return { currentUserId, conversations: [] };
  }

  const [conversationsResult, participantsResult, messagesResult] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("conversation_id, project_id, order_id, job_id, created_at")
        .in("conversation_id", conversationIds),
      supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", conversationIds)
        .neq("user_id", currentUserId),
      supabase
        .from("messages")
        .select(
          "message_id, conversation_id, sender_id, message, created_at, read_at",
        )
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false }),
    ]);

  if (conversationsResult.error) {
    throw conversationsResult.error;
  }

  if (participantsResult.error) {
    throw participantsResult.error;
  }

  if (messagesResult.error) {
    throw messagesResult.error;
  }

  const otherUserIds = [
    ...new Set(
      (participantsResult.data ?? []).map((participant) => participant.user_id),
    ),
  ];
  const participantProfiles = await getParticipants(otherUserIds);

  const projectIds = [
    ...new Set(
      (conversationsResult.data ?? [])
        .map((conversation) => conversation.project_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const projectsResult = projectIds.length
    ? await supabase
        .from("projects")
        .select("project_id, title")
        .in("project_id", projectIds)
    : { data: [], error: null };

  if (projectsResult.error) {
    throw projectsResult.error;
  }

  const projectTitles = new Map(
    (projectsResult.data ?? []).map((project) => [
      project.project_id,
      project.title,
    ]),
  );
  const participantByConversation = new Map(
    (participantsResult.data ?? []).map((participant) => [
      participant.conversation_id,
      participantProfiles.get(participant.user_id),
    ]),
  );

  const messagesByConversation = new Map<string, typeof messagesResult.data>();

  for (const message of messagesResult.data ?? []) {
    const existing = messagesByConversation.get(message.conversation_id) ?? [];
    existing.push(message);
    messagesByConversation.set(message.conversation_id, existing);
  }

  const conversationRows = [
    ...new Map(
      (conversationsResult.data ?? [])
        .filter((row) => conversationIds.includes(row.conversation_id))
        .map((row) => [row.conversation_id, row]),
    ).values(),
  ];
  const conversations = conversationRows.map(
    (conversation): MessageConversation => {
      const messages =
        messagesByConversation.get(conversation.conversation_id) ?? [];
      const participant = participantByConversation.get(
        conversation.conversation_id,
      ) ?? {
        userId: "",
        name: "Conversation",
        role: null,
        avatarUrl: null,
      };
      const lastMessage = messages[0];

      return {
        conversationId: conversation.conversation_id,
        projectId: conversation.project_id,
        orderId: conversation.order_id,
        jobId: conversation.job_id,
        projectTitle: conversation.project_id
          ? (projectTitles.get(conversation.project_id) ?? null)
          : null,
        participant,
        lastMessage: lastMessage?.message ?? "No messages yet",
        lastMessageAt: lastMessage?.created_at ?? conversation.created_at,
        unreadCount: messages.filter(
          (message) =>
            message.sender_id !== currentUserId && message.read_at === null,
        ).length,
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
): Promise<void> {
  const senderId = await getCurrentUserId();
  const cleanMessage = message.trim();
  if (!cleanMessage && !attachment) return;
  if (cleanMessage.length > 10000)
    throw new Error("Messages must be 10,000 characters or shorter.");
  let path: string | null = null;
  if (attachment) {
    if (attachment.size > 10 * 1024 * 1024)
      throw new Error("Files must be 10 MB or smaller.");
    const name = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    path =
      senderId + "/" + conversationId + "/" + crypto.randomUUID() + "-" + name;
    const { error } = await supabase.storage
      .from("message-attachments")
      .upload(path, attachment);
    if (error)
      throw new Error(
        "Unable to upload the file. Please try again or contact support.",
      );
  }
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    message: cleanMessage || attachment?.name || "Attachment",
    attachment_url: path,
    attachment_type: attachment
      ? attachment.type || "application/octet-stream"
      : null,
  });
  if (error) {
    if (path) await supabase.storage.from("message-attachments").remove([path]);
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

export async function getMessageAttachmentUrl(value: string): Promise<string> {
  if (/^https?:\/\//i.test(value)) return value;
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

export function subscribeToConversationMessages(
  conversationId: string,
  onChange: () => void,
) {
  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
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
