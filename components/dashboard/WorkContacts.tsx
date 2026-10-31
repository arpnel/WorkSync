"use client";

import ContentSkeleton from "@/components/shared/ContentSkeleton";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getProjects } from "@/services/project/projectService";
import { mapProject } from "@/hooks/project/useProjects";
import type { Project } from "@/components/project/ProjectCard";
import { ProjectCard } from "@/components/project/ProjectCard";
import { ProjectTabs, type FilterType } from "@/components/project/ProjectTabs";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getCurrentUserRole } from "@/services/marketplace/AccountServices";

const record = (value: unknown): Record<string, unknown> => {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
};

export default function WorkContacts() {
  const [contacts, setContacts] = useState<
    { id: string; name: string; avatarUrl: string | null; count: number }[]
  >([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [role, setRole] = useState<"client" | "freelancer" | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [statusFilter, setStatusFilter] = useState<FilterType>("All");

  useEffect(() => {
    let alive = true;
    const updateRole = (next?: "client" | "freelancer") => {
      if (next) setRole(next);
      else
        void getCurrentUserRole()
          .then((value) => {
            if (alive) setRole(value);
          })
          .catch(() => {
            if (alive) setRole(null);
          });
    };
    updateRole();
    const changed = (event: Event) => {
      setSelectedContactId(null);
      setStatusFilter("All");
      updateRole(
        (event as CustomEvent<{ role?: "client" | "freelancer" }>).detail?.role,
      );
    };
    window.addEventListener("account-role-changed", changed);
    return () => {
      alive = false;
      window.removeEventListener("account-role-changed", changed);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const orders = await getProjects();
        const mappedProjects = orders.map(mapProject);
        if (alive) setProjects(mappedProjects);
        const counts = new Map<string, number>();
        for (const order of orders) {
          const client = String(record(order.client_profile).user_id ?? "");
          const freelancer = String(
            record(order.freelancer_profile).user_id ?? "",
          );
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
          .select("user_id,display_name,first_name,last_name,avatar_url")
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
              avatarUrl: row.avatar_url ?? null,
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
  }, [role]);

  const selectedContact = contacts.find(
    (contact) => contact.id === selectedContactId,
  );
  const contactProjects = useMemo(
    () =>
      projects.filter(
        (project) => project.counterpartyUserId === selectedContactId,
      ),
    [projects, selectedContactId],
  );
  const filteredProjects = useMemo(
    () =>
      statusFilter === "All"
        ? contactProjects
        : contactProjects.filter((project) => project.status === statusFilter),
    [contactProjects, statusFilter],
  );

  return (
    <div className="space-y-5">
      {selectedContact ? (
        <div className="space-y-5">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setSelectedContactId(null);
                setStatusFilter("All");
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to {role === "client" ? "clients" : "freelancers"}
            </button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {selectedContact.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Shared jobs and projects with their current status.
              </p>
            </div>
          </div>

          <ProjectTabs
            activeFilter={statusFilter}
            onFilterChange={setStatusFilter}
          />

          {loading ? (
            <ContentSkeleton
              label="Loading shared projects"
              variant="projects"
            />
          ) : error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : filteredProjects.length ? (
            <div className="space-y-3">
              {filteredProjects.map((project) => (
                <ProjectCard key={project.orderId} project={project} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No{" "}
              {statusFilter === "All"
                ? "shared projects"
                : statusFilter.toLowerCase() + " projects"}{" "}
              for this contact.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {role === "client" ? "Clients" : "Freelancers"}
            </h1>
            <p className="text-sm text-muted-foreground">
              People you have worked with.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {loading ? (
            <ContentSkeleton label="Loading contacts" variant="contacts" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {contacts.map((contact) => (
                  <Card
                    key={contact.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedContactId(contact.id);
                      setStatusFilter("All");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedContactId(contact.id);
                        setStatusFilter("All");
                      }
                    }}
                    className="gap-0 cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-3 text-base">
                        <Link
                          href={`/home/profile/${contact.id}`}
                          aria-label={`View ${contact.name}'s profile`}
                          onClick={(event) => event.stopPropagation()}
                          className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          <Avatar className="size-10">
                            <AvatarImage
                              src={contact.avatarUrl ?? undefined}
                              alt={contact.name}
                            />
                            <AvatarFallback>
                              {contact.name
                                .split(" ")
                                .map((part) => part[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                        <Link
                          href={`/home/profile/${contact.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="truncate rounded-sm hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          {contact.name}
                        </Link>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-1 pb-4 text-left text-sm leading-6 text-muted-foreground">
                      {contact.count} shared jobs / projects
                    </CardContent>
                  </Card>
              ))}
            </div>
          )}
          {!loading && !error && !contacts.length && (
            <p className="py-8 text-center text-lg font-medium text-muted-foreground">
              {role === "client"
                ? "Your list of clients will appear here."
                : "Your list of freelancers will appear here."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
