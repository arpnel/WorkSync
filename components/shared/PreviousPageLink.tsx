"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  href: string;
  "aria-label": string;
  className?: string;
  children: ReactNode;
};

export function PreviousPageLink({ href, ...props }: Props) {
  return <Link href={href} {...props} />;
}
