"use client";

import * as React from "react";
import { supabase } from "@/lib/supabaseClient";
import { AuthHeader } from "../";
import { SignupEmailStep } from "./SignupEmailStep";
import { SignupDetailsStep } from "./SignupDetailsStep";
import { createAccount } from "../../../services/auth/signupService";
import {
  validateEmail,
  validateSignupForm,
} from "../../../lib/validation/auth.validation";
import { ERROR_MESSAGES } from "../constants";

export function SignupDialog() {
  const [step, setStep] = React.useState<"email" | "details">("email");
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [formError, setFormError] = React.useState("");
  const showMessage = (message: string) => setFormError(message);
  const resetForm = () => {
    setEmail("");
    setPasswordError("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setStep("email");
  };

  const handleGoogleSignup = async () => {
    setLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      showMessage(error.message);
      setLoading(false);
    }
  };

  const handleEmailContinue = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const validation = validateEmail(email);

    if (!validation.valid) {
      showMessage(validation.message ?? ERROR_MESSAGES.INVALID_EMAIL);
      return;
    }

    setEmail(email.trim().toLowerCase());
    setStep("details");
  };

  const handleCreateAccount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (loading) return;

    setLoading(true);

    try {
      const form = e.currentTarget;

      const firstName = (
        form.elements.namedItem("firstName") as HTMLInputElement
      ).value;
      const lastName = (form.elements.namedItem("lastName") as HTMLInputElement)
        .value;
      const password = (form.elements.namedItem("password") as HTMLInputElement)
        .value;
      const confirmPassword = (
        form.elements.namedItem("confirmPassword") as HTMLInputElement
      ).value;

      const validation = validateSignupForm({
        email,
        firstName,
        lastName,
        password,
        confirmPassword,
      });

      if (!validation.valid) {
        if (validation.message?.toLowerCase().includes("password")) {
          setPasswordError(validation.message);
        }
        showMessage(validation.message ?? ERROR_MESSAGES.UNKNOWN);
        return;
      }

      setPasswordError("");

      await createAccount({
        email,
        password,
        firstName,
        lastName,
      });

      resetForm();
    } catch (error) {
      console.error(error);

      if (error instanceof Error) {
        const message = error.message.toLowerCase();

        if (
          message.includes("already") ||
          message.includes("registered") ||
          message.includes("exists")
        ) {
          showMessage(ERROR_MESSAGES.ACCOUNT_EXISTS);
        } else {
          showMessage(error.message);
        }
      } else {
        showMessage(ERROR_MESSAGES.UNKNOWN);
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      {formError && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <AuthHeader
        title="Join WorkSync"
        description="Hire professionals or grow your freelance career."
      />

      {step === "email" ? (
        <SignupEmailStep
          email={email}
          loading={loading}
          onEmailChange={setEmail}
          onSubmit={handleEmailContinue}
          onGoogle={handleGoogleSignup}
        />
      ) : (
        <SignupDetailsStep
          loading={loading}
          passwordError={passwordError}
          showPassword={showPassword}
          showConfirmPassword={showConfirmPassword}
          onTogglePassword={() => setShowPassword((prev) => !prev)}
          onToggleConfirmPassword={() =>
            setShowConfirmPassword((prev) => !prev)
          }
          onPasswordChange={() => setPasswordError("")}
          onBack={() => {
            setPasswordError("");
            setStep("email");
          }}
          onSubmit={handleCreateAccount}
        />
      )}
    </>
  );
}
