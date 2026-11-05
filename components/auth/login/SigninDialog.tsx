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
import { AuthLoadingScreen } from "@/components/auth/AuthLoadingScreen";

export function SigninDialog() {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [signup, setSignup] = React.useState(false);
  const [password, setPassword] = React.useState("");

  const [loading, setLoading] = React.useState(false);
  const [signingIn, setSigningIn] = React.useState(false);

  const [passwordError, setPasswordError] = React.useState("");
  const [emailError, setEmailError] = React.useState("");

  const [showPassword, setShowPassword] = React.useState(false);

  const [formError, setFormError] = React.useState("");
  const showMessage = (message: string) => setFormError(message);
  const getSigninErrorMessage = (cause: unknown) => {
    const message = cause instanceof Error ? cause.message : "";
    if (
      cause instanceof TypeError ||
      /failed to fetch|networkerror|load failed/i.test(message)
    ) {
      return "Unable to reach WorkSync sign-in. Check your connection and try again.";
    }
    return message || ERROR_MESSAGES.UNKNOWN;
  };
  const adminSignin =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("redirectTo") === "/admin";

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setPasswordError("");
    setEmailError("");
    setShowPassword(false);
  };

  const handleGoogleSignin = async () => {
    if (loading) return;
    setLoading(true);
    setSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback${adminSignin ? "?redirectTo=%2Fadmin" : ""}`,
          ...(adminSignin ? { queryParams: { prompt: "select_account" } } : {}),
        },
      });

      if (error) throw error;
    } catch (error) {
      showMessage(getSigninErrorMessage(error));
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

    setFormError("");
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
        } else {
          setEmailError(validation.message ?? ERROR_MESSAGES.UNKNOWN);
        }

        return;
      }

      setEmailError("");
      setPasswordError("");

      const user = await login({
        email,
        password,
      });

      const destination = await getPostSigninPath(user.id, adminSignin);

      resetForm();
      router.replace(destination);
    } catch (error) {
      if (error instanceof Error) {
        switch (error.message) {
          case "INVALID_CREDENTIALS":
            setEmailError(ERROR_MESSAGES.INVALID_CREDENTIALS);
            setPasswordError(ERROR_MESSAGES.INVALID_CREDENTIALS);
            break;

          case "EMAIL_NOT_VERIFIED":
            showMessage(ERROR_MESSAGES.EMAIL_NOT_VERIFIED);
            break;

          default:
            showMessage(getSigninErrorMessage(error));
        }
      } else {
        showMessage(getSigninErrorMessage(error));
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
      {signingIn && <AuthLoadingScreen />}
      {formError && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <AuthHeader
        title={adminSignin ? "Admin sign-in" : "Welcome Back"}
        description={
          adminSignin
            ? "Sign in with an account that has administrator access."
            : "Sign in to continue to WorkSync."
        }
      />

      <SigninForm
        email={email}
        loading={loading}
        emailError={emailError}
        passwordError={passwordError}
        showPassword={showPassword}
        onEmailChange={(value) => {
          setEmail(value);
          if (emailError) setEmailError("");
          if (passwordError === ERROR_MESSAGES.INVALID_CREDENTIALS) setPasswordError("");
        }}
        onPasswordChange={(value) => {
          setPassword(value);

          if (passwordError) {
            setPasswordError("");
          }
          if (emailError === ERROR_MESSAGES.INVALID_CREDENTIALS) {
            setEmailError("");
          }
        }}
        onTogglePassword={() => setShowPassword((prev) => !prev)}
        onGoogle={handleGoogleSignin}
        onSwitchToSignup={handleSwitchToSignup}
        onSubmit={handleSignin}
      />
    </>
  );
}
