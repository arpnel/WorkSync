"use client";

import { useState, type ReactNode } from "react";
import {
  Wallet,
  Bell,
  MessageSquare,
  ShieldCheck,
  UserRound,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const sections = [
  {
    id: "account",
    label: "General",
    description: "Account details and security",
    Icon: UserRound,
  },
  {
    id: "payouts",
    label: "Payouts",
    description: "Where approved project payments are sent",
    Icon: Wallet,
  },
  {
    id: "verification",
    label: "Verification",
    description: "Manage your identity verification",
    Icon: ShieldCheck,
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Choose the updates you receive",
    Icon: Bell,
  },
  {
    id: "messaging",
    label: "Messaging",
    description: "Conversation preferences",
    Icon: MessageSquare,
  },
] as const;

export function SettingsWorkspace({
  panels,
}: {
  panels: Record<(typeof sections)[number]["id"], ReactNode>;
}) {
  const [active, setActive] = useState("account");
  const [phoneDetail, setPhoneDetail] = useState(false);
  return (
    <Tabs
      value={active}
      onValueChange={setActive}
      orientation="vertical"
      className="grid min-w-0 items-start gap-6 md:grid-cols-[210px_minmax(0,1fr)]"
    >
      <nav
        aria-label="Settings sections"
        className={`divide-y overflow-hidden rounded-xl border bg-card md:hidden ${phoneDetail ? "hidden" : ""}`}
      >
        {sections.map(({ id, label, description, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setActive(id);
              setPhoneDetail(true);
            }}
            className="flex min-h-20 w-full items-center gap-3 p-4 text-left"
          >
            <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{label}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {description}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          </button>
        ))}
      </nav>
      <TabsList
        aria-label="Settings sections"
        className="hidden h-auto w-full items-stretch justify-start gap-1 rounded-lg border bg-card p-2 md:sticky md:top-0 md:flex md:flex-col"
      >
        {sections.map(({ id, label, Icon }) => (
          <TabsTrigger
            key={id}
            value={id}
            className="min-h-11 flex-auto justify-start gap-3 rounded-md px-3 text-sm data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none md:w-full"
          >
            <Icon className="size-4" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className={`min-w-0 ${phoneDetail ? "" : "hidden md:block"}`}>
        <button
          type="button"
          onClick={() => setPhoneDetail(false)}
          className="mb-4 flex min-h-11 items-center gap-2 text-sm font-medium text-primary md:hidden"
        >
          <ArrowLeft className="size-4" />
          All settings
        </button>
        {sections.map(({ id, label, description }) => (
          <TabsContent
            key={id}
            value={id}
            forceMount
            className="mt-0 min-w-0 space-y-4 data-[state=inactive]:hidden"
          >
            <div className="border-b pb-4">
              <h2 className="text-lg font-semibold">{label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            </div>
            {panels[id]}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
