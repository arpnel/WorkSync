"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface MessageAccountSettings {
  activeStatus: boolean;
  typingIndicators: boolean;
  readReceipts: boolean;
  enterToSend: boolean;
  showMessagePreviews: boolean;
}

export const defaultMessageAccountSettings: MessageAccountSettings = {
  activeStatus: true,
  typingIndicators: true,
  readReceipts: true,
  enterToSend: true,
  showMessagePreviews: true,
};

const eventName = "message-account-settings-changed";

function parseSettings(value: unknown): MessageAccountSettings {
  const stored =
    value && typeof value === "object"
      ? (value as Partial<MessageAccountSettings>)
      : {};
  return {
    activeStatus:
      typeof stored.activeStatus === "boolean"
        ? stored.activeStatus
        : defaultMessageAccountSettings.activeStatus,
    typingIndicators:
      typeof stored.typingIndicators === "boolean"
        ? stored.typingIndicators
        : defaultMessageAccountSettings.typingIndicators,
    readReceipts:
      typeof stored.readReceipts === "boolean"
        ? stored.readReceipts
        : defaultMessageAccountSettings.readReceipts,
    enterToSend:
      typeof stored.enterToSend === "boolean"
        ? stored.enterToSend
        : defaultMessageAccountSettings.enterToSend,
    showMessagePreviews:
      typeof stored.showMessagePreviews === "boolean"
        ? stored.showMessagePreviews
        : defaultMessageAccountSettings.showMessagePreviews,
  };
}

export function useMessageAccountSettings() {
  const [settings, setSettings] = useState(defaultMessageAccountSettings);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error: authError } = await supabase.auth.getUser();
      if (!alive) return;
      if (authError || !data.user) {
        setError(authError?.message ?? "Sign in to manage message settings.");
      } else {
        setSettings(
          parseSettings(data.user.user_metadata?.message_preferences),
        );
      }
      setReady(true);
    };
    void load();

    const changed = (event: Event) => {
      const detail = (event as CustomEvent<MessageAccountSettings>).detail;
      if (detail) setSettings(parseSettings(detail));
    };
    window.addEventListener(eventName, changed);
    return () => {
      alive = false;
      window.removeEventListener(eventName, changed);
    };
  }, []);

  const update = useCallback(
    async (patch: Partial<MessageAccountSettings>) => {
      const next = { ...settings, ...patch };
      setSaving(true);
      setError("");
      const { error: updateError } = await supabase.auth.updateUser({
        data: { message_preferences: next },
      });
      setSaving(false);
      if (updateError) {
        setError(updateError.message);
        return false;
      }
      setSettings(next);
      window.dispatchEvent(new CustomEvent(eventName, { detail: next }));
      return true;
    },
    [settings],
  );

  return { settings, ready, saving, error, update };
}
