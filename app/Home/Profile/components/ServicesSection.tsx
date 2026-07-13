"use client"

import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2 } from "lucide-react"

import type { Service } from "../types/profile"

import { getServices, deleteService } from "../Services/profileservice"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface ServicesSectionProps {
  userId: string
}

export default function ServicesSection({
  userId,
}: ServicesSectionProps) {
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)

  const loadServices = async () => {
    setLoading(true)

    const data = await getServices(userId)

    setServices(data)

    setLoading(false)
  }

  useEffect(() => {
    loadServices()
  }, [userId])

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm(
      "Delete this service?"
    )

    if (!confirmed) return

    const success = await deleteService(id)

    if (success) {
      loadServices()
    }
  }

  return (
    <Card className="rounded-2xl shadow-sm">

      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-xl font-semibold">
          Services
        </CardTitle>

        <Button>

          <Plus className="mr-2 h-4 w-4" />

          Add Service

        </Button>

      </CardHeader>

      <CardContent>

        {loading ? (

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, index) => (

              <div
                key={index}
                className="animate-pulse rounded-xl border p-6"
              >

                <div className="mb-4 h-5 w-2/3 rounded bg-muted" />

                <div className="mb-2 h-4 rounded bg-muted" />

                <div className="mb-2 h-4 rounded bg-muted" />

                <div className="mt-6 h-8 w-24 rounded bg-muted" />

              </div>

            ))}

          </div>

        ) : services.length === 0 ? (

          <div className="rounded-xl border border-dashed py-12 text-center">
            <p className="text-lg font-medium">
              No services available
            </p>

            <p className="mt-2 text-sm text-muted-foreground">
              Create your first service to start receiving orders.
            </p>

            <Button className="mt-6">

              <Plus className="mr-2 h-4 w-4" />

              Add First Service

            </Button>

          </div>

        ) : (

          <div className="grid gap-6 md:grid-cols-2">

            {services.map((service) => (

              <Card
                key={service.id}
                className="transition hover:shadow-md"
              >

                <CardContent className="space-y-3 p-5">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {service.name}
                      </h3>

                      <p className="mt-2 text-sm text-muted-foreground">
                        {service.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <p className="text-lg font-bold text-primary">
                        ${service.price}
                      </p>

                      <div className="flex gap-2">
                        <Button size="icon" variant="outline">
                          <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                          size="icon"
                          variant="destructive"
                          onClick={() => handleDelete(service.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="icon" variant="outline">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() =>
                          handleDelete(service.id)
                        }
                      >

                        <Trash2 className="h-4 w-4" />

                      </Button>

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