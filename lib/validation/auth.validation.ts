import {
  EMAIL_REGEX,
  NAME_REGEX,
  MIN_PASSWORD_LENGTH,
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

  if (
    checkLength &&
    password.length < MIN_PASSWORD_LENGTH
  ) {
    return {
      valid: false,
      message: ERROR_MESSAGES.PASSWORD_SHORT,
    };
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