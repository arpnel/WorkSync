export interface PopupState {
  show: boolean;
  message: string;
  type: "success" | "error";
}

export interface SignupFormData {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
}

export interface CreateAccountData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}