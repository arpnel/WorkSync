import PayoutSettings from "@/components/account/PayoutSettings";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";

export default function PayoutsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <WorkspacePageHeader
        title="Payouts"
        description="Manage your payout account and review payment history."
      />
      <PayoutSettings />
    </div>
  );
}
