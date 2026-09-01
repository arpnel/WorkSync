"use client";

import * as React from "react";

import { AuthHeader } from "../";

import { supabase } from "@/lib/supabaseClient";
import { SigninForm } from "./SigninForm";
import { useRouter } from "next/navigation";
import { login } from "../../../services/auth/signinService";

import { validateSigninForm } from "../../../lib/validation/auth.validation";

import { ERROR_MESSAGES } from "../constants";

export function SigninDialog() {
  const router = useRouter();

  const [email, setEmail] = React.useState("");

  const [password, setPassword] = React.useState("");

  const [loading, setLoading] = React.useState(false);

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

  const handleForgotPassword = () => {
    // TODO:
    // Open Forgot Password Dialog
  };

  const handleGoogleSignin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error(error.message);
      showMessage(error.message);
    }
  };

  const handleSwitchToSignup = () => {
    // TODO:
    // Close Login Dialog
    // Open Signup Dialog
  };

  const handleSignin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (loading) return;

    setLoading(true);

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

      // Check if the user has completed account setup
      const { data: profile, error } = await supabase
        .from("profiles") // change if your table has a different name
        .select("account_setup_completed")
        .eq("user_id", user.id)
        .single();

      if (error) {
        throw error;
      }

      resetForm();

      if (profile?.account_setup_completed) {
        router.replace("/home/marketplace");
      } else {
        router.replace("/account-setup");
      }
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
