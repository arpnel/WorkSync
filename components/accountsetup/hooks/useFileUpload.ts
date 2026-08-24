import { useCallback, useState, type ChangeEvent } from "react";

/**
 * Reusable hook to manage a single file selection (e.g. resume,
 * government ID) with a preview-capable value.
 */
export function useFileUpload() {
  const [file, setFile] = useState<File | null>(null);

  const handleFileSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selected = event.target.files?.[0] ?? null;
      setFile(selected);
    },
    [],
  );

  const handleFileRemove = useCallback(() => {
    setFile(null);
  }, []);

  return {
    file,
    handleFileSelect,
    handleFileRemove,
  };
}
