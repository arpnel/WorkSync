"use client";

import * as React from "react";

import { AuthHeader } from "../";

import { supabase } from "@/lib/supabaseClient";
import { SigninForm } from "./SigninForm";
import { useRouter } from "next/navigation";
import { login } from "../../../services/auth/signinService";
import { getPostSigninPath } from "@/services/auth/completeSignin";

import { validateSigninForm } from "../../../lib/validation/auth.validation";

import { ERROR_MESSAGES } from "../constants";
import { SignupDialog } from "../signup/SignupDialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function SigninDialog() {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [signup, setSignup] = React.useState(false);
  const [notice, setNotice] = React.useState("");

  const [password, setPassword] = React.useState("");

  const [loading, setLoading] = React.useState(false);
  const [signingIn, setSigningIn] = React.useState(false);

  const [passwordError, setPasswordError] = React.useState("");

  const [showPassword, setShowPassword] = React.useState(false);

  const [formError, setFormError] = React.useState("");
  const showMessage = (message: string) => setFormError(message);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setPasswordError("");
    setShowPassword(false);
  };

  const handleForgotPassword = async () => {
    if (loading) return;
    setFormError("");
    setNotice("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      showMessage("Enter your email above, then select Forgot Password.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/reset-password`,
        },
      );
      if (error) throw error;
      setNotice(
        "If an account uses this email, you will receive a password reset link.",
      );
    } catch (cause) {
      showMessage(
        cause instanceof Error
          ? cause.message
          : "Unable to send a reset link. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignin = async () => {
    if (loading) return;
    setLoading(true);
    setSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (error) {
      console.error(error);
      showMessage(error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN);
      setSigningIn(false);
      setLoading(false);
    }
  };

  const handleSwitchToSignup = () => {
    setSignup(true);
  };

  const handleSignin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (loading) return;

    setLoading(true);
    setSigningIn(true);

    try {
      const validation = validateSigninForm({
        email,
        password,
      });

      if (!validation.valid) {
        if (validation.message?.toLowerCase().includes("password")) {
          setPasswordError(validation.message);
        }

        showMessage(validation.message ?? ERROR_MESSAGES.UNKNOWN);

        return;
      }

      setPasswordError("");

      const user = await login({
        email,
        password,
      });

      const destination = await getPostSigninPath(user.id);

      resetForm();
      router.replace(destination);
    } catch (error) {
      console.log("Login error:", error);
      console.log("Message:", error instanceof Error ? error.message : error);
      if (error instanceof Error) {
        switch (error.message) {
          case "INVALID_CREDENTIALS":
            showMessage(ERROR_MESSAGES.INVALID_CREDENTIALS);
            break;

          case "EMAIL_NOT_VERIFIED":
            showMessage(ERROR_MESSAGES.EMAIL_NOT_VERIFIED);
            break;

          default:
            showMessage(error.message);
        }
      } else {
        showMessage(ERROR_MESSAGES.UNKNOWN);
      }
    } finally {
      setSigningIn(false);
      setLoading(false);
    }
  };
  if (signup)
    return (
      <>
        <SignupDialog />
        <Button variant="ghost" onClick={() => setSignup(false)}>
          Back to sign in
        </Button>
      </>
    );
  return (
    <>
      {signingIn && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/75 p-4 text-foreground"
          role="status"
          aria-live="assertive"
          aria-busy="true"
        >
          <div className="flex min-w-48 flex-col items-center gap-3 rounded-2xl border bg-card px-8 py-7 shadow-xl">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold">Signing you in...</p>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {formError && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <AuthHeader
        title="Welcome Back"
        description="Sign in to continue to WorkSync."
      />

      <SigninForm
        email={email}
        loading={loading}
        passwordError={passwordError}
        showPassword={showPassword}
        onEmailChange={setEmail}
        onPasswordChange={(value) => {
          setPassword(value);

          if (passwordError) {
            setPasswordError("");
          }
        }}
        onTogglePassword={() => setShowPassword((prev) => !prev)}
        onForgotPassword={handleForgotPassword}
        onGoogle={handleGoogleSignin}
        onSwitchToSignup={handleSwitchToSignup}
        onSubmit={handleSignin}
      />
    </>
  );
}
