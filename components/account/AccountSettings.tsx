"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { passwordMeetsRequirements } from "@/lib/validation/auth.validation";
import { updatePasswordOnServer } from "@/services/auth/passwordService";
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
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!alive) return;
      if (error || !data.user)
        setError(error?.message ?? "Please sign in to manage your account.");
      else {
        setEmail(data.user.email ?? "");
        setReady(true);
      }
    });
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
      const { error } = await supabase.auth.updateUser({
        email: newEmail.trim(),
      });
      if (error) throw error;
      setNewEmail("");
      return "Email change requested. Follow the email confirmation instructions to finish the change.";
    });
  }
  function changePassword(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (!passwordMeetsRequirements(password)) throw new Error("Password must have at least 8 characters, uppercase and lowercase letters, a number, and a special character.");
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
        <p role="alert" className="text-sm text-destructive">
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
          <CardDescription>Choose how WorkSync looks on this device.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-lg space-y-2">
          <Label htmlFor="appearance-theme">Theme</Label>
          <StyledSelect id="appearance-theme" value={theme ?? "system"} onChange={(event) => setTheme(event.target.value)}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </StyledSelect>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in as {email || "…"}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changeEmail} className="max-w-lg space-y-3">
            <label className="block text-sm">
              New email
              <Input
                type="email"
                autoComplete="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </label>
            <Button
              disabled={!ready || busy || newEmail.trim() === email}
              variant="outline"
            >
              Change email
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Choose a strong password. Your account security settings may require
            additional verification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={changePassword} className="max-w-lg space-y-3">
            <label className="block text-sm">
              Current password
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
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
                onChange={(e) => setPassword(e.target.value)}
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
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <Button disabled={!ready || busy} variant="outline">
              Change password
            </Button>
          </form>
          <Button
            variant="outline"
            disabled={!ready || busy}
            onClick={() =>
              void run(async () => {
                const { error } = await supabase.auth.signOut({
                  scope: "others",
                });
                if (error) throw error;
                return "Other sessions signed out. Existing access tokens remain valid until they expire.";
              })
            }
          >
            Sign out other sessions
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Update your public profile, experience, portfolio and services.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/home/profile">Edit profile</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
