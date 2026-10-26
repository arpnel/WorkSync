"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import type { CreateListingResult } from "@/services/serviceP/service.types";
import { Button } from "@/components/ui/button";
import { ServiceDialog } from "@/components/services/ServiceDialog";
import { getCurrentListingRole } from "@/services/serviceP/serviceService";
import { supabase } from "@/lib/supabaseClient";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  onCreated?: (result: CreateListingResult) => void | Promise<void>;
};

export function ServiceCreateDialogLauncher({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [blockMessage, setBlockMessage] = useState("Required seller documents must be verified before submitting a service.");

  async function openCreate() {
    setChecking(true);
    try {
      if (await getCurrentListingRole() === "freelancer") {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Sign in again to check seller verification.");
        const response = await fetch("/api/freelancer-seller-verification", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        const result = await response.json().catch(() => null);
        if (!response.ok || result?.eligible !== true) {
          setBlockMessage(result?.requirements?.find((item: { status: string; review_reason?: string }) => item.status === "rejected")?.review_reason || result?.error || "Submit the required seller documents in Settings and wait for administrator review.");
          setBlocked(true);
          return;
        }
      }
      setOpen(true);
    } catch (cause) {
      setBlockMessage(cause instanceof Error ? cause.message : "Seller verification status could not be checked.");
      setBlocked(true);
    } finally { setChecking(false); }
  }

  return (
    <>
      <Button onClick={() => void openCreate()} disabled={checking} className="rounded-full">
        <Plus className="h-4 w-4" />
        {checking ? "Checking…" : "Post Listing"}
      </Button>

      <ServiceDialog open={open} onOpenChange={setOpen} onCreated={onCreated} />
      <Dialog open={blocked} onOpenChange={setBlocked}>
        <DialogContent>
          <DialogHeader><DialogTitle>Seller verification required</DialogTitle><DialogDescription>{blockMessage} Existing projects are not affected.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setBlocked(false)}>Later</Button><Button onClick={() => { setBlocked(false); window.location.assign("/home/settings#seller-verification"); }}>Open seller verification</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
