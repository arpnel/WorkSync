"use client"

import { useEffect, useState } from "react"
import { Star } from "lucide-react"

import type { Review } from "../types/profile"

import { getReviews } from "../Services/profileservice"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface ReviewsSectionProps {
  userId: string
}

export default function ReviewsSection({
  userId,
}: ReviewsSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReviews()
  }, [userId])

  const loadReviews = async () => {
    setLoading(true)
    const data = await getReviews(userId)
    setReviews(data)
    setLoading(false)
  }

  return (
    <Card className="rounded-2xl shadow-sm">

      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-semibold">
          Reviews
        </CardTitle>
      </CardHeader>

      <CardContent>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-xl border p-6">
                <div className="mb-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-muted"/>
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

          <div className="rounded-xl border border-dashed py-12 text-center">

            <h3 className="text-lg font-semibold">
              No reviews yet
            </h3>

            <p className="mt-2 text-sm text-muted-foreground">
              Reviews from completed projects will appear here.
            </p>

          </div>

        ) : (

          <div className="space-y-4">
            {reviews.map((review) => (

              <Card
                key={review.id}
                className="rounded-xl border shadow-none"
              >

                <CardContent className="p-5">

                  <div className="flex items-start gap-4">

                    <Avatar className="h-12 w-12">

                      <AvatarImage
                        src={review.client_avatar ?? undefined}
                      />

                      <AvatarFallback>

                        {review.client_name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}

                      </AvatarFallback>

                    </Avatar>

                    <div className="flex-1">

                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">

                        <div>

                          <h4 className="font-semibold">

                            {review.client_name}

                          </h4>

                          <p className="text-sm text-muted-foreground">

                            {review.project_title}

                          </p>

                        </div>

                        <div className="flex items-center gap-1">

                          {Array.from({ length: 5 }).map((_, index) => (

                            <Star
                              key={index}
                              className={`h-4 w-4 ${index < review.rating
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-muted"
                                }`}
                            />

                          ))}

                        </div>

                      </div>

                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {review.text}

                      </p>

                      <p className="mt-4 text-xs text-muted-foreground">

                        {new Date(review.created_at).toLocaleDateString()}

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
  )
}