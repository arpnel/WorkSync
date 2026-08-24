"use client";

import * as React from "react";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FcGoogle } from "react-icons/fc";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export function LoginDialog() {
  const [step, setStep] = React.useState<"email" | "details">("email");
  const [passwordError, setPasswordError] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const [popup, setPopup] = React.useState<{
    show: boolean;
    message: string;
    type: "success" | "error";
  }>({
    show: false,
    message: "",
    type: "success",
  });

  const showPopup = (
    message: string,
    type: "success" | "error"
  ) => {
    setPopup({
      show: true,
      message,
      type,
    });

    setTimeout(() => {
      setPopup({
        show: false,
        message: "",
        type: "success",
      });
    }, 2500);
  };
  const passwordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  const handleCreateAccount = async (
    form: HTMLFormElement
  ) => {
    if (loading) return;

    setLoading(true);

    try {
      const firstName = (
        form.elements.namedItem("firstName") as HTMLInputElement
      ).value.trim();

      const lastName = (
        form.elements.namedItem("lastName") as HTMLInputElement
      ).value.trim();

      const password = (
        form.elements.namedItem("password") as HTMLInputElement
      ).value;

      const confirmPassword = (
        form.elements.namedItem("confirmPassword") as HTMLInputElement
      ).value;

      const cleanEmail = email.trim();

      if (!cleanEmail) {
        showPopup("Email is missing.", "error");
        return;
      }

      if (!passwordRegex.test(password)) {
        setPasswordError(
          "Password must contain at least 8 characters, one uppercase letter, one lowercase letter, and one number."
        );

        showPopup(
          "Password is too weak.",
          "error"
        );

        return;
      }

      if (password !== confirmPassword) {
        setPasswordError("Passwords do not match.");
        showPopup("Passwords do not match.", "error");
        return;
      }

      setPasswordError("");

      const { data: authData, error: authError } =
        await supabase.auth.signUp({
          email: cleanEmail,
          password,
        });

      if (authError) {
        const errorMessage = authError.message.toLowerCase();

        if (
          errorMessage.includes("already") ||
          errorMessage.includes("registered") ||
          errorMessage.includes("exists")
        ) {
          showPopup(
            "An account with this email already exists.",
            "error"
          );
        } else {
          showPopup(authError.message, "error");
        }

        return;
      }

      const user = authData.user;

      if (!user) {
        showPopup(
          "Failed to create account.",
          "error"
        );
        return;
      }

      const { error: insertError } = await supabase
        .from("Users")
        .insert({
          user_id: user.id,
          first_name: firstName,
          last_name: lastName,
          email: cleanEmail,
          role: "client",
        });

      if (insertError) {
        console.error(insertError);

        showPopup(
          "Account created but profile setup failed.",
          "error"
        );

        return;
      }

      showPopup(
        "Account created! Please verify your email before logging in.",
        "success"
      );

      setEmail("");
      setPasswordError("");
      setStep("email");
    } catch (error) {
      console.error(error);

      showPopup(
        "Something went wrong. Please try again.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {popup.show && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div
            className={`px-6 py-4 rounded-lg shadow-xl flex items-center gap-3 text-sm animate-in fade-in zoom-in
            ${popup.type === "success"
                ? "bg-green-600 text-white"
                : "bg-red-600 text-white"
              }`}
          >
            {popup.type === "success" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}

            {popup.message}
          </div>
        </div>
      )}

      <DialogHeader className="text-center space-y-2">
        <DialogTitle className="text-2xl font-bold">
          Join WorkSync
        </DialogTitle>

        <DialogDescription>
          Hire professionals or grow your freelance career.
        </DialogDescription>
      </DialogHeader>

      {step === "email" && (
        <form
          className="space-y-5 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            setStep("details");
          }}
        >
          <Field>
            <FieldLabel>Email</FieldLabel>

            <Input
              type="email"
              required
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
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

          <Button
            type="button"
            variant="outline"
            className="w-full h-11 gap-2"
            disabled={loading}
            onClick={() => {
              // TODO: Google OAuth Sign-In
            }}
          >
            <FcGoogle className="size-5" />
            Continue with Google
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            By continuing, you agree to WorkSync’s Terms
            and Privacy Policy.
          </p>
        </form>
      )}

      {step === "details" && (
        <form
          className="space-y-5 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateAccount(e.currentTarget);
          }}
        >
          <Field>
            <FieldLabel>First Name</FieldLabel>
            <Input
              name="firstName"
              maxLength={50}
              required
            />
          </Field>

          <Field>
            <FieldLabel>Last Name</FieldLabel>
            <Input
              name="lastName"
              maxLength={50}
              required
            />
          </Field>

          <Field>
            <FieldLabel>Password</FieldLabel>

            <div className="relative">
              <Input
                name="password"
                type={
                  showPassword ? "text" : "password"
                }
                className="pr-10"
                required
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword(!showPassword)
                }
                className="absolute right-2 top-2"
              >
                {showPassword ? (
                  <EyeOff size={16} />
                ) : (
                  <Eye size={16} />
                )}
              </button>
            </div>
          </Field>

          <Field>
            <FieldLabel>Confirm Password</FieldLabel>

            <div className="relative">
              <Input
                name="confirmPassword"
                type={
                  showConfirmPassword
                    ? "text"
                    : "password"
                }
                className="pr-10"
                required
              />

              <button
                type="button"
                onClick={() =>
                  setShowConfirmPassword(
                    !showConfirmPassword
                  )
                }
                className="absolute right-2 top-2"
              >
                {showConfirmPassword ? (
                  <EyeOff size={16} />
                ) : (
                  <Eye size={16} />
                )}
              </button>
            </div>

            {passwordError && (
              <div className="mt-2 flex items-center gap-2 text-red-500">
                <AlertCircle size={16} />
                {passwordError}
              </div>
            )}
          </Field>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={loading}
              onClick={() =>
                setStep("email")
              }
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
      )}
    </>
  );
}
