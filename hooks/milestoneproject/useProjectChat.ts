"use client";

import * as React from "react";

export interface ProjectChatMessage {
  id: number | string;
  sender: "client" | "freelancer";
  name: string;
  initials: string;
  time: string;
  message: string;
}

const INITIAL_MESSAGES: ProjectChatMessage[] = [
  {
    id: 1,
    sender: "client",
    name: "Sarah",
    initials: "SJ",
    time: "10:42 AM",
    message:
      "I would like to split the project into three milestones.",
  },
  {
    id: 2,
    sender: "freelancer",
    name: "Alex",
    initials: "AM",
    time: "10:45 AM",
    message:
      "That works for me. I added the proposed milestones.",
  },
  {
    id: 3,
    sender: "client",
    name: "Sarah",
    initials: "SJ",
    time: "10:48 AM",
    message:
      "Can we move ₱1,000 from development to the final integration milestone?",
  },
];

export interface UseProjectChatReturn {
  messages: ProjectChatMessage[];

  message: string;

  setMessage: (
    value: string
  ) => void;

  sendMessage: () => boolean;

  deleteMessage: (
    messageId: number | string
  ) => void;

  clearMessages: () => void;

  resetMessages: () => void;
}

export function useProjectChat(): UseProjectChatReturn {
  const [messages, setMessages] =
    React.useState<ProjectChatMessage[]>(
      INITIAL_MESSAGES
    );

  const [message, setMessage] =
    React.useState("");

  const sendMessage =
    React.useCallback(() => {
      const trimmedMessage =
        message.trim();

      if (!trimmedMessage) {
        return false;
      }

      const newMessage: ProjectChatMessage = {
        id: Date.now(),
        sender: "freelancer",
        name: "Alex",
        initials: "AM",
        time: new Date().toLocaleTimeString(
          [],
          {
            hour: "numeric",
            minute: "2-digit",
          }
        ),
        message: trimmedMessage,
      };

      setMessages((current) => [
        ...current,
        newMessage,
      ]);

      setMessage("");

      return true;
    }, [message]);

  const deleteMessage =
    React.useCallback(
      (messageId: number | string) => {
        setMessages((current) =>
          current.filter(
            (item) =>
              item.id !== messageId
          )
        );
      },
      []
    );

  const clearMessages =
    React.useCallback(() => {
      setMessages([]);
    }, []);

  const resetMessages =
    React.useCallback(() => {
      setMessages(
        INITIAL_MESSAGES.map(
          (message) => ({
            ...message,
          })
        )
      );
    }, []);

  return {
    messages,

    message,

    setMessage,

    sendMessage,

    deleteMessage,

    clearMessages,

    resetMessages,
  };
}

export default useProjectChat;