import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoIcon } from "@/components/shared/logo";
import { WorkspaceDesign } from "@/components/layout/WorkspaceDesign";
import MarketplaceBrowse from "@/components/marketplace/MarketplaceBrowse";
export default async function GuestMarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    subcategory?: string;
    service?: string;
  }>;
}) {
  const initialFilters = await searchParams;
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <LogoIcon className="size-8" />
            WorkSync
          </Link>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Back to landing page
            </Link>
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
        <WorkspaceDesign>
          <MarketplaceBrowse
            guest
            initialCategoryId={initialFilters.category ?? ""}
            initialSkillId={initialFilters.subcategory ?? ""}
            initialService={initialFilters.service ?? ""}
          />
        </WorkspaceDesign>
      </div>
    </div>
  );
}
