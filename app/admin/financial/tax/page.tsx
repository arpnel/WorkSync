import TaxDeclarationReview from "@/components/admin/TaxDeclarationReview";
import TaxDocumentsReview from "@/components/admin/TaxDocumentsReview";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-6">
      <AdminPageHeader title="Tax documents & declarations" />
      <div className="grid min-w-0 gap-6">
        <section aria-labelledby="declaration-review-heading" className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
          <TaxDeclarationReview />
        </section>
        <section aria-labelledby="business-tax-documents-heading" className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
          <TaxDocumentsReview />
        </section>
      </div>
    </div>
  );
}
