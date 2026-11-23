"use client";

import TaxDeclarationReview from "@/components/admin/TaxDeclarationReview";
import TaxDocumentsReview from "@/components/admin/TaxDocumentsReview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TaxReviewTabs() {
  return (
    <Tabs defaultValue="sworn" className="min-w-0">
      <TabsList aria-label="Tax document review sections" className="grid w-full grid-cols-2 sm:w-fit">
        <TabsTrigger value="sworn">Sworn declarations</TabsTrigger>
        <TabsTrigger value="seller">Tax documents</TabsTrigger>
      </TabsList>
      <TabsContent value="sworn" className="mt-4">
        <section
          aria-labelledby="declaration-review-heading"
          className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
        >
          <TaxDeclarationReview />
        </section>
      </TabsContent>
      <TabsContent value="seller" className="mt-4">
        <section
          aria-labelledby="business-tax-documents-heading"
          className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
        >
          <TaxDocumentsReview />
        </section>
      </TabsContent>
    </Tabs>
  );
}
