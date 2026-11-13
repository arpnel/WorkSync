import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminProjectTabs from "@/components/admin/AdminProjectTabs";
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-6">
      <AdminPageHeader title="Projects and contracts" />
      <AdminProjectTabs />
    </div>
  );
}
