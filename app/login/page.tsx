"use client";

import Link from "next/link";
import { SigninDialog } from "@/components/auth/login/SigninDialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export default function LoginPage() {
  return (
    <main className="p-6">
      <Link href="/">Back to WorkSync</Link>
      <Dialog open>
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <SigninDialog />
          <Link href="/" className="text-center text-sm underline">
            Back to WorkSync
          </Link>
        </DialogContent>
      </Dialog>
    </main>
  );
}
