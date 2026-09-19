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
const groups = {
  messages: "Message updates",
  projects: "Projects, requests and applications",
  reviews: "Reviews",
};
export default function NotificationSettings() {
  const [hidden, setHidden] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!alive) return;
      if (error || !data.user) setError(error?.message ?? "Sign in required.");
      else {
        const value = data.user.user_metadata?.hidden_notification_groups;
        setHidden(
          Array.isArray(value)
            ? value.filter((v) => typeof v === "string")
            : [],
        );
        setReady(true);
      }
    });
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
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Choose which updates appear in your notification list. Account and
          moderation updates always remain visible. This controls in-app
          notifications.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {Object.entries(groups).map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={!hidden.includes(key)}
              disabled={!ready || busy}
              onChange={(e) =>
                setHidden((current) =>
                  e.target.checked
                    ? current.filter((item) => item !== key)
                    : [...current, key],
                )
              }
            />
            {label}
          </label>
        ))}
        {error && (
          <p role="alert" className="text-sm text-destructive">
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
            const { error } = await supabase.auth.updateUser({
              data: { hidden_notification_groups: hidden },
            });
            setBusy(false);
            if (error) setError(error.message);
            else {
              setFeedback("Notification preferences saved.");
              window.dispatchEvent(
                new Event("notification-preferences-changed"),
              );
            }
          }}
        >
          Save notification preferences
        </Button>
      </CardContent>
    </Card>
  );
}
