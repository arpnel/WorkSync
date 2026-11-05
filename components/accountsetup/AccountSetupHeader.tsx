"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { logout } from "@/services/auth/signinService";

export function AccountSetupHeader() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);
    try {
      await logout();
      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Failed to log out:", error);
      toast.error("Unable to log out. Please try again.");
      setLoggingOut(false);
    }
  }

  return (
    <header className="fixed right-4 top-4 z-50">
      <Button
        type="button"
        variant="outline"
        onClick={() => void handleLogout()}
        disabled={loggingOut}
      >
        <LogOut className="size-4" aria-hidden="true" />
        {loggingOut ? "Logging out..." : "Logout"}
      </Button>
    </header>
  );
}
