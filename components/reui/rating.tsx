"use client";

import * as React from "react";
import { useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { StarIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const ratingVariants = cva("flex items-center", {
  variants: {
    size: {
      sm: "gap-2",
      default: "gap-2.5",
      lg: "gap-3",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

const starVariants = cva("", {
  variants: {
    size: {
      sm: "w-4 h-4",
      default: "w-5 h-5",
      lg: "w-6 h-6",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

const valueVariants = cva("text-muted-foreground font-medium", {
  variants: {
    size: {
      sm: "text-xs",
      default: "text-sm",
      lg: "text-base",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

interface RatingProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof ratingVariants> {
  rating: number;
  maxRating?: number;
  showValue?: boolean;
  editable?: boolean;
  onRatingChange?: (rating: number) => void;
  starClassName?: string;
}

function Rating({
  rating,
  maxRating = 5,
  size,
  className,
  starClassName,
  showValue = false,
  editable = false,
  onRatingChange,
  ...props
}: RatingProps) {
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);

  const displayRating =
    editable && hoveredRating !== null ? hoveredRating : rating;

  const getRatingFromMouse = (
    e: React.MouseEvent<HTMLDivElement>,
    star: number
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    return x < rect.width / 2 ? star - 0.5 : star;
  };

  const renderStars = () => {
    return Array.from({ length: maxRating }, (_, index) => {
      const star = index + 1;

      const filled = displayRating >= star;

      const partiallyFilled =
        displayRating > star - 1 && displayRating < star;

      const fillPercentage = filled
        ? 100
        : partiallyFilled
        ? (displayRating - (star - 1)) * 100
        : 0;

      return (
        <div
          key={star}
          className={cn(
            "relative",
            editable && "cursor-pointer transition-transform hover:scale-110"
          )}
          onMouseMove={(e) => {
            if (!editable) return;
            setHoveredRating(getRatingFromMouse(e, star));
          }}
          onMouseLeave={() => {
            if (editable) setHoveredRating(null);
          }}
          onClick={(e) => {
            if (!editable || !onRatingChange) return;
            onRatingChange(getRatingFromMouse(e, star));
          }}
        >
          {/* Empty Star */}
          <StarIcon
            className={cn(
              starVariants({ size }),
              "text-muted-foreground/25"
            )}
          />

          {/* Filled Star */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              width: `${fillPercentage}%`,
            }}
          >
            <StarIcon
              className={cn(
                starVariants({ size }),
                "fill-yellow-400 text-yellow-400"
              )}
            />
          </div>
        </div>
      );
    });
  };

  return (
    <div
      className={cn(ratingVariants({ size }), className)}
      {...props}
    >
      <div className="flex items-center">
        {renderStars()}
      </div>

      {showValue && (
        <span
          className={cn(
            valueVariants({ size }),
            starClassName
          )}
        >
          {displayRating.toFixed(1)}
        </span>
      )}
    </div>
  );
}

export { Rating };