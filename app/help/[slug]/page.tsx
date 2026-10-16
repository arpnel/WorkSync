import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { HELP_ARTICLES, getHelpArticle } from "@/lib/help/articles";

export function generateStaticParams() {
  return HELP_ARTICLES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  return article ? { title: `${article.title} | WorkSync Help`, description: article.description } : {};
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getHelpArticle(slug)) notFound();
  redirect(`/help?article=${encodeURIComponent(slug)}`);
}
