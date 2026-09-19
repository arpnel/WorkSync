import { Search } from "lucide-react";
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
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="relative max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search your listings"
          value={search}
          onChange={(e) => onSearchChange?.(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Listing type"
          className="rounded-md border bg-background px-3 text-sm"
          value={kind}
          onChange={(e) => onKindChange?.(e.target.value)}
        >
          <option value="all">All listings</option>
          <option value="service">Services</option>
          <option value="job">Jobs</option>
        </select>
        <ServiceCreateDialogLauncher onCreated={onCreated} />
      </div>
    </div>
  );
}
