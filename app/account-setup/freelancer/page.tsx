"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FreelancerSetupForm } from "@/components/accountsetup/FreelancerSetupForm";

export default function FreelancerSetupPage() {
  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-10">
      <div className="mb-8">
        <Button variant="outline" size="sm" asChild className="mb-4 -ml-2">
          <Link href="/account-setup">
            <ArrowLeft className="mr-2 size-4" />
            Back to options
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          Set Up Your Freelancer Account
        </h1>
        <p className="mt-1 text-muted-foreground">
          Fill in your details to start offering services.
        </p>
      </div>
      <FreelancerSetupForm />
    </div>
  );
}

