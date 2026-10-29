"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

type Props = {
  href: string;
  "aria-label": string;
  className?: string;
  children: ReactNode;
};

export function PreviousPageLink({ href, ...props }: Props) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return;

    if (window.history.length > 1) {
      event.preventDefault();
      router.back();
    }
  }

  return <Link href={href} onClick={handleClick} {...props} />;
}
