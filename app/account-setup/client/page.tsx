"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ClientSetupForm } from "@/components/accountsetup/ClientSetupForm";

export default function ClientSetupPage() {
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
          Set Up Your Client Account
        </h1>
        <p className="mt-1 text-muted-foreground">
          Fill in your details to start hiring freelancers.
        </p>
      </div>
      <ClientSetupForm />
    </div>
  );
}

