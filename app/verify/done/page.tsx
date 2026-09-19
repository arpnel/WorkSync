import Link from "next/link";
import VerificationSettings from "@/components/account/VerificationSettings";
export default function VerificationDonePage() {
  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-10">
      <h1 className="text-2xl font-semibold">Identity verification</h1>
      <VerificationSettings />
      <Link className="text-sm underline" href="/account-setup">
        Return to account setup
      </Link>
      <p>
        <Link className="text-sm underline" href="/home/settings">
          Go to settings
        </Link>
      </p>
    </main>
  );
}
