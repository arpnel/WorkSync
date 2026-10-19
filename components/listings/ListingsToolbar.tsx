import { ChevronDown, Search } from "lucide-react";
import type { CreateListingResult } from "@/services/serviceP/service.types";
import { Input } from "@/components/ui/input";
import { ServiceCreateDialogLauncher } from "@/components/profile/ServiceCreateDialogLauncher";

type Props = {
  onCreated?: (result: CreateListingResult) => void | Promise<void>;
  search?: string;
  onSearchChange?: (value: string) => void;
  kind?: string;
  onKindChange?: (value: string) => void;
};

export function ListingsToolbar({
  onCreated,
  search = "",
  onSearchChange,
  kind = "all",
  onKindChange,
}: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search your listings"
          value={search}
          onChange={(e) => onSearchChange?.(e.target.value)}
        />
      </div>
      <div className="flex min-w-40 flex-col items-end gap-3">
        <ServiceCreateDialogLauncher onCreated={onCreated} />
        <div className="relative w-[120px]">
          <select
            aria-label="Listing type"
            className="h-10 w-full appearance-none rounded-md border border-input bg-background py-2 pl-3 pr-8 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            value={kind}
            onChange={(e) => onKindChange?.(e.target.value)}
          >
            <option value="all">All listings</option>
            <option value="service">Services</option>
            <option value="job">Jobs</option>
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </div>
    </div>
  );
}
