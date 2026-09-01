"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import type { CreateListingResult } from "@/services/serviceP/service.types";
import { Button } from "@/components/ui/button";
import { ServiceDialog } from "@/components/services/ServiceDialog";

type Props = {
  onCreated?: (result: CreateListingResult) => void | Promise<void>;
};

export function ServiceCreateDialogLauncher({ onCreated }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} className="rounded-full">
        <Plus className="h-4 w-4" />
        Post Listing
      </Button>

      <ServiceDialog open={open} onOpenChange={setOpen} onCreated={onCreated} />
    </>
  );
}
