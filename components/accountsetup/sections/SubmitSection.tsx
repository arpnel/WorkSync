import { Button } from "@/components/ui/button";

type Props = {
  isSubmitting: boolean;
  label: string;
  loadingLabel: string;
  onSubmit: () => void;
};

export function SubmitSection({
  isSubmitting,
  label,
  loadingLabel,
  onSubmit,
}: Props) {
  return (
    <div className="flex justify-end">
      <Button
        type="button"
        disabled={isSubmitting}
        onClick={onSubmit}
      >
        {isSubmitting ? loadingLabel : label}
      </Button>
    </div>
  );
}
