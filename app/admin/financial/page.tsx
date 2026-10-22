import Link from "next/link";
import { ADMIN_MODULES } from "@/services/admin/adminModules";
import AdminRecords from "@/components/admin/AdminRecords";
import { Button } from "@/components/ui/button";
export default function Page() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button asChild variant="outline"><Link href="/admin/financial/tax">Review freelancer tax documents</Link></Button></div>
      <AdminRecords module={ADMIN_MODULES.transactions} title="Recorded transactions" />
    </div>
  );
}
