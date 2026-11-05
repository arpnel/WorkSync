"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordRequirements } from "@/components/auth/PasswordRequirements";
import { InputErrorMessage } from "@/components/auth/InputErrorMessage";

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
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={`${name}-password`}>{label}</FieldLabel>

      <div className="relative">
        <Input
          id={`${name}-password`}
          name={name}
          type={showPassword ? "text" : "password"}
          className="pr-10"
          required
          aria-invalid={!!error}
          aria-describedby={error ? `${name}-password-error` : undefined}
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
        <InputErrorMessage id={`${name}-password-error`}>{error}</InputErrorMessage>
      )}
    </Field>
  );
}
