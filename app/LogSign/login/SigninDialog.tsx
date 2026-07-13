"use client";

import * as React from "react";

import {
  AuthHeader,
  AuthPopup,
} from "../shared";

import { usePopup } from "../shared/usePopup";

import { supabase } from "@/lib/supabaseClient";
import { SigninForm } from "./SigninForm";
import { useRouter } from "next/navigation";
import { login } from "./signinService";

import {
  validateSigninForm,
} from "./validation";

import {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from "./constants";

export function SigninDialog() {

    const router = useRouter();
    
  const [email, setEmail] =
    React.useState("");

  const [password, setPassword] =
    React.useState("");

  const [loading, setLoading] =
    React.useState(false);

  const [passwordError, setPasswordError] =
    React.useState("");

  const [showPassword, setShowPassword] =
    React.useState(false);

  const { popup, showPopup } =
    usePopup();

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
            redirectTo: `${window.location.origin}/Home/MarketPlace`,
        },
    });

    if (error) {
        console.error(error.message);
        showPopup(error.message, "error");
    }
};

  const handleSwitchToSignup = () => {
    // TODO:
    // Close Login Dialog
    // Open Signup Dialog
  };

  const handleSignin = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    if (loading) return;

    setLoading(true);

    try {
      const validation =
        validateSigninForm({
          email,
          password,
        });

      if (!validation.valid) {
        if (
          validation.message
            ?.toLowerCase()
            .includes("password")
        ) {
          setPasswordError(
            validation.message
          );
        }

        showPopup(
          validation.message ??
            ERROR_MESSAGES.UNKNOWN,
          "error"
        );

        return;
      }

      setPasswordError("");

      await login({
        email,
        password,
      });

      showPopup(
        SUCCESS_MESSAGES.LOGIN_SUCCESS,
        "success"
      );

      resetForm();

      router.replace("/Home/MarketPlace");

    } catch (error) {
      console.error(error);

      if (error instanceof Error) {
        switch (error.message) {
          case "INVALID_CREDENTIALS":
            showPopup(
              ERROR_MESSAGES.INVALID_CREDENTIALS,
              "error"
            );
            break;

          case "EMAIL_NOT_VERIFIED":
            showPopup(
              ERROR_MESSAGES.EMAIL_NOT_VERIFIED,
              "error"
            );
            break;

          default:
            showPopup(
              error.message,
              "error"
            );
        }
      } else {
        showPopup(
          ERROR_MESSAGES.UNKNOWN,
          "error"
        );
      }
    } finally {
      setLoading(false);
    }
  };  return (
    <>
      <AuthPopup popup={popup} />

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
        onTogglePassword={() =>
          setShowPassword((prev) => !prev)
        }
        onForgotPassword={handleForgotPassword}
        onGoogle={handleGoogleSignin}
        onSwitchToSignup={handleSwitchToSignup}
        onSubmit={handleSignin}
      />
    </>
  );
}