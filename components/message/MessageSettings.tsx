"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useMessageAccountSettings } from "@/hooks/message/useMessageAccountSettings";

type SettingKey =
  | "activeStatus"
  | "typingIndicators"
  | "readReceipts"
  | "enterToSend"
  | "showMessagePreviews";

const groups: {
  title: string;
  options: { key: SettingKey; label: string; description: string }[];
}[] = [
  {
    title: "Active Status & Profile",
    options: [
      {
        key: "activeStatus",
        label: "Active status",
        description: "Show contacts when you are currently active in WorkSync.",
      },
    ],
  },
  {
    title: "Chat & Input Preferences",
    options: [
      {
        key: "enterToSend",
        label: "Send with Enter",
        description: "Press Enter to send; Shift + Enter starts a new line.",
      },
      {
        key: "showMessagePreviews",
        label: "Show message previews",
        description: "Display message text snippets in your conversation list.",
      },
      {
        key: "typingIndicators",
        label: "Typing indicators",
        description:
          "Let the other person know when you are typing in a conversation.",
      },
    ],
  },
  {
    title: "Privacy & Safety",
    options: [
      {
        key: "readReceipts",
        label: "Read receipts",
        description: "Let contacts see when you have read their messages.",
      },
    ],
  },
];

export default function MessageSettings() {
  const { settings, ready, saving, error, update } =
    useMessageAccountSettings();

  return (
    <Card id="messages" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Message settings
        </CardTitle>
        <CardDescription>
          Choose how conversations and message sending work for your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {groups.map((group) => (
          <section key={group.title} className="space-y-2">
            <h3 className="text-sm font-semibold">{group.title}</h3>
            <div className="divide-y rounded-xl border">
              {group.options.map(({ key, label, description }) => (
                <div
                  key={key}
                  className="flex min-h-16 items-center justify-between gap-4 p-4"
                >
                  <div className="min-w-0">
                    <p id={`message-setting-${key}`} className="text-sm font-medium">{label}</p>
                    <p id={`message-setting-description-${key}`} className="mt-1 text-sm text-muted-foreground">
                      {description}
                    </p>
                  </div>
                  <Switch
                    className="shrink-0"
                    checked={settings[key]}
                    disabled={!ready || saving}
                    aria-labelledby={`message-setting-${key}`}
                    aria-describedby={`message-setting-description-${key}`}
                    onCheckedChange={(checked) => void update({ [key]: checked })}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Notifications & Sounds</h3>
          <div className="rounded-xl bg-muted/50 p-4">
            <p className="text-sm font-medium">Message notifications</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose whether message updates appear in your notification list.
            </p>
            <Link
              href="/home/settings#notifications"
              className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Manage notification preferences
            </Link>
          </div>
        </section>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {saving && (
          <p role="status" className="text-sm text-muted-foreground">
            Saving message preferences...
          </p>
        )}
      </CardContent>
    </Card>
  );
}
