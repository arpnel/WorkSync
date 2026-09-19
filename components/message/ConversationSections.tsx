"use client";
import {
  Archive,
  Ban,
  Pin,
  BriefcaseBusiness,
  FolderKanban,
  MessageCircle,
  MessagesSquare,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Conversation } from "./ConversationList";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export const sections = [
  {
    id: "all",
    label: "All chats",
    description: "All your conversations.",
    icon: MessagesSquare,
  },
  {
    id: "projects",
    label: "Projects",
    description: "Conversations about your projects.",
    icon: FolderKanban,
  },
  {
    id: "orders",
    label: "Orders",
    description: "Service orders and delivery updates.",
    icon: ShoppingBag,
  },
  {
    id: "jobs",
    label: "Jobs",
    description: "Conversations about jobs.",
    icon: BriefcaseBusiness,
  },
  {
    id: "direct",
    label: "Direct",
    description: "Chats without linked work.",
    icon: MessageCircle,
  },
  {
    id: "archived",
    label: "Archived",
    description: "Conversations you archived.",
    icon: Archive,
  },
  {
    id: "blocked",
    label: "Blocked",
    description: "Users you blocked.",
    icon: Ban,
  },
  {
    id: "pinned",
    label: "Pinned",
    description: "Your priority conversations.",
    icon: Pin,
  },
] as const;
export function matchesSection(c: Conversation, section: string) {
  if (section === "blocked") return Boolean(c.blocked);
  if (section === "archived") return Boolean(c.archived) && !c.blocked;
  if (c.archived || c.blocked) return false;
  if (section === "pinned") return Boolean(c.pinned);
  return section === "all" || (c.category ?? "direct") === section;
}
export type Section = (typeof sections)[number]["id"];

interface Props {
  conversations: Conversation[];
  section: Section;
  onSectionChange: (section: Section) => void;
  loading?: boolean;
}
export default function ConversationSections({
  conversations,
  section,
  onSectionChange,
  loading = false,
}: Props) {
  const quickSections = ["pinned"] as const;
  const categorySections = sections.filter(
    (item) => !["pinned", "archived", "blocked"].includes(item.id),
  );
  const categorySelected = categorySections.some((item) => item.id === section);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        value={categorySelected ? section : ""}
        onValueChange={(value) => {
          const next = categorySections.find((item) => item.id === value);
          if (next) onSectionChange(next.id);
        }}
      >
        <SelectTrigger
          aria-label="Filter by conversation type"
          title="Filter by conversation type"
          className="h-8 w-auto min-w-0 gap-2 rounded-full border-0 bg-blue-50 px-3 text-xs font-semibold text-blue-700 shadow-none hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/25"
        >
          <SelectValue placeholder="Chat type">
            {categorySelected
              ? sections.find((item) => item.id === section)?.label
              : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {categorySections.map(({ id, label, icon: Icon }) => {
            const count = conversations.filter((c) =>
              matchesSection(c, id),
            ).length;
            return (
              <SelectItem key={id} value={id} textValue={label}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
                {!loading && (
                  <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                    {count}
                  </span>
                )}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <div className="contents" role="group" aria-label="Chat shortcuts">
        {quickSections.map((id) => {
          const { label, icon: Icon } = sections.find(
            (item) => item.id === id,
          )!;
          const active = section === id;
          const count = conversations.filter((c) =>
            matchesSection(c, id),
          ).length;
          return (
            <Button
              key={id}
              type="button"
              variant="ghost"
              size="sm"
              className={
                active
                  ? "h-8 gap-1.5 rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground ring-1 ring-border hover:bg-accent/80"
                  : "h-8 gap-1.5 rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }
              aria-label={
                label + (loading ? " chats" : " chats (" + count + ")")
              }
              aria-pressed={active}
              title={label + (loading ? "" : " (" + count + ")")}
              onClick={() => onSectionChange(active ? "all" : id)}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
