"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InputErrorMessage } from "@/components/auth/InputErrorMessage";

import { PasswordField, GoogleButton } from "../";

import { SigninFormProps } from "../../../types/auth/login.types";

export function SigninForm({
    email,
    loading,
    emailError,
    passwordError,
    showPassword,

    onEmailChange,
    onPasswordChange,

    onTogglePassword,

    onForgotPassword,

    onGoogle,

    onSwitchToSignup,

    onSubmit,
}: SigninFormProps) {
    return (
        <form
            className="space-y-5 pt-4"
            noValidate
            onSubmit={onSubmit}
        >
            <Field data-invalid={!!emailError}>
                <FieldLabel htmlFor="signin-email">Email</FieldLabel>

                <Input
                    id="signin-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? "signin-email-error" : undefined}
                    onChange={(e) =>
                        onEmailChange(e.target.value)
                    }
                />
                {emailError && (
                    <InputErrorMessage id="signin-email-error">{emailError}</InputErrorMessage>
                )}
            </Field>

            <PasswordField
                label="Password"
                name="password"
                showPassword={showPassword}
                onToggle={onTogglePassword}
                error={passwordError}
                onChange={(e) =>
                    onPasswordChange(e.target.value)
                }
            />

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-sm text-primary hover:underline"
                >
                    Forgot Password?
                </button>
            </div>

            <Button
                type="submit"
                className="w-full"
                disabled={loading}
            >
                {loading
                    ? "Signing In..."
                    : "Sign In"}
            </Button>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <span>Or continue with</span>
                <span className="h-px flex-1 bg-border" />
            </div>

            <GoogleButton
                loading={loading}
                onClick={onGoogle}
                text="Continue with Google"
            />

            <p className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?
                <button
                    type="button"
                    onClick={onSwitchToSignup}
                    className="ml-1 font-medium text-primary hover:underline"
                >
                    Sign Up
                </button>
            </p>
        </form>
    );
}
