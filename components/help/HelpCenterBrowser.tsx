"use client";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, FileText, Search } from "lucide-react";
import { HELP_ARTICLES, HELP_CATEGORIES, type HelpArticle } from "@/lib/help/articles";
import { Input } from "@/components/ui/input";

export function HelpCenterBrowser() {
  const [query, setQuery] = useState("");
  const [expandedTopic, setExpandedTopic] = useState<string | null>("Getting Started");
  const [selected, setSelected] = useState<HelpArticle | null>(() => HELP_ARTICLES.find((article) => article.category === "Getting Started") ?? null);
  const groupedResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    return HELP_CATEGORIES.map((topic) => ({
      topic,
      articles: HELP_ARTICLES.filter((article) => article.category === topic && (!term || `${article.question} ${article.title} ${article.category}`.toLowerCase().includes(term))),
    })).filter((group) => group.articles.length > 0);
  }, [query]);

  useEffect(() => {
    const requestedSlug = new URLSearchParams(window.location.search).get("article");
    const requestedArticle = HELP_ARTICLES.find((article) => article.slug === requestedSlug);
    if (requestedArticle) {
      setSelected(requestedArticle);
      setExpandedTopic(requestedArticle.category);
    }
  }, []);

  return <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
    <header className="border-b px-5 py-4 sm:px-7 sm:py-4">
      <div><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Help Center</h1><p className="mt-0.5 text-sm text-muted-foreground">Guides and answers for using WorkSync.</p></div>
    </header>

    <div className="grid lg:min-h-[42rem] lg:grid-cols-[19rem_minmax(0,1fr)]">
      <aside aria-label="Help documents" className="border-b bg-muted/15 lg:border-b-0 lg:border-r">
        <div className="px-4 pb-3 pt-4">
          <label className="relative block">
            <span className="sr-only">Search help guides</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
            <Input id="help-search" className="h-10 rounded-lg border-muted bg-background pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guides"/>
          </label>
        </div>
        <nav aria-label="Help topics and guides" className="max-h-80 overflow-y-auto px-3 pb-4 lg:max-h-[35rem]">
          {groupedResults.length ? <ul className="space-y-1">{groupedResults.map(({ topic, articles }) => {
            const isExpanded = expandedTopic === topic;
            return <li key={topic}>
              <button type="button" aria-expanded={isExpanded} onClick={() => { if (isExpanded) setExpandedTopic(null); else { setExpandedTopic(topic); setSelected(articles[0]); } }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.category === topic ? "text-primary" : ""}`}>
                <span className="min-w-0 flex-1 truncate">{topic}</span><span className="text-xs tabular-nums text-muted-foreground">{articles.length}</span><ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}/>
              </button>
              {isExpanded && <ul className="ml-3 space-y-0.5 border-l pl-2">{articles.map((article) => <li key={article.slug}>
                <button type="button" aria-current={selected?.slug === article.slug ? "page" : undefined} onClick={() => setSelected(article)} className={`group flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.slug === article.slug ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/70 hover:text-foreground"}`}>
                  <FileText className={`mt-0.5 size-4 shrink-0 ${selected?.slug === article.slug ? "text-primary" : "text-muted-foreground/70"}`}/><span className="leading-snug">{article.question}</span>
                </button>
              </li>)}</ul>}
            </li>;
          })}</ul> : <div className="px-3 py-8 text-center"><p className="text-sm font-medium">No guides found</p><p className="mt-1 text-xs text-muted-foreground">Try another search.</p><button type="button" className="mt-3 text-xs font-medium text-primary underline-offset-4 hover:underline" onClick={() => setQuery("")}>Clear search</button></div>}
        </nav>
      </aside>

      <section aria-label="Document reader" className="min-h-[25rem] px-5 py-7 sm:px-8 sm:py-9 lg:px-12 lg:py-11">
        {selected ? <article className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{selected.title}</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">{selected.description}</p>
          <div className="my-7 h-px bg-border/70"/>
          <div className="space-y-8 sm:space-y-9">{selected.sections.map((section) => <section key={section.heading}>
            <h3 className="text-lg font-semibold tracking-tight">{section.heading}</h3>
            {section.paragraphs?.map((paragraph) => <p key={paragraph} className="mt-3 leading-7 text-muted-foreground">{paragraph}</p>)}
            {section.bullets && <ul className="mt-3 list-disc space-y-2 pl-5 leading-7 text-muted-foreground">{section.bullets.map((item) => <li key={item} className="pl-1">{item}</li>)}</ul>}
            {section.steps && <ol className="mt-3 list-decimal space-y-2 pl-5 leading-7 text-muted-foreground">{section.steps.map((item) => <li key={item} className="pl-1">{item}</li>)}</ol>}
          </section>)}</div>
        </article> : <div className="flex min-h-[25rem] flex-col items-center justify-center text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><BookOpen className="size-7"/></div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-primary">Your guide library</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">What can we help with?</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Choose a topic or search the guides. Select a document to read it here.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">{HELP_CATEGORIES.slice(0, 3).map((item) => <button key={item} type="button" onClick={() => { const firstArticle = HELP_ARTICLES.find((article) => article.category === item); if (firstArticle) { setExpandedTopic(item); setSelected(firstArticle); } }} className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary">{item}</button>)}</div>
        </div>}
      </section>
    </div>
  </div>;
}
