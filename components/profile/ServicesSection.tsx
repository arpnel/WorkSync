"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";

import type { Service } from "../../types/profile/profile";
import { getServices } from "../../services/profile/profileservice";
import { ServiceCreateDialogLauncher } from "./ServiceCreateDialogLauncher";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface ServicesSectionProps {
  userId: string;
}

function getDisplayStorageKey(userId: string) {
  return `worksync:profile-services:${userId}`;
}

export default function ServicesSection({ userId }: ServicesSectionProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [displayedIds, setDisplayedIds] = useState<string[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const data = await getServices(userId);
      setServices(data);

      const storedIds = window.localStorage.getItem(
        getDisplayStorageKey(userId),
      );

      if (!storedIds) {
        setDisplayedIds(data.map((service) => service.id));
        return;
      }

      const parsedIds: unknown = JSON.parse(storedIds);
      const validServiceIds = new Set(data.map((service) => service.id));

      setDisplayedIds(
        Array.isArray(parsedIds)
          ? parsedIds.filter(
              (id): id is string =>
                typeof id === "string" && validServiceIds.has(id),
            )
          : data.map((service) => service.id),
      );
    } catch (error) {
      console.error("Failed to load profile services:", error);
      setLoadError("Unable to load services. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  const displayedServices = useMemo(() => {
    const selectedIds = new Set(displayedIds);
    return services.filter((service) => selectedIds.has(service.id));
  }, [displayedIds, services]);

  const setServiceDisplayed = (serviceId: string, displayed: boolean) => {
    setDisplayedIds((current) => {
      const next = displayed
        ? [...new Set([...current, serviceId])]
        : current.filter((id) => id !== serviceId);

      window.localStorage.setItem(
        getDisplayStorageKey(userId),
        JSON.stringify(next),
      );

      return next;
    });
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-4">
        <CardTitle className="text-xl font-semibold">Services</CardTitle>

        <div className="flex flex-wrap justify-end gap-2">
          {services.length > 0 && (
            <Button variant="outline" onClick={() => setManageOpen(true)}>
              <Settings2 className="h-4 w-4" />
              Manage display
            </Button>
          )}

          <ServiceCreateDialogLauncher onCreated={() => loadServices()} />
        </div>
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
        ) : loadError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => void loadServices()}
            >
              Try again
            </Button>
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-xl border border-dashed py-12 text-center">
            <p className="text-lg font-medium">No services available</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Create your first service to start receiving orders.
            </p>
            <div className="mt-5">
              <ServiceCreateDialogLauncher onCreated={() => loadServices()} />
            </div>
          </div>
        ) : displayedServices.length === 0 ? (
          <div className="rounded-xl border border-dashed py-12 text-center">
            <p className="text-lg font-medium">No services selected</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose which existing services appear on your profile.
            </p>
            <Button
              className="mt-5"
              variant="outline"
              onClick={() => setManageOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
              Select services
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {displayedServices.map((service) => (
              <Card
                key={service.id}
                className="overflow-hidden rounded-2xl transition hover:shadow-md"
              >
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
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={service.avatar_url ?? undefined} />
                      <AvatarFallback>
                        {(service.display_name?.[0] ?? "U").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <p className="truncate text-sm font-semibold">
                      {service.display_name ?? "Freelancer"}
                    </p>
                  </div>

                  <h3 className="line-clamp-2 text-sm font-semibold">
                    {service.title}
                  </h3>

                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px]">
                      {service.category}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
                      {service.service_type}
                    </span>
                  </div>

                  <div className="border-t pt-3">
                    <p className="text-[10px] uppercase text-muted-foreground">
                      Starting From
                    </p>
                    <p className="text-xl font-bold text-primary">
                      {new Intl.NumberFormat("en-PH", {
                        style: "currency",
                        currency: "PHP",
                        maximumFractionDigits: 2,
                      }).format(service.price)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage profile services</DialogTitle>
            <DialogDescription>
              Select the existing services you want displayed on your profile.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {services.map((service) => {
              const checkboxId = `profile-service-${service.id}`;
              const checked = displayedIds.includes(service.id);

              return (
                <Label
                  key={service.id}
                  htmlFor={checkboxId}
                  className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/50"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={checked}
                    onCheckedChange={(value) =>
                      setServiceDisplayed(service.id, value === true)
                    }
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {service.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {service.category}
                    </span>
                  </span>

                  <span className="text-sm font-semibold">
                    {new Intl.NumberFormat("en-PH", {
                      style: "currency",
                      currency: "PHP",
                      maximumFractionDigits: 2,
                    }).format(service.price)}
                  </span>
                </Label>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
