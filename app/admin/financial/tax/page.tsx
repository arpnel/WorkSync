import TaxDeclarationReview from "@/components/admin/TaxDeclarationReview";
import TaxDocumentsReview from "@/components/admin/TaxDocumentsReview";
import { FreelancerSellerVerificationReview } from "@/components/admin/FreelancerSellerVerificationReview";

export default function Page() {
  return <div className="space-y-10">
    <TaxDeclarationReview />
    <TaxDocumentsReview />
    <FreelancerSellerVerificationReview />
  </div>;
}