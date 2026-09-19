"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  getIdentityVerification,
  verificationRequest,
  type VerificationStatus,
} from "@/services/verification/verificationService";
export default function VerificationSettings() {
  const [verification, setVerification] = useState<VerificationStatus | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const alive = useRef(true);
  const starting = useRef(false);
  const requestVersion = useRef(0);
  const closeVerification = useRef<(() => void) | null>(null);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setChecking(true);
    try {
      const status = await getIdentityVerification();
      if (alive.current && requestVersion.current === version) {
        setVerification(status);
        setError("");
      }
    } catch (cause) {
      if (alive.current && requestVersion.current === version)
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to check verification.",
        );
    } finally {
      if (alive.current && requestVersion.current === version)
        setChecking(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      alive.current = false;
      closeVerification.current?.();
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  async function start() {
    if (starting.current) return;
    starting.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { DiditSdk } = await import("@didit-protocol/sdk-web");
      const session = await verificationRequest("POST");
      if (!alive.current) return;
      closeVerification.current = () => {
        DiditSdk.shared.onComplete = undefined;
        DiditSdk.shared.close();
      };
      DiditSdk.shared.onComplete = (result) => {
        starting.current = false;
        if (!alive.current) return;
        setBusy(false);
        setNotice(
          result.type === "cancelled"
            ? "Verification was closed. You can continue when ready."
            : result.type === "failed"
              ? "Verification could not finish. Please try again."
              : "Verification submitted. Checking the decision…",
        );
        void refresh(); // SDK completion is never identity approval.
      };
      DiditSdk.shared.startVerification({
        url: session.url,
        configuration: {
          loggingEnabled: false,
          showCloseButton: true,
          closeModalOnComplete: true,
        },
      });
    } catch (cause) {
      starting.current = false;
      if (alive.current) {
        setBusy(false);
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to open verification.",
        );
      }
    }
  }
  const status = verification?.status;
  const verified = verification?.verified;
  useEffect(() => {
    if (
      verified ||
      !status ||
      !["In Progress", "Approved", "Resubmitted"].includes(status)
    )
      return;
    let tries = 0;
    const timer = window.setInterval(() => {
      if (++tries >= 6) window.clearInterval(timer);
      void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [status, verified, refresh]);
  const waiting = status === "In Review" || status === "Approved";
  if (!verification && !error)
    return (
      <ContentSkeleton
        label="Loading verification settings"
        variant="verification-settings"
      />
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verify your identity</CardTitle>
        <CardDescription>
          For clients and freelancers. Have a valid government-issued ID ready
          and follow Didit’s document and selfie instructions. Your documents
          are submitted directly to Didit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p role="status" className="text-sm font-medium">
          {verification?.verified
            ? "Identity verified"
            : status === "Approved"
              ? "Decision received — waiting for verification confirmation"
              : (status ?? "Checking verification…")}
        </p>
        {status === "Declined" && (
          <p className="text-sm text-muted-foreground">
            Your identity could not be verified. Check that your ID is valid and
            readable before trying again.
          </p>
        )}
        {status === "Kyc Expired" && (
          <p className="text-sm text-muted-foreground">
            Your previous verification expired. Please verify again.
          </p>
        )}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {!verification?.verified && !waiting && (
            <Button
              type="button"
              disabled={busy || checking || !verification?.canStart}
              onClick={() => void start()}
            >
              {busy
                ? "Verification open…"
                : status === "Not Started"
                  ? "Verify with Didit"
                  : "Continue verification"}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={checking || busy}
            onClick={() => void refresh()}
          >
            {checking ? "Checking…" : "Refresh verification status"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Saving your profile and verifying your identity are separate steps.
          You can return to verification from Settings.
        </p>
      </CardContent>
    </Card>
  );
}
