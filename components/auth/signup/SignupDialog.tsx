"use client";

import * as React from "react";
import { Circle, CircleCheck, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { AuthHeader } from "../";
import { createAccount } from "@/services/auth/signupService";
import {
  PASSWORD_RULES,
  validateSignupForm,
} from "@/lib/validation/auth.validation";
import { ERROR_MESSAGES } from "../constants";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { GoogleButton } from "@/components/shared/GoogleButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  WorkSyncLegalDialog,
  type WorkSyncLegalDocument,
} from "@/components/project/WorkSyncLegalDialog";

export function SignupDialog() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [verificationEmail, setVerificationEmail] = React.useState("");
  const [verificationDialogOpen, setVerificationDialogOpen] =
    React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);
  const [termsError, setTermsError] = React.useState(false);
  const [legalDialogOpen, setLegalDialogOpen] = React.useState(false);
  const [legalDocument, setLegalDocument] =
    React.useState<WorkSyncLegalDocument>("terms");
  const [loading, setLoading] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState("");
  const [confirmPasswordError, setConfirmPasswordError] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const signupDisabled = !acceptedTerms || loading;

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setConfirmPasswordError("");
    setAcceptedTerms(false);
    setTermsError(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFormError("");
  };

  const handleGoogleSignup = async () => {
    if (loading) return;
    setFormError("");
    if (!acceptedTerms) {
      setTermsError(true);
      return;
    }
    setTermsError(false);

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN,
      );
      setLoading(false);
    }
  };

  const handleCreateAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setFormError("");
    setPasswordError("");
    setConfirmPasswordError("");

    if (!acceptedTerms) {
      setTermsError(true);
      return;
    }
    setTermsError(false);

    const validation = validateSignupForm({ email, password, confirmPassword });
    if (!validation.valid) {
      const message = validation.message ?? ERROR_MESSAGES.UNKNOWN;
      if (
        message === ERROR_MESSAGES.PASSWORD_MISMATCH ||
        message === "Please confirm your password."
      ) {
        setConfirmPasswordError(message);
      } else if (message.toLowerCase().includes("password")) {
        setPasswordError(message);
      } else {
        setFormError(message);
      }
      return;
    }

    setLoading(true);
    try {
      const submittedEmail = email.trim().toLowerCase();
      await createAccount({
        email: submittedEmail,
        password,
        acceptedTerms,
      });
      resetForm();
      setVerificationEmail(submittedEmail);
      setVerificationDialogOpen(true);
    } catch (error) {
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        setFormError(
          message.includes("already") ||
            message.includes("registered") ||
            message.includes("exists")
            ? ERROR_MESSAGES.ACCOUNT_EXISTS
            : error.message,
        );
      } else {
        setFormError(ERROR_MESSAGES.UNKNOWN);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <AuthHeader
        title="Join WorkSync"
        description="Hire professionals or grow your freelance career."
      />

      {formError && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <form className="space-y-4" onSubmit={handleCreateAccount}>
        <div className="space-y-1">
          <div className="flex items-start gap-2 text-sm leading-5">
            <input
              id="signup-terms"
              type="checkbox"
              required
              checked={acceptedTerms}
              onChange={(event) => {
                setAcceptedTerms(event.target.checked);
                setTermsError(false);
              }}
              aria-label="Agree to the Terms and Conditions and Privacy Policy"
              aria-invalid={termsError}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span
              className="cursor-pointer"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("button")) return;
                setAcceptedTerms((accepted) => !accepted);
                setTermsError(false);
              }}
            >
              I agree to WorkSync&apos;s{" "}
              <button
                type="button"
                className="font-medium text-primary underline underline-offset-2"
                onClick={() => {
                  setLegalDocument("terms");
                  setLegalDialogOpen(true);
                }}
              >
                Terms and Conditions
              </button>{" "}
              and{" "}
              <button
                type="button"
                className="font-medium text-primary underline underline-offset-2"
                onClick={() => {
                  setLegalDocument("privacy");
                  setLegalDialogOpen(true);
                }}
              >
                Privacy Policy
              </button>
              .
            </span>
          </div>
          {termsError && (
            <p className="pl-6 text-xs text-destructive" role="alert">
              Agreement is required before continuing.
            </p>
          )}
        </div>

        <Field>
          <FieldLabel htmlFor="signup-email">Email address</FieldLabel>
          <Input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFormError("");
            }}
            disabled={signupDisabled}
            required
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="signup-password">Password</FieldLabel>
          <div className="relative">
            <Input
              id="signup-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="pr-10"
              value={password}
              aria-invalid={!!passwordError}
              aria-describedby="signup-password-requirements"
              onChange={(event) => {
                setPassword(event.target.value);
                setPasswordError("");
                setFormError("");
              }}
              disabled={signupDisabled}
              required
            />
            <button
              type="button"
              disabled={signupDisabled}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setShowPassword((show) => !show)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
          <ul
            id="signup-password-requirements"
            aria-label="Password requirements"
            className="grid grid-cols-1 gap-x-3 gap-y-1.5 pt-1 text-xs sm:grid-cols-2"
          >
            {PASSWORD_RULES.map((rule) => {
              const passed = rule.test(password);
              return (
                <li
                  key={rule.id}
                  className={`flex items-center gap-1.5 ${passed ? "text-primary" : "text-muted-foreground"}`}
                >
                  {passed ? (
                    <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Circle className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>{rule.label}</span>
                </li>
              );
            })}
          </ul>
          {passwordError && (
            <p className="text-xs text-destructive">{passwordError}</p>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor="signup-confirm-password">
            Confirm password
          </FieldLabel>
          <div className="relative">
            <Input
              id="signup-confirm-password"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              className="pr-10"
              value={confirmPassword}
              aria-invalid={!!confirmPasswordError}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setConfirmPasswordError("");
                setFormError("");
              }}
              disabled={signupDisabled}
              required
            />
            <button
              type="button"
              disabled={signupDisabled}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setShowConfirmPassword((show) => !show)}
              aria-label={
                showConfirmPassword ? "Hide confirm password" : "Show confirm password"
              }
              aria-pressed={showConfirmPassword}
            >
              {showConfirmPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {confirmPasswordError && (
            <p className="text-xs text-destructive">{confirmPasswordError}</p>
          )}
        </Field>

        <Button type="submit" className="w-full" disabled={signupDisabled}>
          {loading ? "Creating account..." : "Create Account"}
        </Button>

        <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          <span>or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <GoogleButton
          loading={loading}
          disabled={!acceptedTerms}
          text="Continue with Google"
          onClick={handleGoogleSignup}
        />
      </form>

      <WorkSyncLegalDialog
        open={legalDialogOpen}
        onOpenChange={setLegalDialogOpen}
        document={legalDocument}
        onDocumentChange={setLegalDocument}
        context="account"
      />

      <Dialog
        open={verificationDialogOpen}
        onOpenChange={setVerificationDialogOpen}
      >
        <DialogContent className="space-y-4 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Check your email</DialogTitle>
            <DialogDescription>
              We sent a verification link to{" "}
              <span className="break-all font-medium text-foreground">
                {verificationEmail}
              </span>
              . Open the link to verify your email and continue to account
              setup.
            </DialogDescription>
          </DialogHeader>
          <Button
            type="button"
            className="w-full"
            onClick={() => setVerificationDialogOpen(false)}
          >
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
