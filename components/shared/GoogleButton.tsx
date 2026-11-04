import { FcGoogle } from "react-icons/fc";

import { Button } from "@/components/ui/button";

interface GoogleButtonProps {
  loading?: boolean;
  disabled?: boolean;
  text?: string;
  onClick: () => void;
}

export function GoogleButton({
  loading = false,
  disabled = false,
  text = "Continue with Google",
  onClick,
}: GoogleButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full h-11 gap-2"
      disabled={loading || disabled}
      onClick={onClick}
    >
      <FcGoogle className="size-5" />
      {text}
    </Button>
  );
}
