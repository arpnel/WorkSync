/**
 * Signup Configuration
 */

export const MIN_PASSWORD_LENGTH = 8;

export const MAX_NAME_LENGTH = 50;

export const POPUP_DURATION = 2500;

export const DEFAULT_ROLE = "client";

/**
 * Validation
 */

export const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const NAME_REGEX =
  /^[A-Za-zÀ-ÿ' -]{2,50}$/;

/**
 * Messages
 */

export const SUCCESS_MESSAGES = {
  ACCOUNT_CREATED:
    "Account created! Please verify your email before logging in.",
} as const;

export const ERROR_MESSAGES = {
  EMAIL_REQUIRED: "Email is required.",

  INVALID_EMAIL:
    "Please enter a valid email address.",

  PASSWORD_SHORT:
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,

  PASSWORD_MISMATCH:
    "Passwords do not match.",

  ACCOUNT_EXISTS:
    "An account with this email already exists.",

  ACCOUNT_FAILED:
    "Failed to create account.",

  PROFILE_FAILED:
    "Account created but profile setup failed.",

  UNKNOWN:
    "Something went wrong. Please try again.",
} as const;