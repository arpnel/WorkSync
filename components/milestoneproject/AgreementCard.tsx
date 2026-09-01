"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { FileText } from "lucide-react";

interface AgreementCardProps {
  clientAccepted?: boolean;
  freelancerAccepted?: boolean;
  onReview?: () => void;
}

export default function AgreementCard({
  clientAccepted = false,
  freelancerAccepted = false,
  onReview,
}: AgreementCardProps) {
  const bothAccepted =
    clientAccepted && freelancerAccepted;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Agreement
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              Client
            </span>

            <Badge variant="outline">
              {clientAccepted
                ? "Accepted"
                : "Pending"}
            </Badge>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">
              Freelancer
            </span>

            <Badge variant="outline">
              {freelancerAccepted
                ? "Accepted"
                : "Pending"}
            </Badge>
          </div>
        </div>

        <Button
          className="mt-5 w-full gap-2"
          onClick={onReview}
        >
          <FileText className="h-4 w-4" />
          Review Agreement
        </Button>

        <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
          {bothAccepted
            ? "Both parties have accepted the agreement."
            : "Both parties must accept the final terms before the project officially begins."}
        </p>
      </CardContent>
    </Card>
  );
}