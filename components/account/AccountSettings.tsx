"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AccountSettings() {
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
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
      if (password.length < 8) throw new Error("Use at least 8 characters.");
      if (password !== confirm) throw new Error("Passwords do not match.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
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
              New password
              <Input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
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
