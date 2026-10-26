"use client";

import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { passwordMeetsRequirements } from "@/lib/validation/auth.validation";
import {
  changeEmailOnServer,
  updatePasswordOnServer,
} from "@/services/auth/passwordService";
import { useTheme } from "next-themes";
import { StyledSelect } from "@/components/ui/styled-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AccountSettings() {
  const { theme, setTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
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
            sessionError?.message ?? "Please sign in to manage your account.",
          );
          return;
        }
        setEmail(data.session.user.email ?? "");
        setReady(true);
      } catch (loadError) {
        if (!alive) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load your account settings.",
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function run(operation: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      setFeedback(await operation());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update your account.",
      );
    } finally {
      setBusy(false);
    }
  }

  function changeEmail(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await changeEmailOnServer(newEmail.trim(), emailCurrentPassword);
      setNewEmail("");
      setEmailCurrentPassword("");
      return "Email change requested. Follow the confirmation instructions sent by WorkSync to finish the change.";
    });
  }

  function changePassword(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (!passwordMeetsRequirements(password))
        throw new Error(
          "Password must have at least 8 characters, uppercase and lowercase letters, a number, and a special character.",
        );
      if (!currentPassword) throw new Error("Enter your current password.");
      if (password !== confirm) throw new Error("Passwords do not match.");
      await updatePasswordOnServer(password, currentPassword);
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
      return "Password updated.";
    });
  }

  if (!ready && !error)
    return (
      <ContentSkeleton
        label="Loading account settings"
        variant="account-settings"
      />
    );

  return (
    <div className="space-y-6">
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
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose how WorkSync looks on this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-lg space-y-2">
          <Label htmlFor="appearance-theme">Theme</Label>
          <StyledSelect
            id="appearance-theme"
            value={theme ?? "system"}
            onChange={(event) => setTheme(event.target.value)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </StyledSelect>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Manage your sign-in email, password, and active sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="max-w-lg space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Change email address</h3>
              <p className="mt-1 break-all text-sm text-muted-foreground">
                Current email: {email || "Not available"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your current password. WorkSync will send confirmation
                instructions before the new address takes effect.
              </p>
            </div>
            <form onSubmit={changeEmail} className="space-y-3">
              <label className="block text-sm">
                New email address
                <Input
                  type="email"
                  autoComplete="email"
                  required
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                />
              </label>
              <label className="block text-sm">
                Current password
                <Input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={emailCurrentPassword}
                  onChange={(event) =>
                    setEmailCurrentPassword(event.target.value)
                  }
                />
              </label>
              <Button
                disabled={
                  !ready ||
                  busy ||
                  !newEmail.trim() ||
                  newEmail.trim().toLowerCase() === email.toLowerCase() ||
                  !emailCurrentPassword
                }
                variant="outline"
              >
                Request email change
              </Button>
            </form>
          </section>

          <section className="max-w-lg space-y-3 border-t pt-5">
            <div>
              <h3 className="text-sm font-semibold">Change password</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Use your current password to set a new one.
              </p>
            </div>
            <form onSubmit={changePassword} className="space-y-3">
              <label className="block text-sm">
                Current password
                <Input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
              <label className="block text-sm">
                New password
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <PasswordRequirements password={password} />
              </label>
              <label className="block text-sm">
                Confirm password
                <Input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </label>
              <Button disabled={!ready || busy} variant="outline">
                Change password
              </Button>
            </form>
          </section>

          <Button
            variant="outline"
            disabled={!ready || busy}
            onClick={() =>
              void run(async () => {
                const { error: signOutError } = await supabase.auth.signOut({
                  scope: "others",
                });
                if (signOutError) throw signOutError;
                return "Other sessions signed out. Existing access tokens remain valid until they expire.";
              })
            }
          >
            Sign out other sessions
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
