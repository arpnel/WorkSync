"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { Star } from "lucide-react";
import type { ProjectRequest } from "@/services/project/projectRequestService";

export function RequestCard({
  request,
  onClick,
}: {
  request: ProjectRequest;
  onClick: (request: ProjectRequest) => void;
}) {
  const score = request.screening?.score;
  return (
    <TableRow className="cursor-pointer" onClick={() => onClick(request)}>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage
              src={request.freelancerAvatar ?? undefined}
              alt={request.freelancerName}
            />
            <AvatarFallback>
              {request.freelancerName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{request.freelancerName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {request.freelancerHeadline || "Freelancer"}
            </p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        {typeof score === "number" ? (
          <span className="font-semibold text-primary">
            AI Match: {score}%
            {request.screening?.expiresAt && (
              <span className="block text-xs font-normal text-muted-foreground">
                Valid until{" "}
                {new Date(request.screening.expiresAt).toLocaleDateString()}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">Not screened</span>
        )}
      </TableCell>
      <TableCell>
        {request.rating === null ? (
          <span className="text-muted-foreground">No ratings</span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {request.rating.toFixed(1)}
          </span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="capitalize">
          {request.status.replaceAll("_", " ")}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
