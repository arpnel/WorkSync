"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import MarketplaceGrid from "@/components/marketplace/MarketplaceGrid";
import {
  getMarketplaceServices,
  type MarketplaceItem,
  type MarketplaceService,
} from "@/services/marketplace/MarketplaceServices";
import { supabase } from "@/lib/supabaseClient";

interface Props {
  service: MarketplaceService;
  guest: boolean;
  sellerName: string;
}

export default function ServiceRelatedWork({ service, guest, sellerName }: Props) {
  const router = useRouter();
  const [related, setRelated] = useState<MarketplaceItem[]>([]);
  const [fromSeller, setFromSeller] = useState<MarketplaceItem[]>([]);
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [categoryRows, sellerRows] = await Promise.all([
          getMarketplaceServices({
            categoryId: service.category_id,
            listingType: "service",
            sort: "latest",
            guest,
          }),
          service.freelancer_id
            ? getMarketplaceServices({
                freelancerId: service.freelancer_id,
                listingType: "service",
                sort: "latest",
                guest,
              })
            : Promise.resolve([]),
        ]);
        const isOtherService = (item: MarketplaceItem) =>
          item.listing_type === "service" && item.service_id !== service.service_id;
        const categoryServices = categoryRows.filter(isOtherService).slice(0, 4);
        const sellerServices = sellerRows.filter(isOtherService).slice(0, 4);
        const freelancerIds = [...new Set(
          [...categoryServices, ...sellerServices]
            .map((item) => item.freelancer_id)
            .filter((id): id is string => Boolean(id)),
        )];
        const nextRatings = new Map<string, number>();
        if (freelancerIds.length) {
          const { data } = await supabase
            .from("reviews")
            .select("freelancer_id,rating")
            .in("freelancer_id", freelancerIds)
            .eq("reviewer_role", "client");
          const buckets = new Map<string, { total: number; count: number }>();
          for (const row of data ?? []) {
            const bucket = buckets.get(row.freelancer_id) ?? { total: 0, count: 0 };
            bucket.total += Number(row.rating) || 0;
            bucket.count += 1;
            buckets.set(row.freelancer_id, bucket);
          }
          for (const [id, bucket] of buckets) {
            if (bucket.count) nextRatings.set(id, bucket.total / bucket.count);
          }
        }
        if (active) {
          setRelated(categoryServices);
          setFromSeller(sellerServices);
          setRatings(nextRatings);
        }
      } catch {
        if (active) {
          setRelated([]);
          setFromSeller([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [guest, service.category_id, service.freelancer_id, service.service_id]);

  function openService(item: MarketplaceItem) {
    if (item.listing_type !== "service") return;
    router.push(`${guest ? "/marketplace" : "/home/marketplace"}/${item.service_id}`);
  }

  function section(title: string, description: string, listings: MarketplaceItem[], emptyText: string) {
    return (
      <section className="mt-10" aria-label={title}>
        <div className="mb-5">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {loading || listings.length ? (
          <MarketplaceGrid services={listings} ratings={ratings} loading={loading} onCardClick={openService} />
        ) : (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{emptyText}</CardContent></Card>
        )}
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl pb-12">
      {section("Related services", "Explore more services in this category.", related, "There are no other services in this category yet.")}
      {section(`More from ${sellerName}`, "Other services offered by this freelancer.", fromSeller, "This freelancer has no other active services yet.")}
    </div>
  );
}
