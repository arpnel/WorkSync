import { Button } from "@/components/ui/button";

interface LoadingButtonProps
  extends React.ComponentProps<typeof Button> {
  loading: boolean;

  loadingText: string;

  children: React.ReactNode;
}

export function LoadingButton({
  loading,
  loadingText,
  children,
  ...props
}: LoadingButtonProps) {
  return (
    <Button
      {...props}
      disabled={loading || props.disabled}
    >
      {loading ? loadingText : children}
    </Button>
  );
}