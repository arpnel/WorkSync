"use client";

import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const groups = {
  messages: "Message updates",
  projects: "Projects, requests and applications",
  reviews: "Reviews",
  community: "Community activity",
};

const messageGroups = {
  projects: "Project and job chats",
  orders: "Order chats",
  direct: "Direct messages",
};

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export default function NotificationSettings() {
  const [hidden, setHidden] = useState<string[]>([]);
  const [hiddenMessages, setHiddenMessages] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!alive) return;
        if (sessionError || !data.session?.user) {
          setError(
            sessionError?.message ?? "Sign in required to manage notifications.",
          );
          return;
        }
        const metadata = data.session.user.user_metadata;
        setHidden(stringList(metadata?.hidden_notification_groups));
        setHiddenMessages(
          stringList(metadata?.hidden_message_notification_groups),
        );
        setReady(true);
      } catch (loadError) {
        if (!alive) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load notification preferences.",
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!ready && !error)
    return (
      <ContentSkeleton
        label="Loading notification settings"
        variant="notification-settings"
      />
    );

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription className="max-w-prose">
          Choose which updates appear in your notification list. Account and
          moderation notifications always remain visible. This controls in-app
          notifications.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-5">
        <div className="divide-y rounded-xl border">
          {Object.entries(groups).map(([key, label]) => (
            <div
              key={key}
              className="flex min-h-14 items-center justify-between gap-4 p-4"
            >
              <span
                id={`notification-group-${key}`}
                className="text-sm font-medium"
              >
                {label}
              </span>
              <Switch
                checked={!hidden.includes(key)}
                disabled={!ready || busy}
                aria-labelledby={`notification-group-${key}`}
                onCheckedChange={(checked) =>
                  setHidden((current) =>
                    checked
                      ? current.filter((item) => item !== key)
                      : [...current, key],
                  )
                }
              />
            </div>
          ))}
        </div>

        <section className="min-w-0 space-y-2">
          <div>
            <h3 className="text-sm font-semibold">
              Message updates by conversation
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose which conversations can add message alerts to your
              notification list.
            </p>
          </div>
          <div className="divide-y rounded-xl border">
            {Object.entries(messageGroups).map(([key, label]) => (
              <div
                key={key}
                className="flex min-h-14 items-center justify-between gap-4 p-4"
              >
                <span
                  id={`message-notification-group-${key}`}
                  className="text-sm font-medium"
                >
                  {label}
                </span>
                <Switch
                  checked={!hiddenMessages.includes(key)}
                  disabled={!ready || busy || hidden.includes("messages")}
                  aria-labelledby={`message-notification-group-${key}`}
                  onCheckedChange={(checked) =>
                    setHiddenMessages((current) =>
                      checked
                        ? current.filter((item) => item !== key)
                        : [...current, key],
                    )
                  }
                />
              </div>
            ))}
          </div>
          {hidden.includes("messages") && (
            <p className="text-xs text-muted-foreground">
              Turn on Message updates above to enable these choices.
            </p>
          )}
        </section>

        {error && (
          <p role="alert" className="break-words text-sm text-destructive">
            {error}
          </p>
        )}
        {feedback && (
          <p role="status" className="text-sm">
            {feedback}
          </p>
        )}
        <Button
          disabled={!ready || busy}
          variant="outline"
          onClick={async () => {
            setBusy(true);
            setError("");
            setFeedback("");
            try {
              const { error: updateError } = await supabase.auth.updateUser({
                data: {
                  hidden_notification_groups: hidden,
                  hidden_message_notification_groups: hiddenMessages,
                },
              });
              if (updateError) throw updateError;
              setFeedback("Notification preferences saved.");
              window.dispatchEvent(
                new Event("notification-preferences-changed"),
              );
            } catch (saveError) {
              setError(
                saveError instanceof Error
                  ? saveError.message
                  : "Unable to save notification preferences. Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Save notification preferences
        </Button>
      </CardContent>
    </Card>
  );
}
