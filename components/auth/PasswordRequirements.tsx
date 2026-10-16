import { PASSWORD_RULES } from "@/lib/validation/auth.validation";

export function PasswordRequirements({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1 text-xs" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const passed = rule.test(password);
        return (
          <li key={rule.id} className={passed ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}>
            <span aria-hidden="true" className="mr-2">{passed ? "✓" : "○"}</span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
