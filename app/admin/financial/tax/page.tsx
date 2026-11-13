import AdminPageHeader from "@/components/admin/AdminPageHeader";
import TaxReviewTabs from "@/components/admin/TaxReviewTabs";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-6">
      <AdminPageHeader title="Tax documents & declarations" />
      <TaxReviewTabs />
    </div>
  );
}
