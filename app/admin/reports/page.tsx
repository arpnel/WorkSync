import { ADMIN_MODULES } from "@/services/admin/adminModules";
import AdminRecords from "@/components/admin/AdminRecords";
import CommunityReportsReview from "@/components/admin/CommunityReportsReview";
export default function Page() {
  return (
    <>
    <CommunityReportsReview />
    <AdminRecords
      module={ADMIN_MODULES.reports}
      title="Reports and moderation"
    />
    </>
  );
}
