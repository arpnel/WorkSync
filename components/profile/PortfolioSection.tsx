"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react"

import type { PortfolioProject } from "../../types/profile/profile"

import {getPortfolioProjects, deletePortfolioProject} from "../../services/profile/profileservice"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface PortfolioSectionProps {
  userId: string
}

export default function PortfolioSection({
  userId,
}: PortfolioSectionProps) {

  const [projects, setProjects] = useState<PortfolioProject[]>([])
  const [loading, setLoading] = useState(true)

  const loadProjects = async () => {
    setLoading(true)

    const data = await getPortfolioProjects(userId)

    setProjects(data)

    setLoading(false)
  }

  useEffect(() => {
    loadProjects()
  }, [userId])


  const handleDelete = async (id: string) => {

    const confirmed = window.confirm(
      "Delete this portfolio project?"
    )

    if (!confirmed) return

    const success = await deletePortfolioProject(id)

    if (success) {
      loadProjects()
    }
  }


  return (
    <Card className="rounded-2xl shadow-sm">

      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-xl font-semibold">
          Portfolio
        </CardTitle>

        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Project
        </Button>

      </CardHeader>


      <CardContent>

        {loading ? (

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (

              <div
                key={index}
                className="animate-pulse overflow-hidden rounded-xl border"
              >
                <div className="h-48 bg-muted" />

                <div className="space-y-3 p-5">
                  <div className="h-5 w-2/3 rounded bg-muted" />
                  <div className="h-4 rounded bg-muted" />
                  <div className="h-4 w-3/4 rounded bg-muted" />
                </div>

              </div>

            ))}

          </div>

        ) : projects.length === 0 ? (

          <div className="rounded-xl border border-dashed py-12 text-center">

            <p className="text-lg font-medium">
              No portfolio projects yet
            </p>

            <p className="mt-2 text-sm text-muted-foreground">
              Showcase your best work to attract clients.
            </p>

            <Button className="mt-6">
              <Plus className="mr-2 h-4 w-4" />
              Add First Project
            </Button>

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

                    <h3 className="text-lg font-semibold">
                      {project.title}
                    </h3>

                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                      {project.description}
                    </p>

                  </div>


                  <div className="flex items-center justify-between">

                    {project.project_url ? (
                      <Button size="sm" variant="outline" asChild>
                        <a href={project.project_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View
                        </a>
                      </Button>
                    ) : (<div />)}


                    <div className="flex gap-2">
                      <Button size="icon" variant="outline">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="destructive" onClick={() => handleDelete(project.portfolio_id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                  </div>

                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
