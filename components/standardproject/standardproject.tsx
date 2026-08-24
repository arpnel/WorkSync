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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  CalendarDays,
  CheckCircle2,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Send,
  Wallet,
} from "lucide-react";

type StandardProjectSetupProps = {
  agreed?: boolean;
};

export default function StandardProjectSetup({
  agreed = false,
}: StandardProjectSetupProps) {
  const [budget, setBudget] = React.useState("15000");
  const [deadline, setDeadline] = React.useState("2026-09-15");

  const disabled = agreed;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              E-commerce Website
            </h1>

            <Badge variant="secondary">
              Standard
            </Badge>

            <Badge
              variant={agreed ? "secondary" : "outline"}
              className="gap-1"
            >
              {agreed && (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}

              {agreed ? "Agreed" : "Negotiating"}
            </Badge>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Discuss the project terms before accepting the agreement.
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="self-end sm:self-auto"
        >
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </div>

      {/* Project Info */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Client
              </p>

              <p className="mt-1 truncate text-sm font-medium">
                Sarah Johnson
              </p>
            </div>

            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                Freelancer
              </p>

              <p className="mt-1 truncate text-sm font-medium">
                Alex Martinez
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground">
                Service Type
              </p>

              <p className="mt-1 text-sm font-medium">
                Standard
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Workspace */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Chat */}
        <Card className="flex min-h-[520px] flex-col overflow-hidden">
          <CardHeader className="border-b pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4" />

              Project Chat

              <Badge variant="secondary" className="ml-auto">
                2 members
              </Badge>
            </CardTitle>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col p-0">
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              {/* Client Message */}
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  SJ
                </div>

                <div className="min-w-0 max-w-[85%]">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      Sarah
                    </span>

                    <span className="text-xs text-muted-foreground">
                      10:42 AM
                    </span>
                  </div>

                  <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">
                    Can we adjust the budget to ₱15,000?
                  </div>
                </div>
              </div>

              {/* Freelancer Message */}
              <div className="flex flex-row-reverse gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  AM
                </div>

                <div className="min-w-0 max-w-[85%]">
                  <div className="mb-1 flex flex-wrap items-center justify-end gap-2">
                    <span className="text-xs text-muted-foreground">
                      10:45 AM
                    </span>

                    <span className="text-sm font-medium">
                      Alex
                    </span>
                  </div>

                  <div className="rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                    That works for me. I can deliver it by September 15.
                  </div>
                </div>
              </div>

              {/* Client Message */}
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  SJ
                </div>

                <div className="min-w-0 max-w-[85%]">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      Sarah
                    </span>

                    <span className="text-xs text-muted-foreground">
                      10:48 AM
                    </span>
                  </div>

                  <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">
                    Perfect. I think we can proceed with the agreement.
                  </div>
                </div>
              </div>
            </div>

            {/* Chat Input */}
            {!disabled && (
              <div className="border-t p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    placeholder="Discuss budget, deadline, or requirements..."
                    className="min-h-[44px] resize-none"
                  />

                  <Button
                    size="icon"
                    className="shrink-0"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Side */}
        <div className="space-y-5">
          {/* Project Terms */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    Project Terms
                  </CardTitle>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Agreed terms for this project.
                  </p>
                </div>

                <Badge variant="outline">
                  One-time
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* Budget */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    Total Budget
                  </label>

                  {!disabled && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  )}
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₱
                  </span>

                  <Input
                    value={Number(budget).toLocaleString()}
                    onChange={(e) =>
                      setBudget(
                        e.target.value.replace(/\D/g, "")
                      )
                    }
                    disabled={disabled}
                    className="pl-7 text-lg font-semibold"
                  />
                </div>
              </div>

              {/* Deadline */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    Completion Date
                  </label>

                  {!disabled && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  )}
                </div>

                <Input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  disabled={disabled}
                />

                <p className="mt-1.5 text-xs text-muted-foreground">
                  The project deadline starts after both parties accept.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Agreement */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Agreement
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Client
                  </span>

                  <Badge variant={agreed ? "secondary" : "outline"}>
                    {agreed ? "Accepted" : "Pending"}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Freelancer
                  </span>

                  <Badge variant={agreed ? "secondary" : "outline"}>
                    {agreed ? "Accepted" : "Pending"}
                  </Badge>
                </div>
              </div>

              {!disabled ? (
                <>
                  <Button className="mt-5 w-full gap-2">
                    <FileText className="h-4 w-4" />
                    Review Agreement
                  </Button>

                  <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
                    Once both parties accept, the project terms
                    become locked.
                  </p>
                </>
              ) : (
                <div className="mt-5 rounded-lg bg-emerald-500/5 p-3 text-center">
                  <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-600" />

                  <p className="mt-2 text-sm font-medium">
                    Agreement Accepted
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Budget and deadline are now locked.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}