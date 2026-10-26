import {
  Users,
  ShieldCheck,
  Flag,
  Briefcase,
  Activity,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
const styles = [
  {
    Icon: Users,
    tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    Icon: ShieldCheck,
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    Icon: Flag,
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  {
    Icon: Briefcase,
    tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    Icon: Wallet,
    tone: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
  },
  {
    Icon: Activity,
    tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  },
];
export default function AdminMetricCard({
  label,
  value,
  index = 0,
}: {
  label: string;
  value: string | number;
  index?: number;
}) {
  const { Icon, tone } = styles[index % styles.length];
  return (
    <Card>
      <CardContent className="flex h-full min-w-0 items-start justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0 flex-1 space-y-3">
          <p className="min-w-0 text-sm capitalize leading-5 text-muted-foreground">
            {label.replaceAll("_", " ")}
          </p>
          <p className="break-words text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
            {value}
          </p>
        </div>
        <span
          className={
            "flex size-9 shrink-0 items-center justify-center rounded-lg " +
            tone
          }
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}
