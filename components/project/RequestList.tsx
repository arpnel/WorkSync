"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Search } from "lucide-react";

import {
  Request,
  RequestCard,
} from "./RequestCard";

interface RequestListProps {
  requests: Request[];
  onRequestClick?: (request: Request) => void;
}

export function RequestList({
  requests,
  onRequestClick,
}: RequestListProps) {
  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="mb-3 h-8 w-8 text-muted-foreground" />

          <p className="font-medium">
            No requests found
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            Try changing your search or request filter.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <RequestCard
          key={request.id}
          request={request}
          onClick={onRequestClick}
        />
      ))}
    </div>
  );
}