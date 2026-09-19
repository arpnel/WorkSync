"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { requireUser } from "@/services/platform/platformService";
import type { MarketplaceItem } from "@/services/marketplace/MarketplaceServices";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
export function ListingEditDialog({
  listing,
  onClose,
  onSaved,
}: {
  listing: MarketplaceItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description);
  const [price, setPrice] = useState(
    String(
      listing.listing_type === "service" ? listing.price : listing.budget_max,
    ),
  );
  const [minimum, setMinimum] = useState(
    String(listing.listing_type === "job" ? listing.budget_min : 0),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {listing.listing_type}</DialogTitle>
          <DialogDescription>
            Updates affect the listing. Existing project agreements keep their
            agreed terms.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              const user = await requireUser();
              const service = listing.listing_type === "service";
              if (
                (service
                  ? listing.freelancer?.user_id
                  : listing.client?.user_id) !== user.id
              )
                throw new Error(
                  "Only the listing owner may edit this listing.",
                );
              if (
                !title.trim() ||
                !description.trim() ||
                Number(price) <= 0 ||
                !Number.isFinite(Number(price)) ||
                (!service &&
                  (Number(minimum) < 0 || Number(minimum) > Number(price)))
              )
                throw new Error(
                  "Enter a title, description and valid price range.",
                );
              const values = service
                ? {
                    title: title.trim(),
                    description: description.trim(),
                    price: Number(price),
                  }
                : {
                    title: title.trim(),
                    description: description.trim(),
                    budget_min: Number(minimum),
                    budget_max: Number(price),
                  };
              const { data, error } = await supabase
                .from(service ? "services" : "jobs")
                .update(values)
                .eq(
                  service ? "service_id" : "job_id",
                  service ? listing.service_id : listing.job_id,
                )
                .eq(
                  service ? "freelancer_id" : "client_id",
                  service ? listing.freelancer_id : listing.client_id,
                )
                .select(service ? "service_id" : "job_id")
                .maybeSingle();
              if (error) throw error;
              if (!data) throw new Error("The listing could not be updated.");
              await onSaved();
              onClose();
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Unable to update listing.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm">
            Title
            <Input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Description
            <Textarea
              required
              maxLength={10000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {listing.listing_type === "job" && (
            <label className="block text-sm">
              Minimum budget (PHP)
              <Input
                type="number"
                min="0"
                step="0.01"
                required
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
              />
            </label>
          )}
          <label className="block text-sm">
            {listing.listing_type === "service" ? "Price" : "Maximum budget"}{" "}
            (PHP)
            <Input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button disabled={busy}>Save listing</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
