import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AuthHeaderProps {
  title: string;
  description: string;
}

export function AuthHeader({
  title,
  description,
}: AuthHeaderProps) {
  return (
    <DialogHeader className="text-center space-y-2">
      <DialogTitle className="text-2xl font-bold">
        {title}
      </DialogTitle>

      <DialogDescription>
        {description}
      </DialogDescription>
    </DialogHeader>
  );
}