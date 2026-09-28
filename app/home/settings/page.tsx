import PayoutSettings from "@/components/account/PayoutSettings";
import NotificationSettings from "@/components/account/NotificationSettings";
import VerificationSettings from "@/components/account/VerificationSettings";
import AccountSettings from "@/components/account/AccountSettings";
import MessageSettings from "@/components/message/MessageSettings";
import { SettingsWorkspace } from "@/components/account/SettingsWorkspace";
import { WorkspacePageHeader } from "@/components/shared/WorkspacePageHeader";
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <WorkspacePageHeader
        title="Settings"
        description="Manage your account, security, and workspace preferences."
      />
      <SettingsWorkspace
        panels={{
          payouts: <PayoutSettings />,
          account: <AccountSettings />,
          verification: <VerificationSettings />,
          notifications: <NotificationSettings />,
          messaging: <MessageSettings />,
        }}
      />
    </div>
  );
}
