"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { passwordMeetsRequirements } from "@/lib/validation/auth.validation";

function isRecoverySession(amr: unknown): boolean {
  return (
    Array.isArray(amr) &&
    amr.some(
      (entry) =>
        entry === "recovery" ||
        (typeof entry === "object" &&
          entry !== null &&
          "method" in entry &&
          entry.method === "recovery"),
    )
  );
}

function hasAuthLinkError(): boolean {
  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  return [query, fragment].some(
    (params) => params.has("error") || params.has("error_code"),
  );
}

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (hasAuthLinkError()) {
      setError(
        "This password reset link is invalid, expired, or already used. Request a new link from sign in.",
      );
      return () => {
        active = false;
      };
    }
    void supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error || !data.session) {
          setError(
            "This password reset link is invalid, expired, or already used. Request a new link from sign in.",
          );
          return;
        }
        const claims = await supabase.auth.getClaims(data.session.access_token);
        if (!active) return;
        if (claims.error || !isRecoverySession(claims.data?.claims?.amr)) {
          setError(
            "This password reset link is invalid, expired, or already used. Request a new link from sign in.",
          );
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (active)
          setError("Unable to check your reset link. Please try again.");
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setError("");
    if (!passwordMeetsRequirements(password)) return setError("Password must have at least 8 characters, uppercase and lowercase letters, a number, and a special character.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      setDone(true);
      setPassword("");
      setConfirm("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(
        /expired|invalid.*(token|link)|recovery|otp/i.test(message)
          ? "This password reset link is invalid, expired, or already used. Request a new link from sign in."
          : message || "Unable to change your password. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-md space-y-5 px-6 py-16">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      {done ? (
        <>
          <p role="status">Your password has been updated.</p>
          <Button asChild>
            <Link href="/login">Return to sign in</Link>
          </Button>
        </>
      ) : (
        <>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {ready ? (
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                              <PasswordRequirements password={password} />
</div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button disabled={busy}>
                {busy ? "Updating…" : "Update password"}
              </Button>
            </form>
          ) : (
            !error && <p role="status">Checking your reset link…</p>
          )}
          <Link href="/login" className="inline-block text-sm underline">
            Back to sign in
          </Link>
        </>
      )}
    </main>
  );
}
