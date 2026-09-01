"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface ProjectInfoProps {
  clientName?: string;
  freelancerName?: string;
  requestedDate?: string;
  agreementStatus?: string;
}

export default function ProjectInfo({
  clientName = "Sarah Johnson",
  freelancerName = "Alex Martinez",
  requestedDate = "Aug 21, 2026",
  agreementStatus = "Agreement Pending",
}: ProjectInfoProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-x-8">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Client
              </p>

              <p className="mt-1 truncate text-sm font-medium sm:text-base">
                {clientName}
              </p>
            </div>

            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Freelancer
              </p>

              <p className="mt-1 truncate text-sm font-medium sm:text-base">
                {freelancerName}
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">
                Requested
              </p>

              <p className="mt-1 text-sm font-medium sm:text-base">
                {requestedDate}
              </p>
            </div>
          </div>

          <Badge
            variant="outline"
            className="w-fit"
          >
            {agreementStatus}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}