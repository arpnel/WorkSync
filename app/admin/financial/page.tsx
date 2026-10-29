import Link from "next/link";
import AdminTransactions from "@/components/admin/AdminTransactions";
import { Button } from "@/components/ui/button";
export default function Page() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button asChild variant="outline"><Link href="/admin/financial/tax">Review freelancer tax documents</Link></Button></div>
      <AdminTransactions />
    </div>
  );
}
