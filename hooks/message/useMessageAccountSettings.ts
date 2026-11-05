"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
const settingKeys: (keyof MessageAccountSettings)[] = [
  "activeStatus",
  "typingIndicators",
  "readReceipts",
  "enterToSend",
  "showMessagePreviews",
];

function sameSettings(a: MessageAccountSettings, b: MessageAccountSettings) {
  return settingKeys.every((key) => a[key] === b[key]);
}

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
  const [error, setError] = useState("");
  const settingsRef = useRef(defaultMessageAccountSettings);
  const persistedSettingsRef = useRef(defaultMessageAccountSettings);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    let alive = true;
    mountedRef.current = true;
    const load = async () => {
      try {
        const { data, error: authError } = await supabase.auth.getSession();
        if (!alive) return;
        if (authError || !data.session?.user) {
          setError(authError?.message ?? "Sign in to manage message settings.");
        } else {
          const loaded = parseSettings(data.session.user.user_metadata?.message_preferences);
          settingsRef.current = loaded;
          persistedSettingsRef.current = loaded;
          setSettings(loaded);
        }
      } catch (cause) {
        if (!alive) return;
        setError(
          cause instanceof Error && cause.message !== "Failed to fetch"
            ? cause.message
            : "Could not connect to WorkSync to load message settings. Check your connection and try again.",
        );
      } finally {
        if (alive) setReady(true);
      }
    };
    void load();

    const changed = (event: Event) => {
      const detail = (event as CustomEvent<MessageAccountSettings>).detail;
      if (detail) {
        const next = parseSettings(detail);
        settingsRef.current = next;
        setSettings(next);
      }
    };
    window.addEventListener(eventName, changed);
    return () => {
      alive = false;
      mountedRef.current = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      window.removeEventListener(eventName, changed);
    };
  }, []);

  const update = useCallback((patch: Partial<MessageAccountSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    setError("");
    window.dispatchEvent(new CustomEvent(eventName, { detail: next }));

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (sameSettings(next, persistedSettingsRef.current)) {
      saveTimerRef.current = null;
      return;
    }

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const saveLatest = async () => {
        if (!mountedRef.current) return;
        if (saveInFlightRef.current) {
          saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            void saveLatest();
          }, 250);
          return;
        }
        const snapshot = settingsRef.current;
        if (sameSettings(snapshot, persistedSettingsRef.current)) {
          return;
        }
        saveInFlightRef.current = true;
        let saved = false;
        try {
          const { error: updateError } = await supabase.auth.updateUser({
            data: { message_preferences: snapshot },
          });
          if (updateError) {
            if (mountedRef.current) setError(updateError.message);
            return;
          }
          persistedSettingsRef.current = snapshot;
          saved = true;
          if (mountedRef.current) setError("");
        } catch (cause) {
          if (mountedRef.current) setError(
            cause instanceof Error && cause.message !== "Failed to fetch"
              ? cause.message
              : "Could not connect to WorkSync to save message settings. Check your connection and try again.",
          );
        } finally {
          saveInFlightRef.current = false;
          if (mountedRef.current) {
            const current = settingsRef.current;
            const hasUnsavedChanges = !sameSettings(current, persistedSettingsRef.current);
            if (hasUnsavedChanges && saved && !saveTimerRef.current) {
              saveTimerRef.current = setTimeout(() => {
                saveTimerRef.current = null;
                void saveLatest();
              }, 5000);
            }
          }
        }
      };
      void saveLatest();
    }, 5000);
  }, []);

  return { settings, ready, error, update };
}
