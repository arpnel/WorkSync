"use client";

import { Briefcase, Laptop } from "lucide-react";
import { useRouter } from "next/navigation";
import { AccountTypeCard } from "@/components/accountsetup/AccountTypeCard";

export default function AccountSetupPage() {
  const router = useRouter();

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Complete Your Account Setup
        </h1>
        <p className="mt-2 text-muted-foreground">
          Choose how you want to use WorkSync.
        </p>
      </div>

      <div className="grid w-full gap-6 sm:grid-cols-2">
        <AccountTypeCard
          icon={Briefcase}
          title="Hire Talent"
          description="Find skilled freelancers and hire professionals for your projects."
          onClick={() => router.push("/account-setup/client")}
        />

        <AccountTypeCard
          icon={Laptop}
          title="Offer Services"
          description="Create services, build your freelancer profile, and earn from your skills."
          onClick={() => router.push("/account-setup/freelancer")}
        />
      </div>
    </div>
  );
}

