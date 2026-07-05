"use client";

import * as React from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { GoogleButton } from "../shared";

interface SignupEmailStepProps {
  email: string;
  loading: boolean;

  onEmailChange: (value: string) => void;

  onSubmit: (
    e: React.FormEvent<HTMLFormElement>
  ) => void;

  onGoogle: () => void;
}

export function SignupEmailStep({
  email,
  loading,
  onEmailChange,
  onSubmit,
  onGoogle,
}: SignupEmailStepProps) {
  return (
    <form
      className="space-y-5 pt-4"
      onSubmit={onSubmit}
    >
      <Field>
        <FieldLabel>Email</FieldLabel>

        <Input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) =>
            onEmailChange(e.target.value)
          }
        />
      </Field>

      <Button
        type="submit"
        className="w-full"
        disabled={loading}
      >
        {loading ? "Loading..." : "Continue"}
      </Button>

      <GoogleButton
        loading={loading}
        text="Continue with Google"
        onClick={onGoogle}
      />

      <p className="text-center text-xs text-muted-foreground">
        By continuing, you agree to WorkSync's Terms
        and Privacy Policy.
      </p>
    </form>
  );
}