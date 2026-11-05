import { AccountSetupHeader } from "@/components/accountsetup/AccountSetupHeader";

export default function AccountSetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AccountSetupHeader />
      {children}
    </>
  );
}
