"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getMyMarketplaceListings,
  type MarketplaceItem,
} from "@/services/marketplace/MarketplaceServices";
import { ListingEditDialog } from "@/components/listings/ListingEditDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ProfileListings({ editable }: { editable: boolean }) {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [editing, setEditing] = useState<MarketplaceItem | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      setItems(await getMyMarketplaceListings());
      setError("");
    } catch {
      setError("Unable to load your project listings.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Project listings</CardTitle>
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
