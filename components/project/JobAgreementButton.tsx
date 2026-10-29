"use client";
import { type ReactNode } from "react";
import { useRouter } from "next/navigation";
export function JobAgreementButton({
  applicationId,
  children,
}: {
  applicationId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <button
        type="button"
        className="navigation-card block w-full rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-primary"
        onClick={() => router.push(`/home/projects/create-contract/${applicationId}`)}
      >
        {children}
      </button>
  );
}
