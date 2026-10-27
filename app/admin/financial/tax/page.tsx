import TaxDeclarationReview from "@/components/admin/TaxDeclarationReview";
import TaxDocumentsReview from "@/components/admin/TaxDocumentsReview";

export default function Page() {
  return <div className="space-y-10">
    <TaxDeclarationReview />
    <TaxDocumentsReview />
  </div>;
}
