"use client";
import { supabase } from "./supabaseClient";
import { ReadCache } from "./readCache";

const cache = new ReadCache(30_000, 80);
let account: string | null = null;
let generation = 0;
let listening = false;
export function invalidatePageReads() {
  cache.clear();
}
export async function readPageCache<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  if (!listening) {
    listening = true;
    supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user.id ?? null;
      if (
        account !== next ||
        event === "USER_UPDATED" ||
        event === "SIGNED_OUT"
      ) {
        account = next;
        generation++;
        cache.clear();
      }
    });
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const next = data.session?.user.id ?? null;
  if (account !== next) {
    account = next;
    generation++;
    cache.clear();
  }
  const version = generation;
  const result = await cache.read(`${account ?? "public"}:${key}`, fetcher);
  if (generation !== version)
    throw new Error("Your account changed. Please reload.");
  return result;
}
