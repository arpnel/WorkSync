"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MessageSquare,
  Star,
} from "lucide-react";

import {
  getMarketplaceReviews,
  type MarketplaceReview,
} from "@/services/marketplace/MarketplaceReviews";

interface ServiceReviewsProps {
  freelancerId: string | null;
}

function StarRating({
  rating,
  size = "h-4 w-4",
}: {
  rating: number;
  size?: string;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${size} ${
            star <= rating
              ? "fill-primary text-primary"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}

function formatDate(date: string) {
  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ServiceReviews({
  freelancerId,
}: ServiceReviewsProps) {
  const [reviews, setReviews] = useState<MarketplaceReview[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  /* ==========================================================
     LOAD REVIEWS
     
     This component is only used for marketplace services.
     Jobs do not need reviews.
  ========================================================== */

  useEffect(() => {
    async function loadReviews() {
      if (!freelancerId) {
        setReviews([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await getMarketplaceReviews(freelancerId);

        setReviews(data);
      } catch (err) {
        console.error(
          "Failed to load service reviews:",
          err,
        );

        setError("Failed to load reviews.");
        setReviews([]);
      } finally {
        setLoading(false);
      }
    }

    loadReviews();
  }, [freelancerId]);

  /* ==========================================================
     RATING SUMMARY
  ========================================================== */

  const averageRating = useMemo(() => {
    if (reviews.length === 0) {
      return 0;
    }

    const total = reviews.reduce(
      (sum, review) => sum + review.rating,
      0,
    );

    return total / reviews.length;
  }, [reviews]);

  /* ==========================================================
     RATING COUNTS
  ========================================================== */

  const ratingCounts = useMemo(() => {
    return {
      5: reviews.filter(
        (review) => review.rating === 5,
      ).length,

      4: reviews.filter(
        (review) => review.rating === 4,
      ).length,

      3: reviews.filter(
        (review) => review.rating === 3,
      ).length,

      2: reviews.filter(
        (review) => review.rating === 2,
      ).length,

      1: reviews.filter(
        (review) => review.rating === 1,
      ).length,
    };
  }, [reviews]);

  /* ==========================================================
     RATING PERCENTAGE
  ========================================================== */

  const getPercentage = (rating: number) => {
    if (reviews.length === 0) {
      return 0;
    }

    const count =
      ratingCounts[
        rating as keyof typeof ratingCounts
      ];

    return Math.round(
      (count / reviews.length) * 100,
    );
  };

  /* ==========================================================
     NO FREELANCER
     
     This prevents the component from rendering anything when
     there is no freelancer attached to the listing.
  ========================================================== */

  if (!freelancerId) {
    return null;
  }

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <section className="mt-10 border-t pt-8">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <div>
        <h2 className="text-xl font-semibold">
          Reviews
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Feedback from clients who worked with this
          freelancer.
        </p>
      </div>

      {/* =====================================================
          LOADING
      ===================================================== */}

      {loading && (
        <div className="mt-6 space-y-4">
          <div className="h-40 animate-pulse rounded-2xl bg-muted" />

          <div className="h-32 animate-pulse rounded-2xl bg-muted" />

          <div className="h-32 animate-pulse rounded-2xl bg-muted" />
        </div>
      )}

      {/* =====================================================
          ERROR
      ===================================================== */}

      {!loading && error && (
        <div className="mt-6 rounded-2xl border bg-muted/20 px-6 py-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
          </div>

          <h3 className="mt-4 font-semibold">
            Unable to load reviews
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            {error}
          </p>
        </div>
      )}

      {/* =====================================================
          EMPTY
      ===================================================== */}

      {!loading &&
        !error &&
        reviews.length === 0 && (
          <div className="mt-6 rounded-2xl border bg-muted/20 px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            </div>

            <h3 className="mt-4 font-semibold">
              No reviews yet
            </h3>

            <p className="mt-1 text-sm text-muted-foreground">
              This freelancer has not received any
              reviews yet.
            </p>
          </div>
        )}

      {/* =====================================================
          REVIEWS
      ===================================================== */}

      {!loading &&
        !error &&
        reviews.length > 0 && (
          <>
            {/* =================================================
                RATING SUMMARY
            ================================================= */}

            <div className="mt-6 grid gap-6 rounded-2xl border p-5 sm:grid-cols-[180px_1fr] sm:p-6">
              {/* OVERALL */}

              <div className="flex flex-col items-center justify-center border-b pb-5 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-6">
                <span className="text-4xl font-bold tracking-tight">
                  {averageRating.toFixed(1)}
                </span>

                <div className="mt-2">
                  <StarRating
                    rating={Math.round(averageRating)}
                  />
                </div>

                <p className="mt-2 text-sm text-muted-foreground">
                  {reviews.length}{" "}
                  {reviews.length === 1
                    ? "review"
                    : "reviews"}
                </p>
              </div>

              {/* BREAKDOWN */}

              <div className="flex flex-col justify-center gap-2">
                {[5, 4, 3, 2, 1].map((rating) => (
                  <div
                    key={rating}
                    className="flex items-center gap-3"
                  >
                    <div className="flex w-12 shrink-0 items-center gap-1">
                      <span className="text-sm">
                        {rating}
                      </span>

                      <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                    </div>

                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${getPercentage(
                            rating,
                          )}%`,
                        }}
                      />
                    </div>

                    <span className="w-10 text-right text-xs text-muted-foreground">
                      {getPercentage(rating)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* =================================================
                REVIEW LIST
            ================================================= */}

            <div className="mt-6 divide-y rounded-2xl border">
              {reviews.map((review) => {
                const name =
                  review.client.display_name ||
                  "Client";

                return (
                  <article
                    key={review.review_id}
                    className="p-5 sm:p-6"
                  >
                    <div className="flex items-start gap-3">
                      {/* AVATAR */}

                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
                        {review.client.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={
                              review.client.avatar_url
                            }
                            alt={name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-sm font-semibold">
                            {getInitials(name)}
                          </span>
                        )}
                      </div>

                      {/* REVIEWER */}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-semibold">
                            {name}
                          </p>

                          <span className="text-xs text-muted-foreground">
                            {formatDate(
                              review.created_at,
                            )}
                          </span>
                        </div>

                        <div className="mt-1">
                          <StarRating
                            rating={review.rating}
                            size="h-3.5 w-3.5"
                          />
                        </div>
                      </div>
                    </div>

                    {/* COMMENT */}

                    {review.comment ? (
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {review.comment}
                      </p>
                    ) : (
                      <p className="mt-4 text-sm italic text-muted-foreground">
                        No written feedback provided.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
    </section>
  );
}