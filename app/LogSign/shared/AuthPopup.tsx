import { AlertCircle, CheckCircle2 } from "lucide-react";

export interface PopupState {
  show: boolean;
  message: string;
  type: "success" | "error";
}

interface AuthPopupProps {
  popup: PopupState;
}

export function AuthPopup({
  popup,
}: AuthPopupProps) {
  if (!popup.show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className={`px-6 py-4 rounded-lg shadow-xl flex items-center gap-3 text-sm animate-in fade-in zoom-in ${
          popup.type === "success"
            ? "bg-green-600 text-white"
            : "bg-red-600 text-white"
        }`}
      >
        {popup.type === "success" ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <AlertCircle className="h-5 w-5" />
        )}

        {popup.message}
      </div>
    </div>
  );
}