"use client";

import {
  Badge,
} from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Sparkles,
  Star,
  UserRound,
} from "lucide-react";

export interface Request {
  id: string;

  // Project / Request
  projectTitle: string;
  projectType: string;
  budget: number;
  deliveryTimeDays: number;

  // Freelancer
  freelancerName: string;
  freelancerHeadline: string;
  freelancerAvatar?: string | null;
  freelancerRating: number;
  freelancerReviews: number;
  yearsOfExperience: number;

  // AI Evaluation
  aiScore: number;
  skillsMatch: number;
  experienceMatch: number;
  requirementsMatch: number;
  portfolioMatch: number;
  aiSummary: string;

  // Request
  message: string;
  createdAt: string;
  status: "Pending" | "Accepted" | "Rejected" | "In Review";
}

interface RequestCardProps {
  request: Request;
  onClick?: (request: Request) => void;
}

export function RequestCard({
  request,
  onClick,
}: RequestCardProps) {
  const getAIScoreLabel = (score: number) => {
    if (score >= 90) return "Excellent Match";
    if (score >= 80) return "Strong Match";
    if (score >= 70) return "Good Match";
    if (score >= 60) return "Fair Match";
    return "Low Match";
  };

  const getAIScoreStyle = (score: number) => {
    if (score >= 90) {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (score >= 80) {
      return "border-green-200 bg-green-50 text-green-700";
    }

    if (score >= 70) {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }

    if (score >= 60) {
      return "border-orange-200 bg-orange-50 text-orange-700";
    }

    return "border-red-200 bg-red-50 text-red-700";
  };

  const getStatusStyle = (status: Request["status"]) => {
    switch (status) {
      case "Accepted":
        return "bg-emerald-100 text-emerald-700";

      case "Rejected":
        return "bg-red-100 text-red-700";

      case "In Review":
        return "bg-amber-100 text-amber-700";

      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <button
      type="button"
      onClick={() => onClick?.(request)}
      className="block w-full text-left"
    >
      <Card className="overflow-hidden transition hover:border-primary/30 hover:shadow-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-5">
            {/* =========================================================
                TOP SECTION
            ========================================================= */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              {/* Project + Freelancer */}
              <div className="min-w-0 flex-1">
                {/* Project */}
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-semibold">
                    {request.projectTitle}
                  </h2>

                  <Badge
                    variant="outline"
                    className="gap-1 font-normal"
                  >
                    <BriefcaseBusiness className="h-3 w-3" />
                    {request.projectType}
                  </Badge>

                  <Badge
                    className={getStatusStyle(request.status)}
                  >
                    {request.status}
                  </Badge>
                </div>

                {/* Freelancer */}
                <div className="mt-4 flex items-center gap-3">
                  {/* Avatar */}
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                    {request.freelancerAvatar ? (
                      <img
                        src={request.freelancerAvatar}
                        alt={request.freelancerName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <UserRound className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {request.freelancerName}
                    </p>

                    <p className="truncate text-sm text-muted-foreground">
                      {request.freelancerHeadline}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3 w-3 fill-current text-amber-500" />
                        {request.freelancerRating.toFixed(1)}
                      </span>

                      <span>
                        ({request.freelancerReviews} reviews)
                      </span>

                      <span>•</span>

                      <span>
                        {request.yearsOfExperience}{" "}
                        {request.yearsOfExperience === 1
                          ? "year"
                          : "years"}{" "}
                        experience
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* =======================================================
                  AI SCORE
              ======================================================= */}
              <div
                className={`w-full shrink-0 rounded-xl border p-4 lg:w-[210px] ${getAIScoreStyle(
                  request.aiScore,
                )}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" />

                    <span className="text-xs font-semibold uppercase tracking-wide">
                      AI Match
                    </span>
                  </div>

                  <ArrowUpRight className="h-4 w-4 opacity-60" />
                </div>

                <div className="mt-2 flex items-end gap-2">
                  <span className="text-3xl font-bold leading-none">
                    {request.aiScore}%
                  </span>
                </div>

                <p className="mt-1 text-xs font-medium">
                  {getAIScoreLabel(request.aiScore)}
                </p>
              </div>
            </div>

            {/* =========================================================
                AI MATCH FACTORS
            ========================================================= */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />

                <span className="text-sm font-medium">
                  AI Match Analysis
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {/* Skills */}
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Skills
                    </span>

                    <span className="text-xs font-medium">
                      {request.skillsMatch}%
                    </span>
                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${request.skillsMatch}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Experience */}
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Experience
                    </span>

                    <span className="text-xs font-medium">
                      {request.experienceMatch}%
                    </span>
                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${request.experienceMatch}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Requirements */}
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Requirements
                    </span>

                    <span className="text-xs font-medium">
                      {request.requirementsMatch}%
                    </span>
                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${request.requirementsMatch}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Portfolio */}
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Portfolio
                    </span>

                    <span className="text-xs font-medium">
                      {request.portfolioMatch}%
                    </span>
                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${request.portfolioMatch}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* AI Summary */}
              <p className="mt-3 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                {request.aiSummary}
              </p>
            </div>

            {/* =========================================================
                REQUEST MESSAGE
            ========================================================= */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Request message
              </p>

              <p className="line-clamp-2 text-sm leading-relaxed">
                {request.message}
              </p>
            </div>

            {/* =========================================================
                BOTTOM DETAILS
            ========================================================= */}
            <div className="flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:flex sm:flex-wrap sm:items-center sm:gap-6">
                {/* Budget */}
                <div className="flex items-center gap-2">
                  <BriefcaseBusiness className="h-4 w-4 shrink-0 text-muted-foreground" />

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Proposed budget
                    </p>

                    <p className="text-sm font-medium">
                      ₱{request.budget.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Delivery */}
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" />

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Delivery
                    </p>

                    <p className="text-sm font-medium">
                      {request.deliveryTimeDays}{" "}
                      {request.deliveryTimeDays === 1
                        ? "day"
                        : "days"}
                    </p>
                  </div>
                </div>

                {/* Submitted */}
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Submitted
                    </p>

                    <p className="text-sm font-medium">
                      {request.createdAt}
                    </p>
                  </div>
                </div>
              </div>

              {/* View Request */}
              <div className="flex shrink-0 items-center gap-2 text-sm font-medium text-primary">
                <span>View request</span>

                <ArrowUpRight className="h-4 w-4" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}