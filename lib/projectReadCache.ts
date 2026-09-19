"use client";

import { supabase } from "@/lib/supabaseClient";
import { ReadCache } from "./readCache";

const cache = new ReadCache();
let account: string | null = null;
let generation = 0;
let subscribed = false;

function setAccount(next: string | null) {
  if (account !== next) {
    account = next;
    ++generation;
    cache.clear();
  }
}

export function clearProjectReadCache() {
  cache.clear();
}

export async function readProjectCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  force = false,
): Promise<T> {
  // Only local session state is used to partition cached display data. Database
  // reads and every mutation retain their existing server authorization checks.
  if (!subscribed) {
    subscribed = true;
    supabase.auth.onAuthStateChange((_event, session) =>
      setAccount(session?.user.id ?? null),
    );
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id ?? null;
  setAccount(userId);
  if (!userId) throw new Error("Sign in to view projects.");
  const currentGeneration = generation;
  const value = await cache.read(`${userId}:${key}`, fetcher, force);
  if (currentGeneration !== generation)
    throw new Error("Your account changed. Reload projects to continue.");
  return value;
}
