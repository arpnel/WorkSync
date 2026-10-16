import {
  EMAIL_REGEX,
  NAME_REGEX,
  ERROR_MESSAGES,
} from "../../components/auth/constants";

import {
  SignupFormData,
} from "../../types/auth/signup.types";

import {
  SigninFormData,
} from "../../types/auth/login.types";


export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { id: "uppercase", label: "At least one uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { id: "lowercase", label: "At least one lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { id: "number", label: "At least one number", test: (value: string) => /[0-9]/.test(value) },
  { id: "special", label: "At least one special character", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

export function passwordMeetsRequirements(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}


// Email Validation (Signup + Signin)
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


// Name Validation (Signup Only)
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

  return {
    valid: true,
  };
}


// Password Validation (Signup + Signin)
export function validatePassword(
  password: string,
  checkLength = false
): ValidationResult {

  if (!password) {
    return {
      valid: false,
      message: ERROR_MESSAGES.PASSWORD_REQUIRED,
    };
  }

  if (checkLength && !passwordMeetsRequirements(password)) {
    const unmet = PASSWORD_RULES.find((rule) => !rule.test(password));
    return { valid: false, message: unmet?.label ?? ERROR_MESSAGES.PASSWORD_SHORT + " Include uppercase and lowercase letters, a number, and a special character." };
  }

  return {
    valid: true,
  };
}


// Confirm Password Validation (Signup Only)
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

  return {
    valid: true,
  };
}


// Complete Signup Validation
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
    form.password,
    true
  );

  if (!passwordValidation.valid) {
    return passwordValidation;
  }


  return validateConfirmPassword(
    form.password,
    form.confirmPassword
  );
}


// Complete Signin Validation
export function validateSigninForm(
  form: SigninFormData
): ValidationResult {

  const emailValidation = validateEmail(form.email);

  if (!emailValidation.valid) {
    return emailValidation;
  }


  const passwordValidation = validatePassword(
    form.password
  );

  if (!passwordValidation.valid) {
    return passwordValidation;
  }


  return {
    valid: true,
  };
}
