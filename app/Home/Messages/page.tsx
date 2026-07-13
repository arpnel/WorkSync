"use client";

import { useState } from "react";

import ChatLayout from "./components/ChatLayout";
import ChatHeader from "./components/ChatHeader";
import ConversationSidebar from "./components/ConversationSidebar";
import EmptyChat from "./components/EmptyChat";
import MessageInput from "./components/MessageInput";
import MessageScroller from "./components/MessageScroller";

import type { Conversation } from "./components/ConversationList";
import type { MessageItemProps } from "./components/MessageItem";

const conversations: Conversation[] = [
  {
    id: "1",
    name: "Mina Chen",
    role: "Product Designer",
    avatar: "",
    lastMessage: "Can you share the revised mockups?",
    lastMessageTime: "10:24 AM",
    unreadCount: 2,
    online: true,
  },
  {
    id: "2",
    name: "Drew Alvarez",
    role: "Marketing Lead",
    avatar: "",
    lastMessage: "The campaign brief is ready.",
    lastMessageTime: "Yesterday",
    unreadCount: 0,
    online: false,
  },
  {
    id: "3",
    name: "Riley Patel",
    role: "Developer",
    avatar: "",
    lastMessage: "I pushed the latest fixes.",
    lastMessageTime: "Monday",
    unreadCount: 1,
    online: true,
  },
];

const conversationMessages: Record<string, MessageItemProps[]> = {
  "1": [
    {
      id: "1",
      sender: "them",
      senderName: "Mina Chen",
      content: "Hi! I reviewed the latest draft.",
      timestamp: "10:20 AM",
      seen: true,
    },
  ],

  "2": [
    {
      id: "2",
      sender: "them",
      senderName: "Drew Alvarez",
      content: "The campaign brief is ready.",
      timestamp: "Yesterday",
      seen: true,
    },
  ],

  "3": [
    {
      id: "3",
      sender: "them",
      senderName: "Riley Patel",
      content: "I pushed the latest fixes.",
      timestamp: "Monday",
      seen: false,
    },
  ],
};




export default function MessagesPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | undefined
  >();

const messages = selectedConversationId
  ? conversationMessages[selectedConversationId] ?? []
  : [];
  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );

  const handleSendMessage = (text: string) => {
    const newMessage: MessageItemProps = {
      id: crypto.randomUUID(),
      sender: "me",
      senderName: "You",
      content: text,
      timestamp: "Just now",
      seen: false,
    };

<MessageScroller messages={messages} />
  };

  return (
    <ChatLayout
      sidebar={
        <ConversationSidebar
          conversations={conversations}
          selectedConversationId={selectedConversationId}
          onSelectConversation={setSelectedConversationId}
        />
      }
    >
      {selectedConversation ? (
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <ChatHeader
            name={selectedConversation.name}
            role={selectedConversation.role}
            project="Website Redesign"
            avatar={selectedConversation.avatar}
            online={selectedConversation.online}
            onViewProject={() => {
              console.log("Open project");
            }}
          />

          <MessageScroller messages={messages} />

          <MessageInput
            onSend={handleSendMessage}
            onAttach={() => {
              console.log("Attachment");
            }}
          />
        </div>
      ) : (
        <EmptyChat />
      )}
    </ChatLayout>
  );
}
