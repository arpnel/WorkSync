"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";

interface PasswordFieldProps {
  label: string;
  name: string;

  showPassword: boolean;
  onToggle: () => void;

  error?: string;

  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  showRequirements?: boolean;
}

export function PasswordField({
  label,
  name,
  showPassword,
  onToggle,
  error,
  onChange,
  showRequirements = false,
}: PasswordFieldProps) {
  const [value, setValue] = React.useState("");
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>

      <div className="relative">
        <Input
          name={name}
          type={showPassword ? "text" : "password"}
          className="pr-10"
          required
          aria-invalid={!!error}
          onChange={(event) => {
            setValue(event.target.value);
            onChange?.(event);
          }}
        />

        <button
          type="button"
          onClick={onToggle}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2"
        >
          {showPassword ? (
            <EyeOff size={16} />
          ) : (
            <Eye size={16} />
          )}
        </button>
      </div>

      {showRequirements && <PasswordRequirements password={value} />}

      {error && (
        <div className="mt-2 flex items-center gap-2 text-red-500 text-sm">
          {error}
        </div>
      )}
    </Field>
  );
}
