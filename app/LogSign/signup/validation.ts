import {
  EMAIL_REGEX,
  NAME_REGEX,
  MIN_PASSWORD_LENGTH,
  ERROR_MESSAGES,
} from "./constants";

import { SignupFormData } from "./types";

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

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

  return { valid: true };
}

/**
 * Name Validation
 */
export function validateName(
  name: string,
  field: "First Name" | "Last Name"
): ValidationResult {
  const cleanName = name.trim();

  if (!cleanName) {
    return {
      valid: false,
      message: `${field} is required.`,
    };
  }

  if (!NAME_REGEX.test(cleanName)) {
    return {
      valid: false,
      message: `Please enter a valid ${field.toLowerCase()}.`,
    };
  }

  return { valid: true };
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
      message: "Password is required.",
    };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: ERROR_MESSAGES.PASSWORD_SHORT,
    };
  }

  return { valid: true };
}

/**
 * Confirm Password Validation
 */
export function validateConfirmPassword(
  password: string,
  confirmPassword: string
): ValidationResult {
  if (!confirmPassword) {
    return {
      valid: false,
      message: "Please confirm your password.",
    };
  }

  if (password !== confirmPassword) {
    return {
      valid: false,
      message: ERROR_MESSAGES.PASSWORD_MISMATCH,
    };
  }

  return { valid: true };
}

/**
 * Complete Signup Validation
 */
export function validateSignupForm(
  form: SignupFormData
): ValidationResult {
  const emailValidation = validateEmail(form.email);

  if (!emailValidation.valid) {
    return emailValidation;
  }

  const firstNameValidation = validateName(
    form.firstName,
    "First Name"
  );

  if (!firstNameValidation.valid) {
    return firstNameValidation;
  }

  const lastNameValidation = validateName(
    form.lastName,
    "Last Name"
  );

  if (!lastNameValidation.valid) {
    return lastNameValidation;
  }

  const passwordValidation = validatePassword(
    form.password
  );

  if (!passwordValidation.valid) {
    return passwordValidation;
  }

  const confirmValidation =
    validateConfirmPassword(
      form.password,
      form.confirmPassword
    );

  if (!confirmValidation.valid) {
    return confirmValidation;
  }

  return {
    valid: true,
  };
}