"use client";

import * as React from "react";
import { AuthHeader, AuthPopup } from "../shared";
import { usePopup } from "../shared/usePopup";
import { SignupEmailStep } from "./SignupEmailStep";
import { SignupDetailsStep } from "./SignupDetailsStep";
import { createAccount } from "./signupService";
import { validateEmail, validateSignupForm } from "./validation";
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "./constants";

export function SignupDialog() {
    const [step, setStep] = React.useState<"email" | "details">("email");
    const [email, setEmail] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [passwordError, setPasswordError] = React.useState("");
    const [showPassword, setShowPassword] = React.useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
    const { popup, showPopup } = usePopup();
    const resetForm = () => {
        setEmail("");
        setPasswordError("");
        setShowPassword(false);
        setShowConfirmPassword(false);
        setStep("email");
    };

    const handleGoogleSignup = () => {
        // TODO: Google OAuth
    };

    const handleEmailContinue = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const validation = validateEmail(email);

        if (!validation.valid) {
            showPopup(validation.message ?? ERROR_MESSAGES.INVALID_EMAIL, "error" );
            return;
        }

        setEmail(email.trim().toLowerCase());
        setStep("details");
    };

    const handleCreateAccount = async (
        e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (loading) return;

        setLoading(true);

        try {
            const form = e.currentTarget;

            const firstName = (form.elements.namedItem("firstName") as HTMLInputElement).value;
            const lastName = (form.elements.namedItem("lastName") as HTMLInputElement).value;
            const password = (form.elements.namedItem("password") as HTMLInputElement).value;
            const confirmPassword = (form.elements.namedItem("confirmPassword") as HTMLInputElement).value;

            const validation = validateSignupForm({email, firstName, lastName, password, confirmPassword});

            if (!validation.valid) {
                if (validation.message?.toLowerCase().includes("password")) {
                    setPasswordError(validation.message);
                }
                showPopup(validation.message ?? ERROR_MESSAGES.UNKNOWN, "error");
                return;
            }

            setPasswordError("");

            await createAccount({
                email,
                password,
                firstName,
                lastName,
            });

            showPopup(
                SUCCESS_MESSAGES.ACCOUNT_CREATED,
                "success"
            );

            resetForm();
        } catch (error) {
            console.error(error);

            if (error instanceof Error) {
                const message =
                    error.message.toLowerCase();

                if (
                    message.includes("already") ||
                    message.includes("registered") ||
                    message.includes("exists")
                ) {
                    showPopup(
                        ERROR_MESSAGES.ACCOUNT_EXISTS,
                        "error"
                    );
                } else {
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
    };
    return (
        <>
            <AuthPopup popup={popup} />

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
                    onTogglePassword={() =>
                        setShowPassword((prev) => !prev)
                    }
                    onToggleConfirmPassword={() =>
                        setShowConfirmPassword(
                            (prev) => !prev
                        )
                    }
                    onPasswordChange={() =>
                        setPasswordError("")
                    }
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