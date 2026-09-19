"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";

import type { PortfolioProject } from "../../types/profile/profile";

import {
  getPortfolioProjects,
  deletePortfolioProject,
} from "../../services/profile/profileservice";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PortfolioEditor from "./PortfolioEditor";

interface PortfolioSectionProps {
  userId: string;
  isOwner?: boolean;
}

export default function PortfolioSection({
  userId,
  isOwner = true,
}: PortfolioSectionProps) {
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<PortfolioProject | null | undefined>();
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);

    setError("");
    try {
      setProjects(await getPortfolioProjects(userId));
    } catch {
      setError("Unable to load portfolio projects. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Delete this portfolio project?");

    if (!confirmed) return;

    setDeleting(id);
    setError("");
    try {
      if (!(await deletePortfolioProject(id))) throw new Error();
      await loadProjects();
    } catch {
      setError("Unable to delete this project. Please try again.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-xl font-semibold">Portfolio</CardTitle>

        {isOwner && (
          <Button onClick={() => setEditing(null)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Project
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-center justify-between gap-3 text-sm text-destructive"
          >
            {error}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadProjects()}
            >
              Retry
            </Button>
          </div>
        )}
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="motion-safe:animate-pulse overflow-hidden rounded-xl border"
              >
                <div className="aspect-[16/10] bg-muted" />

                <div className="space-y-3 p-5">
                  <div className="h-5 w-2/3 rounded bg-muted" />
                  <div className="h-4 rounded bg-muted" />
                  <div className="h-4 w-3/4 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : error && projects.length === 0 ? null : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed py-12 text-center">
            <p className="text-lg font-medium">No portfolio projects yet</p>

            <p className="mt-2 text-sm text-muted-foreground">
              {isOwner
                ? "Showcase your best work to attract clients."
                : "This freelancer has not added portfolio projects yet."}
            </p>

            {isOwner && (
              <Button className="mt-6" onClick={() => setEditing(null)}>
                <Plus className="mr-2 h-4 w-4" />
                Add First Project
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.portfolio_id}
                className="overflow-hidden rounded-xl transition hover:shadow-md"
              >
                <div className="relative aspect-[16/10] bg-muted">
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No Image
                  </div>
                </div>

                <CardContent className="space-y-3 p-5">
                  <div>
                    <h3 className="text-lg font-semibold">{project.title}</h3>

                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                      {project.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    {project.project_url &&
                    /^https?:\/\//i.test(project.project_url) ? (
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={project.project_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View
                        </a>
                      </Button>
                    ) : (
                      <div />
                    )}

                    {isOwner && (
                      <div className="flex gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          aria-label={`Edit ${project.title}`}
                          onClick={() => setEditing(project)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          aria-label={`Delete ${project.title}`}
                          disabled={deleting !== null}
                          onClick={() => handleDelete(project.portfolio_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
      {editing !== undefined && (
        <PortfolioEditor
          project={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void loadProjects();
          }}
        />
      )}
    </Card>
  );
}
