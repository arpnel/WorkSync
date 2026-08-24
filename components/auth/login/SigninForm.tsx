"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { PasswordField, GoogleButton } from "../";

import { SigninFormProps } from "../../../types/auth/login.types";

export function SigninForm({
    email,
    loading,
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
            onSubmit={onSubmit}
        >
            <Field>
                <FieldLabel>Email</FieldLabel>

                <Input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) =>
                        onEmailChange(e.target.value)
                    }
                />
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

            <GoogleButton
                loading={loading}
                onClick={onGoogle}
                text="Continue with Google"
            />

            <p className="text-center text-sm text-muted-foreground">
                Don't have an account?
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