"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import type { Service } from "../../types/profile/profile";

import {
  getServices,
  deleteService,
} from "../../services/profile/profileservice";

import { ServiceCreateDialogLauncher } from "./ServiceCreateDialogLauncher";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ServicesSectionProps {
  userId: string;
}

export default function ServicesSection({ userId }: ServicesSectionProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const loadServices = async () => {
    setLoading(true);

    try {
      const data = await getServices(userId);
      setServices(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, [userId]);

  const handleDelete = async (id: string) => {
    if (!id) {
      console.error("Cannot delete service: service ID is missing.");
      return;
    }

    const confirmed = window.confirm("Delete this service?");

    if (!confirmed) return;

    const success = await deleteService(id);

    if (success) {
      await loadServices();
    }
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-xl font-semibold">Services</CardTitle>

        <ServiceCreateDialogLauncher />
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse overflow-hidden rounded-2xl border"
              >
                <div className="h-44 bg-muted" />

                <div className="space-y-3 p-4">
                  <div className="h-4 w-1/2 rounded bg-muted" />
                  <div className="h-4 rounded bg-muted" />
                  <div className="h-4 w-2/3 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-xl border border-dashed py-12 text-center">
            <p className="text-lg font-medium">No services available</p>

            <p className="mt-2 text-sm text-muted-foreground">
              Create your first service to start receiving orders.
            </p>

            <ServiceCreateDialogLauncher />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service, index) => (
              <Card
                key={service.id ?? `service-${index}`}
                className="overflow-hidden rounded-2xl transition hover:shadow-md"
              >
                {/* Image */}

                <div className="flex h-44 items-center justify-center overflow-hidden bg-muted">
                  {service.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={service.cover_image_url}
                      alt={service.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Service Thumbnail
                    </span>
                  )}
                </div>

                <CardContent className="space-y-4 p-4">
                  {/* Freelancer */}

                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={service.avatar_url ?? undefined} />

                      <AvatarFallback>
                        {service.display_name?.[0] ?? "U"}
                      </AvatarFallback>
                    </Avatar>

                    <div>
                      <p className="text-sm font-semibold">
                        {service.display_name ?? "Freelancer"}
                      </p>

                    </div>
                  </div>

                  {/* Title */}

                  <h3 className="line-clamp-2 text-sm font-semibold">
                    {service.title}
                  </h3>

                  {/* Category + Type */}

                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px]">
                      {service.category ?? "Category"}
                    </span>

                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
                      {service.service_type}
                    </span>
                  </div>

                  {/* Footer */}

                  <div className="flex items-end justify-between border-t pt-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Starting From
                      </p>

                      <p className="text-xl font-bold text-primary">
                        ₱{service.price}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button size="icon" variant="outline">
                        <Pencil className="h-4 w-4" />
                      </Button>

                      <Button
                        size="icon"
                        variant="destructive"
                        disabled={!service.id}
                        onClick={() => {
                          if (!service.id) {
                            console.error(
                              "Cannot delete service: service ID is missing.",
                            );
                            return;
                          }

                          handleDelete(service.id);
                        }}
                      >
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
  );
}
