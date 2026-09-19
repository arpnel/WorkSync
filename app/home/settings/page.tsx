import NotificationSettings from "@/components/account/NotificationSettings";
import VerificationSettings from "@/components/account/VerificationSettings";
import AccountSettings from "@/components/account/AccountSettings";
import MessageSettings from "@/components/message/MessageSettings";
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Settings
      </h1>
      <AccountSettings />
      <VerificationSettings />
      <NotificationSettings />
      <MessageSettings />
    </div>
  );
}
