"use client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SignupDialog } from "@/components/auth/signup/SignupDialog";
export default function GuestSignup({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-sm">
        <DialogTitle className="sr-only">Create an account</DialogTitle>
        <SignupDialog />
      </DialogContent>
    </Dialog>
  );
}
