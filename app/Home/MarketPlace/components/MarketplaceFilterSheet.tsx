"use client";

import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";

import MarketplaceFilters from "./MarketplaceFilters";

interface MarketplaceFilterSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function MarketplaceFilterSheet({
    open,
    onOpenChange,
}: MarketplaceFilterSheetProps) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[420px] sm:w-[480px] p-0 overflow-hidden">
                <div className="flex h-full flex-col">
                    {/* Header */}
                    <SheetHeader className="border-b px-6 py-5">
                        <SheetTitle>Refine Results</SheetTitle>

                        <SheetDescription>
                            Adjust filters to improve your search results.
                        </SheetDescription>
                    </SheetHeader>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto px-6 py-6">
                        <MarketplaceFilters />
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}