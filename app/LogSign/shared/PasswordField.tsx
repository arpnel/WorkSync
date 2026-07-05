"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface PasswordFieldProps {
  label: string;
  name: string;

  showPassword: boolean;
  onToggle: () => void;

  error?: string;

  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}

export function PasswordField({
  label,
  name,
  showPassword,
  onToggle,
  error,
  onChange,
}: PasswordFieldProps) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>

      <div className="relative">
        <Input
          name={name}
          type={showPassword ? "text" : "password"}
          className="pr-10"
          required
          onChange={onChange}
        />

        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-2"
        >
          {showPassword ? (
            <EyeOff size={16} />
          ) : (
            <Eye size={16} />
          )}
        </button>
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-2 text-red-500 text-sm">
          {error}
        </div>
      )}
    </Field>
  );
}