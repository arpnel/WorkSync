"use client";

import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { passwordMeetsRequirements } from "@/lib/validation/auth.validation";
import {
  requestSecurityReauthentication,
  updatePasswordOnServer,
} from "@/services/auth/passwordService";
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
  const [email, setEmail] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [hasPasswordCredential, setHasPasswordCredential] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordNonce, setPasswordNonce] = useState("");
  const [passwordCodeSent, setPasswordCodeSent] = useState(false);
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
        const user = data.session?.user;
        if (sessionError || !user) {
          setError(
            sessionError?.message ?? "Please sign in to manage your account.",
          );
          return;
        }
        setEmail(user.email ?? "");
        setCreatedAt(user.created_at);
        const providers = new Set([
          ...(user.identities ?? []).map((identity) => identity.provider),
          ...(Array.isArray(user.app_metadata?.providers)
            ? (user.app_metadata.providers as string[])
            : []),
        ]);
        setHasPasswordCredential(providers.has("email"));
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

  function changePassword(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (!passwordMeetsRequirements(password))
        throw new Error(
          "Password must have at least 8 characters, uppercase and lowercase letters, a number, and a special character.",
        );
      if (password !== confirm) throw new Error("Passwords do not match.");
      if (hasPasswordCredential) {
        if (!currentPassword) throw new Error("Enter your current password.");
        await updatePasswordOnServer(password, currentPassword);
      } else {
        if (!passwordCodeSent) throw new Error("Send a verification code to your current email first.");
        if (!passwordNonce.trim()) throw new Error("Enter the verification code sent to your current email.");
        await updatePasswordOnServer(password, undefined, passwordNonce.trim());
        setHasPasswordCredential(true);
        setEmailNonce("");
        setEmailCodeSent(false);
      }
      setCurrentPassword("");
      setPassword("");
      setConfirm("");
      setPasswordNonce("");
      setPasswordCodeSent(false);
      return hasPasswordCredential ? "Password updated." : "Password set. You can now sign in with your email and password.";
    });
  }

  function sendPasswordVerificationCode() {
    void run(async () => {
      if (!passwordMeetsRequirements(password))
        throw new Error("Enter a password that meets all listed requirements first.");
      if (password !== confirm) throw new Error("Passwords do not match.");
      await requestSecurityReauthentication();
      setPasswordNonce("");
      setPasswordCodeSent(true);
      return "A verification code was sent by Supabase Auth to your verified contact method.";
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
          <CardTitle>Account Information</CardTitle>
          <CardDescription>Basic information about your WorkSync account.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y rounded-lg border">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <dt className="text-muted-foreground">Email address</dt>
              <dd className="break-all font-medium">{email || "Not available"}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <dt className="text-muted-foreground">Account creation date</dt>
              <dd className="font-medium">{createdAt ? new Date(createdAt).toLocaleDateString() : "Not available"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Manage your sign-in methods and active sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="max-w-lg space-y-3">
            <div>
              <h3 className="text-sm font-semibold">{hasPasswordCredential ? "Change password" : "Set password"}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasPasswordCredential
                  ? "Use your current password to set a new one."
                  : "Verify with a code sent to your current sign-in email, then create an email password for this account."}
              </p>
            </div>
            <form onSubmit={changePassword} className="space-y-3">
              {hasPasswordCredential && <label className="block text-sm">
                Current password
                <Input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>}
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
              {!hasPasswordCredential && passwordCodeSent && <label className="block text-sm">Verification code
                <Input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={12} required value={passwordNonce} onChange={(event) => setPasswordNonce(event.target.value)} />
              </label>}
              {!hasPasswordCredential && <Button type="button" variant="outline" disabled={busy} onClick={sendPasswordVerificationCode}>
                {passwordCodeSent ? "Resend verification code" : "Send verification code"}
              </Button>}
              <Button disabled={!ready || busy || (!hasPasswordCredential && (!passwordCodeSent || !passwordNonce.trim()))} variant="outline">
                {hasPasswordCredential ? "Change password" : "Set password"}
              </Button>
            </form>
          </section>

        </CardContent>
      </Card>
    </div>
  );
}
