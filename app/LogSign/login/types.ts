export interface SigninFormData {
  email: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export interface SigninFormProps {
  email: string;
  loading: boolean;
  passwordError: string;
  showPassword: boolean;

  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;

  onTogglePassword: () => void;

  onForgotPassword: () => void;

  onGoogle: () => void;

  // NEW
  onSwitchToSignup: () => void;

  onSubmit: (
    e: React.FormEvent<HTMLFormElement>
  ) => void;
}