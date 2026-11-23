"use client";

import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BadgeCheck, Camera, CircleAlert, Clock3, IdCard, RefreshCw, UserRound, Upload, XCircle } from "lucide-react";
import {
  getIdentityVerification,
  submitIdentityVerification,
  type VerificationStatus,
} from "@/services/verification/verificationService";

type ImageSlot = "front" | "back" | "selfie";

function LocalPreview({ file, alt }: { file: File; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? <img src={url} alt={alt} className="h-full w-full rounded-md object-cover" /> : null;
}

export default function VerificationSettings() {
  const [verification, setVerification] = useState<VerificationStatus | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [idNumber, setIdNumber] = useState("");
  const [noBack, setNoBack] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<ImageSlot | null>(null);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frontInput = useRef<HTMLInputElement>(null);
  const backInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      setVerification(await getIdentityVerification());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to check verification.");
    } finally {
      setChecking(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraTarget(null);
  }, []);

  useEffect(() => {
    void refresh();
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, [refresh]);

  useEffect(() => {
    if (cameraTarget && videoRef.current && streamRef.current)
      videoRef.current.srcObject = streamRef.current;
  }, [cameraTarget]);

  async function openCamera(target: ImageSlot) {
    setError("");
    setCameraError("");
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: target === "selfie" ? "user" : "environment" },
        audio: false,
      });
      setCameraTarget(target);
    } catch {
      setCameraError("Allow camera access to take a picture.");
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !cameraTarget) return;
    const target = cameraTarget;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `identity-${target}.jpg`, { type: "image/jpeg" });
        if (target === "front") setFront(file);
        else if (target === "back") setBack(file);
        else setSelfie(file);
      }
      stopCamera();
    }, "image/jpeg", 0.92);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!front || !selfie || !idNumber.trim() || (!back && !noBack)) {
      setError("Add the front of your ID, its back or mark that it has no back, and a selfie.");
      return;
    }
    setBusy(true);
    try {
      await submitIdentityVerification({ front, back, selfie, idNumber });
      setNotice("Your identity documents were submitted for administrator review.");
      setFront(null);
      setBack(null);
      setSelfie(null);
      setIdNumber("");
      setNoBack(false);
      if (frontInput.current) frontInput.current.value = "";
      if (backInput.current) backInput.current.value = "";
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Submission failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!verification && !error)
    return <ContentSkeleton label="Loading verification settings" variant="verification-settings" />;

  const locked = verification?.status === "pending" || (verification?.verified && !verification.reverificationReason);
  const showForm = !locked;
  const statusCard = !verification
    ? null
    : verification.reverificationReason
      ? {
          title: "New submission requested",
          description: "Please review the administrator's note and submit updated documents.",
          badge: "Action needed",
          Icon: CircleAlert,
          tone: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
          iconTone: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
        }
      : verification.status === "pending"
        ? {
            title: "Under review",
            description: "Your documents are being reviewed. We'll let you know when there's an update.",
            badge: "In progress",
            Icon: Clock3,
            tone: "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300",
            iconTone: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
          }
        : verification.status === "verified"
          ? {
              title: "Identity verified",
              description: "Your identity has been confirmed.",
              badge: "Verified",
              Icon: BadgeCheck,
              tone: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
              iconTone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
            }
          : verification.status === "rejected"
            ? {
                title: "Verification not approved",
                description: "Review the reason below, then submit updated documents.",
                badge: "Action needed",
                Icon: XCircle,
                tone: "border-destructive/30 bg-destructive/5 text-destructive",
                iconTone: "bg-destructive/10 text-destructive",
              }
            : {
                title: "Not submitted",
                description: "Submit your ID and selfie to begin identity verification.",
                badge: "Not started",
                Icon: IdCard,
                tone: "border-border bg-muted/20 text-foreground",
                iconTone: "bg-muted text-muted-foreground",
              };

  function imagePanel(slot: "front" | "back", file: File | null, inputRef: React.RefObject<HTMLInputElement | null>) {
    const label = slot === "front" ? "ID Front" : "ID Back";
    const Icon = slot === "front" ? IdCard : UserRound;
    const activeCamera = cameraTarget === slot;
    return <div className="min-w-0 space-y-1.5">
      <h3 className="text-sm font-semibold">{label}</h3>
      <div className="flex min-h-[106px] flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 p-2.5 text-center">
        {activeCamera ? <div className="w-full space-y-2">
          <video ref={videoRef} autoPlay playsInline className="mx-auto max-h-36 rounded-md" />
          <div className="flex justify-center gap-2"><Button type="button" size="sm" onClick={capture}>Capture photo</Button><Button type="button" size="sm" variant="outline" onClick={stopCamera}>Close camera</Button></div>
        </div> : file ? <>
          <div className="h-14 w-20 overflow-hidden rounded-md"><LocalPreview file={file} alt={`${label} preview`} /></div>
          <p className="max-w-full truncate text-xs">{file.name}</p>
          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => slot === "front" ? setFront(null) : setBack(null)}>Replace image</Button>
        </> : <>
          <Icon className="mb-1 size-5 text-muted-foreground" aria-hidden="true" />
          <label className="cursor-pointer text-xs font-medium hover:underline">
            <span>Upload {slot === "front" ? "ID front" : "ID back"}</span>
            <input ref={inputRef} required={slot === "front"} type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(event) => slot === "front" ? setFront(event.target.files?.[0] ?? null) : setBack(event.target.files?.[0] ?? null)} />
          </label>
          <span className="text-[11px] text-muted-foreground">or</span>
          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" onClick={() => void openCamera(slot)}><Camera className="size-3.5" /> Take picture</button>
        </>}
      </div>
      {slot === "back" && <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><input type="checkbox" checked={noBack} onChange={(event) => { setNoBack(event.target.checked); if (event.target.checked) { setBack(null); if (backInput.current) backInput.current.value = ""; } }} /> ID has no back</label>}
    </div>;
  }

  return <Card className="rounded-xl border border-slate-300 bg-card shadow-sm dark:border-border">
    <CardContent className="space-y-4 p-3 sm:p-4">
      <header className="space-y-0.5">
        <h2 className="text-base font-semibold leading-tight">Verify your identity</h2>
        <p className="text-xs text-muted-foreground">Submit your valid ID and a selfie holding it for manual verification.</p>
      </header>

      {statusCard && verification && <section className={`space-y-3 rounded-xl border p-3.5 sm:p-4 ${statusCard.tone}`} aria-live="polite">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${statusCard.iconTone}`}>
            <statusCard.Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{statusCard.title}</h3>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-current/20 px-2 py-0.5 text-[11px] font-medium">{statusCard.badge}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Refresh verification status" title="Refresh status" disabled={checking} onClick={() => void refresh()}>
                  <RefreshCw className={checking ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
                </Button>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{statusCard.description}</p>
          </div>
        </div>
        {(verification.submittedAt || verification.reviewedAt) && <dl className="grid gap-2 border-t border-current/10 pt-3 text-xs sm:grid-cols-2">
          {verification.submittedAt && <div><dt className="text-muted-foreground">Submitted</dt><dd className="mt-0.5 font-medium text-foreground">{new Date(verification.submittedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</dd></div>}
          {verification.reviewedAt && <div><dt className="text-muted-foreground">Reviewed</dt><dd className="mt-0.5 font-medium text-foreground">{new Date(verification.reviewedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</dd></div>}
        </dl>}
        {(verification.reverificationReason || verification.rejectionReason) && <p className="border-t border-current/10 pt-3 text-xs"><span className="font-semibold">Administrator note: </span>{verification.reverificationReason || verification.rejectionReason}</p>}
      </section>}

      {notice && <p role="status" className="text-xs text-emerald-600">{notice}</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {showForm ? <form className="space-y-3.5" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {imagePanel("front", front, frontInput)}
          {imagePanel("back", back, backInput)}
        </div>

        <div className="border-t pt-3.5">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold">Selfie with your ID</h3>
            <p className="text-[11px] text-muted-foreground">Hold your ID beside your face.</p>
          </div>
          <div className="mt-2.5 flex min-h-[94px] flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/30 p-2.5 text-center">
            {cameraTarget === "selfie" ? <div className="w-full space-y-2">
              <video ref={videoRef} autoPlay playsInline className="mx-auto max-h-36 rounded-md" />
              <div className="flex justify-center gap-2"><Button type="button" size="sm" onClick={capture}>Take selfie</Button><Button type="button" size="sm" variant="outline" onClick={stopCamera}>Close camera</Button></div>
            </div> : selfie ? <>
              <div className="h-14 w-14 overflow-hidden rounded-full"><LocalPreview file={selfie} alt="Selfie preview" /></div>
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setSelfie(null)}>Retake selfie</Button>
            </> : <>
              <Camera className="mb-1 size-6 text-primary" aria-hidden="true" />
              <button type="button" className="text-sm font-semibold hover:underline" onClick={() => void openCamera("selfie")}>Take selfie</button>
              <span className="text-[11px] text-muted-foreground">Use front camera</span>
            </>}
          </div>
        </div>

        {cameraError && <p role="alert" className="text-xs text-destructive">{cameraError}</p>}

        <div className="space-y-1.5 border-t pt-3.5">
          <label htmlFor="identity-id-number" className="text-sm font-semibold">ID Number</label>
          <input id="identity-id-number" className="h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Enter ID number" value={idNumber} onChange={(event) => setIdNumber(event.target.value)} maxLength={80} required autoComplete="off" />
          <p className="pt-0.5 text-[11px] text-muted-foreground">Your documents are stored privately and reviewed by authorized administrators.</p>
          <p className="text-[11px] text-muted-foreground">Images must be JPG or PNG, up to 5 MB each. By submitting, you confirm these documents belong to you and consent to identity review.</p>
        </div>
        <Button type="submit" className="w-full" disabled={busy || checking || Boolean(cameraTarget)}>{busy ? "Submitting securely…" : <><Upload className="size-4" />Submit for review</>}</Button>
      </form> : null}
    </CardContent>
  </Card>;
}



