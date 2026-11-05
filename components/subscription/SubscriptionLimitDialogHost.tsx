"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { subscribeToSubscriptionLimitDialog } from "@/services/subscriptions/subscriptionLimitDialog";

export function SubscriptionLimitDialogHost() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    return subscribeToSubscriptionLimitDialog(setMessage);
  }, []);

  return (
    <Dialog open={Boolean(message)} onOpenChange={(open) => { if (!open) setMessage(""); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Free plan limit reached</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setMessage("")}>Close</Button>
          <Button asChild><Link href="/home/offers" onClick={() => setMessage("")}>Buy Premium</Link></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
