/**
 * Validation
 */

export const EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Popup
 */

export const POPUP_DURATION = 2500;

/**
 * Success Messages
 */

export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: "Welcome back!",
} as const;

/**
 * Error Messages
 */

export const ERROR_MESSAGES = {
  EMAIL_REQUIRED:
    "Please enter your email.",

  INVALID_EMAIL:
    "Please enter a valid email address.",

  PASSWORD_REQUIRED:
    "Please enter your password.",

  INVALID_CREDENTIALS:
    "Invalid email or password.",

  EMAIL_NOT_VERIFIED:
    "Please verify your email before signing in.",

  ACCOUNT_DISABLED:
    "This account has been disabled.",

  UNKNOWN:
    "Something went wrong. Please try again.",
} as const;