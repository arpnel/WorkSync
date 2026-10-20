"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getMyMarketplaceListings,
  getMarketplaceListingsByClient,
  type MarketplaceItem,
} from "@/services/marketplace/MarketplaceServices";
import { ListingEditDialog } from "@/components/listings/ListingEditDialog";
import { getPublicIdentities } from "@/services/profile/publicIdentityService";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ProfileListings({ editable, userId }: {
  editable: boolean;
  userId?: string;
}) {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [editing, setEditing] = useState<MarketplaceItem | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      if (!userId) {
        setItems(await getMyMarketplaceListings());
      } else {
        const identities = await getPublicIdentities({ userIds: [userId] });
        const client = identities.clients.find((row) => row.user_id === userId);
        setItems(client ? await getMarketplaceListingsByClient(client.client_id) : []);
      }
      setError("");
    } catch {
      setError(
        userId
          ? "Unable to load project listings."
          : "Unable to load your project listings.",
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{editable ? "My listings" : "Project listings"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading listings…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {!loading && !error && !items.length && (
          <p className="text-sm text-muted-foreground">
            No project listings yet.
          </p>
        )}
        {items.map((item) => (
          <div
            key={item.listing_type === "job" ? item.job_id : item.service_id}
            className="rounded-lg border p-4"
          >
            <h3 className="font-medium">{item.title}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {item.description}
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={
                    item.listing_type === "job"
                      ? `/home/marketplace/jobs/${item.job_id}`
                      : `/home/marketplace/${item.service_id}`
                  }
                >
                  View listing
                </Link>
              </Button>
              {editable && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(item)}
                >
                  Edit listing
                </Button>
              )}
            </div>
          </div>
        ))}
        {editing && (
          <ListingEditDialog
            listing={editing}
            onClose={() => setEditing(null)}
            onSaved={load}
          />
        )}
      </CardContent>
    </Card>
  );
}
