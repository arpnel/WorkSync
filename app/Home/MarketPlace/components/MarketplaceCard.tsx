"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button as CardButton } from "@/components/ui/CardButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Rating } from "@/components/reui/rating";

import type { Freelancer } from "./types";

interface MarketplaceCardProps {
  freelancer: Freelancer;
  onClick?: () => void;
}

export default function MarketplaceCard({
  freelancer,
  onClick,
}: MarketplaceCardProps) {
  return (
    <CardButton onClick={onClick}>
      <Card className="w-full transition-all hover:shadow-md hover:-translate-y-1">
        <CardHeader className="flex flex-row items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage
              src={freelancer.avatar}
              alt={freelancer.name}
            />
            <AvatarFallback>
              {freelancer.name.charAt(0)}
            </AvatarFallback>
          </Avatar>

          <div className="flex flex-col">
            <CardTitle className="text-base">
              {freelancer.name}
            </CardTitle>

            <p className="text-sm text-muted-foreground">
              {freelancer.job}
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <img
            src={freelancer.logo}
            alt={freelancer.job}
            className="h-14 w-14 rounded-md object-cover"
          />

          <div className="space-y-1">
            <p className="text-xl font-bold">
              ₱{freelancer.rate.toLocaleString()}
            </p>

            <Rating
              rating={4.8}
              showValue
            />
          </div>
        </CardContent>
      </Card>
    </CardButton>
  );
}