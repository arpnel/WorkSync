import {
  EMAIL_REGEX,
  ERROR_MESSAGES,
} from "./constants";

import {
  SigninFormData,
  ValidationResult,
} from "./types";

/**
 * Email Validation
 */
export function validateEmail(
  email: string
): ValidationResult {
  const cleanEmail = email.trim();

  if (!cleanEmail) {
    return {
      valid: false,
      message: ERROR_MESSAGES.EMAIL_REQUIRED,
    };
  }

  if (!EMAIL_REGEX.test(cleanEmail)) {
    return {
      valid: false,
      message: ERROR_MESSAGES.INVALID_EMAIL,
    };
  }

  return {
    valid: true,
  };
}

/**
 * Password Validation
 */
export function validatePassword(
  password: string
): ValidationResult {
  if (!password) {
    return {
      valid: false,
      message: ERROR_MESSAGES.PASSWORD_REQUIRED,
    };
  }

  return {
    valid: true,
  };
}

/**
 * Sign In Validation
 */
export function validateSigninForm(
  form: SigninFormData
): ValidationResult {
  const emailValidation = validateEmail(
    form.email
  );

  if (!emailValidation.valid) {
    return emailValidation;
  }

  const passwordValidation =
    validatePassword(form.password);

  if (!passwordValidation.valid) {
    return passwordValidation;
  }

  return {
    valid: true,
  };
}