"use client";
import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getProjects } from "@/services/project/projectService";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
const record = (value: unknown): Record<string, unknown> => {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
};
export default function Page() {
  const [contacts, setContacts] = useState<
    { id: string; name: string; count: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const orders = await getProjects();
        const counts = new Map<string, number>();
        for (const order of orders) {
          const client = String(record(order.client_profile).user_id ?? ""),
            freelancer = String(record(order.freelancer_profile).user_id ?? "");
          if (
            client !== order.current_user_id &&
            freelancer !== order.current_user_id
          )
            continue;
          const other = client === order.current_user_id ? freelancer : client;
          if (other) counts.set(other, (counts.get(other) ?? 0) + 1);
        }
        if (!counts.size) {
          if (alive) setContacts([]);
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id,display_name,first_name,last_name")
          .in("user_id", [...counts.keys()]);
        if (error) throw error;
        if (alive)
          setContacts(
            (data ?? []).map((row) => ({
              id: row.user_id,
              name:
                row.display_name ||
                [row.first_name, row.last_name].filter(Boolean).join(" ") ||
                "Project contact",
              count: counts.get(row.user_id) ?? 0,
            })),
          );
      } catch (cause) {
        if (alive)
          setError(
            cause instanceof Error ? cause.message : "Unable to load contacts.",
          );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Clients
        </h1>
        <p className="text-sm text-muted-foreground">Your project contacts.</p>
      </div>
      <Input
        aria-label="Search contacts"
        placeholder="Search project contacts…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <ContentSkeleton label="Loading contacts" variant="contacts" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {contacts
            .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
            .map((c) => (
              <Card key={c.id}>
                <CardHeader>
                  <CardTitle className="text-base">{c.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>{c.count} shared requests / projects</p>
                  <Link
                    className="block underline"
                    href={`/home/profile/${c.id}`}
                  >
                    View profile
                  </Link>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
      {!loading && !error && !contacts.length && (
        <p className="text-sm text-muted-foreground">
          People you work with will appear here.
        </p>
      )}
    </div>
  );
}
