"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabaseClient";

import MarketplaceHeader from "./components/MarketplaceHeader";
import MarketplaceFilterSheet from "./components/MarketplaceFilterSheet";
import MarketplaceGrid from "./components/MarketplaceGrid";

import type { Freelancer } from "./components/types";

export default function DashboardPage() {
  const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  // Selected quick service
  const [view, setView] = useState("Video Editing");

  async function loadFreelancers() {
    setLoading(true);

    const { data, error } = await supabase
      .from("Proposals")
      .select("*");

    if (error) {
      console.error(error);
    } else if (data) {
      setFreelancers(data as Freelancer[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadFreelancers();
  }, []);

  // Temporary filtering (replace "category" with your actual column later)
  const filteredFreelancers = freelancers.filter((freelancer) => {
    const matchesSearch =
      search.trim() === "" ||
      JSON.stringify(freelancer)
        .toLowerCase()
        .includes(search.toLowerCase());

    // TODO:
    // Replace `category` with the correct column from your Proposals table.
    // Example:
    // freelancer.service_category === view

    const matchesCategory = true;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="w-full px-6">
      <MarketplaceHeader
        search={search}
        onSearchChange={setSearch}
        onSearch={() => {
          console.log("Search:", search);
          console.log("Category:", view);
        }}
        onFilterClick={() => setFilterOpen(true)}
        onCreateClick={() => {
          console.log("Create clicked");
        }}
        view={view}
        onViewChange={setView}
      />

      <MarketplaceFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
      />

      <div className="mt-4">
        <MarketplaceGrid
          freelancers={filteredFreelancers}
          loading={loading}
          onCardClick={(freelancer) => {
            console.log(freelancer);
          }}
        />
      </div>
    </div>
  );
}