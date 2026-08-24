
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
  Clock3,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Send,
  Trash2,
  Wallet,
} from "lucide-react";

const milestones = [
  {
    id: 1,
    title: "UI/UX Design",
    description:
      "Create the complete website wireframe and visual design.",
    budget: 4000,
    dueDate: "Aug 28, 2026",
    status: "Planning",
  },
  {
    id: 2,
    title: "Frontend Development",
    description:
      "Build the responsive frontend based on the approved design.",
    budget: 6000,
    dueDate: "Sep 7, 2026",
    status: "Planning",
  },
  {
    id: 3,
    title: "Backend & Integration",
    description:
      "Connect the backend, database, authentication, and APIs.",
    budget: 5000,
    dueDate: "Sep 15, 2026",
    status: "Planning",
  },
];

export default function milestoneproject() {
  const [projectBudget, setProjectBudget] = React.useState(15000);
  const [duration, setDuration] = React.useState(25);

  const milestoneTotal = milestones.reduce(
    (total, milestone) => total + milestone.budget,
    0
  );

  const budgetDifference = projectBudget - milestoneTotal;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              E-commerce Website
            </h1>

            <Badge variant="secondary" className="gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              Awaiting Agreement
            </Badge>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Project collaboration and milestone planning
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Agreement
          </Button>

          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Project Info */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  Client
                </p>

                <p className="mt-1 truncate text-sm font-medium sm:text-base">
                  Sarah Johnson
                </p>
              </div>

              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  Freelancer
                </p>

                <p className="mt-1 truncate text-sm font-medium sm:text-base">
                  Alex Martinez
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">
                  Requested
                </p>

                <p className="mt-1 text-sm font-medium sm:text-base">
                  Aug 21, 2026
                </p>
              </div>
            </div>

            <Badge variant="outline" className="w-fit">
              Agreement Pending
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Workspace */}
      <div
        className="
          grid
          grid-cols-1
          gap-5
          lg:grid-cols-2
          xl:grid-cols-[320px_minmax(0,1fr)_320px]
        "
      >
        {/* Chat */}
        <Card
          className="
            flex
            min-h-[500px]
            flex-col
            overflow-hidden
            lg:col-span-2
            xl:col-span-1
            xl:min-h-[680px]
          "
        >
          <CardHeader className="border-b pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4" />
                Project Chat
              </CardTitle>

              <Badge variant="secondary">
                2 members
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col p-0">
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              {/* Client */}
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
                    I would like to split the project into three
                    milestones.
                  </div>
                </div>
              </div>

              {/* Freelancer */}
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
                    That works for me. I added the proposed
                    milestones.
                  </div>
                </div>
              </div>

              {/* Client */}
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
                    Can we move ₱1,000 from development to the
                    final integration milestone?
                  </div>
                </div>
              </div>
            </div>

            {/* Chat Input */}
            <div className="border-t p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  placeholder="Write a message..."
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
          </CardContent>
        </Card>

        {/* Milestones */}
        <Card className="min-h-0 lg:min-h-[600px] xl:min-h-[680px]">
          <CardHeader className="border-b">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">
                  Project Milestones
                </CardTitle>

                <p className="mt-1 text-sm text-muted-foreground">
                  Define the work, budget, and schedule.
                </p>
              </div>

              <Button
                size="sm"
                className="w-full gap-2 sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                Add Milestone
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-4 sm:p-5">
            {milestones.map((milestone, index) => (
              <div
                key={milestone.id}
                className="rounded-xl border bg-background p-3.5 sm:p-4"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {index + 1}
                    </div>

                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium sm:text-base">
                        {milestone.title}
                      </h3>

                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                        {milestone.description}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium">
                      Budget
                    </label>

                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        ₱
                      </span>

                      <Input
                        value={milestone.budget.toLocaleString()}
                        readOnly
                        className="pl-7"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium">
                      Proposed Due Date
                    </label>

                    <Input
                      value={milestone.dueDate}
                      readOnly
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className="text-xs"
                  >
                    {milestone.status}
                  </Badge>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                  >
                    Edit
                  </Button>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              className="h-10 w-full gap-2 border-dashed"
            >
              <Plus className="h-4 w-4" />
              Add Another Milestone
            </Button>
          </CardContent>
        </Card>

        {/* Management Sidebar */}
        <div className="space-y-5">
          {/* Project Terms */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="h-4 w-4" />
                Project Terms
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* Total Budget */}
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Total Budget
                </label>

                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₱
                  </span>

                  <Input
                    type="number"
                    value={projectBudget}
                    onChange={(e) =>
                      setProjectBudget(Number(e.target.value))
                    }
                    className="pl-7 text-lg font-semibold"
                  />
                </div>

                {projectBudget !== milestoneTotal && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Milestones currently total ₱
                    {milestoneTotal.toLocaleString()}.
                  </p>
                )}
              </div>

              {/* Duration */}
              <div>
                <label className="mb-1.5 block text-xs font-medium">
                  Proposed Duration
                </label>

                <div className="relative">
                  <Input
                    type="number"
                    min={1}
                    value={duration}
                    onChange={(e) =>
                      setDuration(Number(e.target.value))
                    }
                    className="pr-14"
                  />

                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    days
                  </span>
                </div>

                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  The project clock starts only after both parties
                  accept the agreement.
                </p>
              </div>

              {/* Budget Summary */}
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Milestone total
                  </span>

                  <span className="font-medium">
                    ₱{milestoneTotal.toLocaleString()}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Proposed budget
                  </span>

                  <span className="font-medium">
                    ₱{projectBudget.toLocaleString()}
                  </span>
                </div>

                {budgetDifference !== 0 && (
                  <div className="mt-2 border-t pt-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Unallocated
                      </span>

                      <span className="font-medium">
                        ₱{budgetDifference.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
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
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Client
                  </span>

                  <Badge variant="outline">
                    Pending
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Freelancer
                  </span>

                  <Badge variant="outline">
                    Pending
                  </Badge>
                </div>
              </div>

              <Button className="mt-5 w-full gap-2">
                <FileText className="h-4 w-4" />
                Review Agreement
              </Button>

              <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
                Both parties must accept the final terms before
                the project officially begins.
              </p>
            </CardContent>
          </Card>

          {/* Planning Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Planning Status
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Milestones planned
                </span>

                <span className="font-medium">
                  {milestones.length}
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-1/3 rounded-full bg-primary" />
              </div>

              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Adjust the budget, duration, and milestones until
                both parties agree.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}