"use client";

import type { LucideIcon } from "lucide-react";

type AccountTypeCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
};

export function AccountTypeCard({
  icon: Icon,
  title,
  description,
  onClick,
}: AccountTypeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col items-center gap-5 rounded-2xl border-2 border-border bg-background p-8 text-center transition-all duration-200 hover:border-primary/50 hover:shadow-md hover:-translate-y-1"
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground transition-colors duration-200 group-hover:bg-primary/10 group-hover:text-primary">
        <Icon className="size-8" />
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

