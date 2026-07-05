"use client";

import * as React from "react";

import { PopupState } from "./AuthPopup";

interface UsePopupReturn {
  popup: PopupState;
  showPopup: (
    message: string,
    type: "success" | "error"
  ) => void;
  hidePopup: () => void;
}

const POPUP_DURATION = 2500;

export function usePopup(): UsePopupReturn {
  const [popup, setPopup] = React.useState<PopupState>({
    show: false,
    message: "",
    type: "success",
  });

  const timeoutRef = React.useRef<
    ReturnType<typeof setTimeout> | null
  >(null);

  const hidePopup = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setPopup({
      show: false,
      message: "",
      type: "success",
    });
  }, []);

  const showPopup = React.useCallback(
    (
      message: string,
      type: "success" | "error"
    ) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setPopup({
        show: true,
        message,
        type,
      });

      timeoutRef.current = setTimeout(() => {
        hidePopup();
      }, POPUP_DURATION);
    },
    [hidePopup]
  );

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    popup,
    showPopup,
    hidePopup,
  };
}