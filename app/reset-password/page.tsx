"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data.session)
          setError(
            "This reset link is invalid or expired. Request a new link from sign in.",
          );
        else setReady(true);
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
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setPassword("");
      setConfirm("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to change your password. Please try again.",
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
            <Link href="/home/marketplace">Continue to WorkSync</Link>
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
