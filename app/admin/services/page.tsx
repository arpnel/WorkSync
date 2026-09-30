import { ADMIN_MODULES } from "@/services/admin/adminModules";
import AdminRecords from "@/components/admin/AdminRecords";
export default function Page() {
  return <AdminRecords module={ADMIN_MODULES.services} title="Services" />;
}
