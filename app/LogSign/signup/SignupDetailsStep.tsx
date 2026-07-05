"use client";

import * as React from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { PasswordField } from "../shared";

interface SignupDetailsStepProps {
  loading: boolean;

  passwordError: string;

  showPassword: boolean;
  showConfirmPassword: boolean;

  onTogglePassword: () => void;
  onToggleConfirmPassword: () => void;

  onPasswordChange: () => void;

  onBack: () => void;

  onSubmit: (
    e: React.FormEvent<HTMLFormElement>
  ) => void;
}

export function SignupDetailsStep({
  loading,
  passwordError,

  showPassword,
  showConfirmPassword,

  onTogglePassword,
  onToggleConfirmPassword,

  onPasswordChange,

  onBack,
  onSubmit,
}: SignupDetailsStepProps) {
  return (
    <form
      className="space-y-5 pt-4"
      onSubmit={onSubmit}
    >
      <Field>
        <FieldLabel>First Name</FieldLabel>

        <Input
          name="firstName"
          maxLength={50}
          autoComplete="given-name"
          required
        />
      </Field>

      <Field>
        <FieldLabel>Last Name</FieldLabel>

        <Input
          name="lastName"
          maxLength={50}
          autoComplete="family-name"
          required
        />
      </Field>

      <PasswordField
        label="Password"
        name="password"
        showPassword={showPassword}
        onToggle={onTogglePassword}
        onChange={onPasswordChange}
      />

      <PasswordField
        label="Confirm Password"
        name="confirmPassword"
        showPassword={showConfirmPassword}
        onToggle={onToggleConfirmPassword}
        onChange={onPasswordChange}
        error={passwordError}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={loading}
          onClick={onBack}
        >
          Back
        </Button>

        <Button
          type="submit"
          className="flex-1"
          disabled={loading}
        >
          {loading
            ? "Creating..."
            : "Create Account"}
        </Button>
      </div>
    </form>
  );
}