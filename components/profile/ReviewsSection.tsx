"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";

import type { Review } from "../../types/profile/profile";
import { getReviews } from "../../services/profile/profileservice";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";

interface ReviewsSectionProps {
  userId: string;
}

export default function ReviewsSection({
  userId,
}: ReviewsSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadReviews() {
      try {
        setLoading(true);

        const data = await getReviews(userId);

        if (mounted) {
          setReviews(data);
        }
      } catch (error) {
        console.error("Failed to load reviews:", error);

        if (mounted) {
          setReviews([]);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadReviews();

    return () => {
      mounted = false;
    };
  }, [userId]);

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-semibold">
          Reviews
        </CardTitle>
      </CardHeader>

      <CardContent>
        {/* =====================================================
            LOADING
        ===================================================== */}

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-xl border p-6"
              >
                <div className="mb-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-muted" />

                  <div className="flex-1">
                    <div className="mb-2 h-4 w-40 rounded bg-muted" />
                    <div className="h-3 w-28 rounded bg-muted" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="h-4 rounded bg-muted" />
                  <div className="h-4 rounded bg-muted" />
                  <div className="h-4 w-2/3 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : reviews.length === 0 ? (
          /* =====================================================
             EMPTY
          ===================================================== */

          <div className="rounded-xl border border-dashed py-12 text-center">
            <h3 className="text-lg font-semibold">
              No reviews yet
            </h3>

            <p className="mt-2 text-sm text-muted-foreground">
              Reviews from completed projects will appear here.
            </p>
          </div>
        ) : (
          /* =====================================================
             REVIEWS
          ===================================================== */

          <div className="space-y-4">
            {reviews.map((review, index) => (
              <Card
                key={index}
                className="rounded-xl border shadow-none"
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    {/* =================================================
                        AVATAR
                    ================================================= */}

                    <Avatar className="h-12 w-12 shrink-0">
                      <AvatarFallback>
                        C
                      </AvatarFallback>
                    </Avatar>

                    {/* =================================================
                        REVIEW
                    ================================================= */}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="font-semibold">
                            Client
                          </h4>

                          <p className="text-sm text-muted-foreground">
                            Review
                          </p>
                        </div>

                        {/* =================================================
                            RATING
                        ================================================= */}

                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map(
                            (_, starIndex) => (
                              <Star
                                key={starIndex}
                                className={`h-4 w-4 ${
                                  starIndex < review.rating
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-muted"
                                }`}
                              />
                            ),
                          )}
                        </div>
                      </div>

                      {/* =================================================
                          DATE
                      ================================================= */}

                      <p className="mt-4 text-xs text-muted-foreground">
                        {new Date(
                          review.created_at,
                        ).toLocaleDateString()}
                      </p>
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