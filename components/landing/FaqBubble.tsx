"use client";
import { StyledSelect } from "@/components/ui/styled-select";

import { useState } from "react";
import Link from "next/link";
import {
  HelpCircle,
  X,
  Send,
  TicketCheck,
  BookOpen,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HELP_ARTICLES } from "@/lib/help/articles";
import { supabase } from "@/lib/supabaseClient";
const CATEGORIES = [
  "Account",
  "Payments",
  "Projects",
  "Technical issue",
  "Safety concern",
  "Other",
];
export function FaqBubble({
  supportEnabled = false,
  aboveMobileNav = false,
}: {
  supportEnabled?: boolean;
  aboveMobileNav?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [ticketOpen, setTicketOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [category, setCategory] = useState("Other");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const matches = HELP_ARTICLES.filter(
    (article) =>
      article.question.toLowerCase().includes(query.trim().toLowerCase()) ||
      article.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  async function startTicket() {
    const { data } = await supabase.auth.getUser();
    setSignedIn(!!data.user);
    setTicketOpen(true);
    setError("");
  }
  async function submitTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "worksync_submit_support_ticket",
        {
          p_category: category,
          p_subject: subject.trim(),
          p_description: description.trim(),
        },
      );
      if (rpcError) throw new Error(rpcError.message);
      setMessage(
        `Ticket ${String(data).slice(0, 8)} was submitted. Our team will review it.`,
      );
      setSubject("");
      setDescription("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to submit your ticket.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={`fixed ${aboveMobileNav ? "bottom-[calc(5rem+env(safe-area-inset-bottom))]" : "bottom-5"} right-4 z-50 sm:bottom-6 sm:right-6`}
    >
      {open && (
        <section
          aria-label="WorkSync help"
          className="mb-3 flex max-h-[min(75dvh,38rem)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-background shadow-xl"
        >
          <header className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="font-semibold">WorkSync Help</p>
              <p className="text-xs text-muted-foreground">
                Find an answer or browse every guide
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Close help"
              onClick={() => {
                setOpen(false);
                setTicketOpen(false);
              }}
            >
              <X />
            </Button>
          </header>
          {ticketOpen ? (
            <div className="overflow-y-auto p-4">
              {message ? (
                <div className="space-y-3 rounded-xl border border-emerald-600/20 bg-emerald-600/5 p-4 text-sm">
                  <TicketCheck className="size-5 text-emerald-700" />
                  <p className="font-medium">Ticket received</p>
                  <p className="text-muted-foreground">{message}</p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setTicketOpen(false);
                      setMessage("");
                    }}
                  >
                    Back to help
                  </Button>
                </div>
              ) : signedIn === false ? (
                <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
                  <p className="font-medium">Sign in to contact support</p>
                  <p className="text-muted-foreground">
                    Tickets are linked to your WorkSync account so our team can
                    follow up securely.
                  </p>
                  <Button asChild className="w-full">
                    <Link href="/login?redirectTo=%2F">
                      Sign in to continue
                    </Link>
                  </Button>
                </div>
              ) : (
                <form className="space-y-3" onSubmit={submitTicket}>
                  <div>
                    <p className="text-sm font-semibold">Contact support</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Do not include passwords, recovery codes, or full payment
                      details.
                    </p>
                  </div>
                  <label className="grid gap-3 text-xs font-medium">
                    <span>Category</span>
                    <span className="relative block">
                      <StyledSelect
                        className="h-10 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-9 text-sm font-normal outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                      >
                        {CATEGORIES.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </StyledSelect>
                      <ChevronDown
                        aria-hidden="true"
                        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      />
                    </span>
                  </label>
                  <label className="grid gap-2 text-xs font-medium">
                    <span className="block">Subject</span>
                    <Input
                      required
                      minLength={4}
                      maxLength={120}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="A short summary"
                    />
                  </label>
                  <label className="grid gap-2 text-xs font-medium">
                    <span className="block">What happened?</span>
                    <Textarea
                      required
                      minLength={20}
                      maxLength={4000}
                      rows={5}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Include relevant details or reference IDs."
                    />
                  </label>
                  {error && (
                    <p role="alert" className="text-xs text-destructive">
                      {error}
                    </p>
                  )}
                  <Button
                    className="w-full"
                    disabled={
                      busy ||
                      signedIn === null ||
                      !subject.trim() ||
                      description.trim().length < 20
                    }
                  >
                    <Send className="size-4" />
                    {busy ? "Submitting…" : "Submit ticket"}
                  </Button>
                </form>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-3 overflow-y-auto p-3">
                <label className="sr-only" htmlFor="help-search">
                  Search help articles
                </label>
                <input
                  id="help-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search help articles"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <nav aria-label="Popular help articles" className="space-y-1">
                  {matches.slice(0, 6).map((article) => (
                    <Link
                      key={article.slug}
                      href={`/help/${article.slug}`}
                      className="block rounded-lg px-3 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {article.question}
                    </Link>
                  ))}
                  {!matches.length && (
                    <p className="px-3 py-4 text-sm text-muted-foreground">
                      No article matched. Search the Help Center for more
                      topics.
                    </p>
                  )}
                </nav>
              </div>
              <div
                className={`grid ${supportEnabled ? "grid-cols-2" : "grid-cols-1"} gap-2 border-t p-3`}
              >
                <Button asChild variant="outline">
                  <Link href="/help">
                    <BookOpen className="size-4" />
                    Visit Help Center
                  </Link>
                </Button>
                {supportEnabled && (
                  <Button variant="outline" onClick={() => void startTicket()}>
                    <Send className="size-4" />
                    Contact support
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      )}
      <Button
        aria-label={open ? "Close help" : "Open WorkSync help"}
        className="ml-auto flex rounded-full shadow-lg"
        onClick={() => setOpen((value) => !value)}
      >
        <HelpCircle />
        <span className="hidden sm:inline">Help</span>
      </Button>
    </div>
  );
}
