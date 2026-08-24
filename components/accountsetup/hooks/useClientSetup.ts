"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { validateClientSetup } from "@/lib/validation/account-setup.validation";

import { submitClientSetup } from "../service/accountSetup.service";

import type { ClientSetupValues } from "@/types/account-setup.types";

const INITIAL_VALUES: ClientSetupValues = {
  firstName: "",
  lastName: "",
  display_name: "",
  province: "",
  city: "",
  englishProficiency: "",
  profilePhoto: null,
  shortBio: "",
};

export function useClientSetup() {
  const router = useRouter();

  const [values, setValues] = useState<ClientSetupValues>(INITIAL_VALUES);
  const [photoPreview, setPhotoPreview] = useState("");
  const [errors, setErrors] = useState<
    Partial<Record<keyof ClientSetupValues, string>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (
    field: keyof ClientSetupValues,
    value: ClientSetupValues[keyof ClientSetupValues],
  ) => {
    setValues((prev) => ({ ...prev, [field]: value }));

    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handlePhotoSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    handleChange("profilePhoto", file);

    const reader = new FileReader();

    reader.onload = () => {
      setPhotoPreview(reader.result as string);
    };

    reader.readAsDataURL(file);
  };

  const handlePhotoRemove = () => {
    handleChange("profilePhoto", null);
    setPhotoPreview("");
  };

  const handleSubmit = async () => {
    const result = validateClientSetup(values);

    if (!result.ok) {
      setErrors(result.errors);
      toast.error("Please fix the errors before continuing.");
      return;
    }

    setIsSubmitting(true);

    try {
      await submitClientSetup(result.data);

      toast.success("Account setup completed!");

      router.push("/home/dashboard");
    } catch (error) {
      console.error("Client setup error:", error);

      toast.error("Failed to save your information.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    values,
    photoPreview,
    errors,
    isSubmitting,
    photoInputRef,
    handleChange,
    handlePhotoSelect,
    handlePhotoRemove,
    handleSubmit,
  };
}
