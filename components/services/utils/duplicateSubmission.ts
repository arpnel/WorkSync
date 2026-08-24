import { useRef } from "react";

export function useDuplicateSubmissionLock() {
  const lockedRef = useRef(false);

  const lock = () => {
    if (lockedRef.current) return false;
    lockedRef.current = true;
    return true;
  };

  const unlock = () => {
    lockedRef.current = false;
  };

  return { lock, unlock };
}

