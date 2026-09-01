import { Filter, Search } from "lucide-react";

import type { CreateListingResult } from "@/services/serviceP/service.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServiceCreateDialogLauncher } from "@/components/profile/ServiceCreateDialogLauncher";

type Props = {
  onCreated?: (result: CreateListingResult) => void | Promise<void>;
};

export function ListingsToolbar({ onCreated }: Props) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="relative max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search your listings" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
        <ServiceCreateDialogLauncher onCreated={onCreated} />
      </div>
    </div>
  );
}
