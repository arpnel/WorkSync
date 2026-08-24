"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ServiceDialog } from "@/components/services/ServiceDialog";

export function ServiceCreateDialogLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="rounded-full"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Service
      </Button>

      <ServiceDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

