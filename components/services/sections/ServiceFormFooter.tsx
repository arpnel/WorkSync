import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Props = {
  isSubmitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onReset: () => void;
};

export function ServiceCreationFormFooter({
  isSubmitting,
  canSubmit,
  onSubmit,
  onReset,
}: Props) {
  return (
    <div className="space-y-3">
      <Button
        type="button"
        className="w-full"
        disabled={!canSubmit || isSubmitting}
        onClick={onSubmit}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Create service"
        )}
      </Button>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={isSubmitting}
        onClick={onReset}
      >
        Reset
      </Button>
    </div>
  );
}
