export interface MessageParticipant {
  userId: string;
  name: string;
  role: string | null;
  avatarUrl: string | null;
}

export interface MessageConversation {
  conversationId: string;
  projectId: string | null;
  orderId: string | null;
  jobId: string | null;
  projectTitle: string | null;
  participant: MessageParticipant;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ChatMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  message: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
  createdAt: string;
  readAt: string | null;
}
