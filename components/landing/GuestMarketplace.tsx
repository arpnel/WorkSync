"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SigninDialog } from "@/components/auth/login/SigninDialog";
type Service = {
  service_id: string;
  title: string;
  description: string;
  price: number;
  pricing_mode: string;
  delivery_time_days: number;
  revisions_count: number;
  category_id: string;
};
const PAGE_SIZE = 12;
export default function GuestMarketplace() {
  const [rows, setRows] = useState<Service[]>([]),
    [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [sort, setSort] = useState("latest"),
    [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [more, setMore] = useState(false),
    [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Service | null>(null),
    [auth, setAuth] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase
      .from("job_categories")
      .select("id,name")
      .order("name")
      .then(
        ({ data }) => {
          if (active) setCategories(data ?? []);
        },
        () => {},
      );
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        let request = supabase
          .from("services")
          .select(
            "service_id,title,description,price,pricing_mode,delivery_time_days,revisions_count,category_id",
          )
          .eq("status", "Active")
          .eq("is_archived", false);
        if (search.trim())
          request = request.ilike(
            "title",
            "%" + search.trim().replace(/[%_]/g, "\\$&") + "%",
          );
        if (category) request = request.eq("category_id", category);
        request = request
          .order(sort === "latest" ? "created_at" : "price", {
            ascending: sort === "low",
          })
          .order("service_id");
        const { data, error } = await request.range(
          page * PAGE_SIZE,
          page * PAGE_SIZE + PAGE_SIZE,
        );
        if (error) throw error;
        if (active) {
          setRows((data ?? []).slice(0, PAGE_SIZE));
          setMore((data?.length ?? 0) > PAGE_SIZE);
        }
      } catch {
        if (active) {
          setRows([]);
          setMore(false);
          setError("Unable to load public services. Please try again shortly.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, category, sort, page, retry]);
  return (
    <div className="mt-5 space-y-5">
      <p className="text-sm text-muted-foreground">
        Browse services and read the details as a guest. An account is only
        needed to contact freelancers or request work.
      </p>
      <div className="flex flex-wrap gap-3">
        <Input
          aria-label="Search service titles"
          placeholder="Search services"
          className="min-w-0 flex-1 basis-52"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Service category"
          className="max-w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort services"
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(0);
          }}
        >
          <option value="latest">Newest</option>
          <option value="low">Price: low to high</option>
          <option value="high">Price: high to low</option>
        </select>
      </div>
      {loading ? (
        <p role="status" className="py-10 text-center text-muted-foreground">
          Loading services...
        </p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={() => setRetry(retry + 1)}>
            Retry
          </Button>
        </div>
      ) : !rows.length ? (
        <p className="py-10 text-center text-muted-foreground">
          No public services match this selection.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <button
              key={row.service_id}
              onClick={() => setSelected(row)}
              className="flex flex-col rounded-xl border bg-background p-5 text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <p className="text-xs text-muted-foreground">
                {categories.find((c) => c.id === row.category_id)?.name ??
                  "Freelance service"}
              </p>
              <h3 className="mt-2 font-semibold">{row.title}</h3>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                {row.description}
              </p>
              <p className="mt-auto pt-5 text-sm font-semibold">
                PHP {row.price.toLocaleString()}{" "}
                <span className="font-normal text-muted-foreground">
                  {row.pricing_mode?.replaceAll("_", " ")}
                </span>
              </p>
              <span className="mt-3 text-xs text-primary">
                View service details
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={loading || page === 0}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">Page {page + 1}</span>
        <Button
          variant="outline"
          disabled={loading || !more}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogTitle>{selected?.title}</DialogTitle>
          <DialogDescription>Service details</DialogDescription>
          <p className="whitespace-pre-wrap break-words text-sm leading-7">
            {selected?.description}
          </p>
          <dl className="grid grid-cols-2 gap-4 rounded-xl bg-muted p-4 text-sm">
            <div>
              <dt>Price</dt>
              <dd className="font-semibold">
                PHP {selected?.price.toLocaleString()}{" "}
                {selected?.pricing_mode?.replaceAll("_", " ")}
              </dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>{selected?.delivery_time_days} days</dd>
            </div>
            <div>
              <dt>Revisions</dt>
              <dd>{selected?.revisions_count}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Sign in to continue with a service request or conversation.
          </p>
          <Button
            onClick={() => {
              setSelected(null);
              setAuth(true);
            }}
          >
            Sign in to contact or request work
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={auth} onOpenChange={setAuth}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-sm">
          <DialogTitle className="sr-only">Sign in to WorkSync</DialogTitle>
          <SigninDialog />
        </DialogContent>
      </Dialog>
    </div>
  );
}
