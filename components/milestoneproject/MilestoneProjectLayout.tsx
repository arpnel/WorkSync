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

import useProjectMilestones from "@/hooks/milestoneproject/useProjectMilestones";
import useProjectChat from "@/hooks/milestoneproject/useProjectChat";
import useProjectAgreement from "@/hooks/milestoneproject/useProjectAgreement";

export default function MilestoneProjectLayout() {
  /* =========================================================
     HOOKS
  ========================================================= */

  const {
    milestones,
    projectBudget,
    duration,
    milestoneTotal,
    budgetDifference,
    setProjectBudget,
    setDuration,
    addMilestone,
    updateMilestone,
    deleteMilestone,
  } = useProjectMilestones();

  const {
    messages,
    message,
    setMessage,
    sendMessage,
  } = useProjectChat();

  const {
    clientStatus,
    freelancerStatus,
    bothAccepted,
  } = useProjectAgreement();

  /* =========================================================
     LOCAL UI STATE
     Only controls UI behavior.
  ========================================================= */

  const [
    editingMilestone,
    setEditingMilestone,
  ] = React.useState<number | null>(null);

  /* =========================================================
     MILESTONE EDITING
  ========================================================= */

  const [editTitle, setEditTitle] =
    React.useState("");

  const [
    editDescription,
    setEditDescription,
  ] = React.useState("");

  const [editBudget, setEditBudget] =
    React.useState(0);

  const [editDueDate, setEditDueDate] =
    React.useState("");

  const startEditing = (
    milestoneId: number
  ) => {
    const milestone = milestones.find(
      (item) => item.id === milestoneId
    );

    if (!milestone) {
      return;
    }

    setEditingMilestone(milestoneId);

    setEditTitle(milestone.title);
    setEditDescription(
      milestone.description
    );
    setEditBudget(milestone.budget);
    setEditDueDate(milestone.dueDate);
  };

  const cancelEditing = () => {
    setEditingMilestone(null);

    setEditTitle("");
    setEditDescription("");
    setEditBudget(0);
    setEditDueDate("");
  };

  const saveMilestone = (
    milestoneId: number
  ) => {
    updateMilestone(milestoneId, {
      title:
        editTitle.trim() ||
        "Untitled Milestone",

      description:
        editDescription.trim(),

      budget: Math.max(
        0,
        Number(editBudget) || 0
      ),

      dueDate: editDueDate,
    });

    cancelEditing();
  };

  const handleAddMilestone = () => {
    const milestone =
      addMilestone();

    startEditing(milestone.id);
  };

  /* =========================================================
     CHAT
  ========================================================= */

  const handleSendMessage = () => {
    sendMessage();
  };

  const handleChatKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      handleSendMessage();
    }
  };

  /* =========================================================
     AGREEMENT STATUS
  ========================================================= */

  const agreementStatus =
    bothAccepted
      ? "Agreement Accepted"
      : "Awaiting Agreement";

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* =====================================================
          PROJECT HEADER
      ===================================================== */}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
              E-commerce Website
            </h1>

            <Badge
              variant="secondary"
              className="shrink-0 gap-1"
            >
              <Clock3 className="h-3.5 w-3.5" />

              {agreementStatus}
            </Badge>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Project collaboration and milestone planning
          </p>
        </div>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2 sm:flex-none"
          >
            <FileText className="h-4 w-4" />

            Agreement
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
          >
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* =====================================================
          PROJECT INFORMATION
      ===================================================== */}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-x-8">
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

            <Badge
              variant="outline"
              className="w-fit"
            >
              {bothAccepted
                ? "Agreement Accepted"
                : "Agreement Pending"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* =====================================================
          MAIN WORKSPACE
      ===================================================== */}

      <div
        className="
          grid
          grid-cols-1
          gap-5
          lg:grid-cols-2
          xl:grid-cols-[320px_minmax(0,1fr)_320px]
        "
      >
        {/* ===================================================
            PROJECT CHAT
        =================================================== */}

        <Card
          className="
            flex
            min-h-[500px]
            flex-col
            overflow-hidden
            lg:min-h-[600px]
            xl:min-h-[680px]
          "
        >
          <CardHeader className="border-b pb-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4 shrink-0" />

                Project Chat
              </CardTitle>

              <Badge
                variant="secondary"
                className="shrink-0"
              >
                2 members
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col p-0">
            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              {messages.map((item) => {
                const isFreelancer =
                  item.sender ===
                  "freelancer";

                return (
                  <div
                    key={item.id}
                    className={
                      isFreelancer
                        ? "flex flex-row-reverse gap-3"
                        : "flex gap-3"
                    }
                  >
                    {/* Avatar */}
                    <div
                      className={
                        isFreelancer
                          ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
                          : "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
                      }
                    >
                      {item.initials}
                    </div>

                    {/* Message */}
                    <div className="min-w-0 max-w-[85%]">
                      <div
                        className={
                          isFreelancer
                            ? "mb-1 flex flex-wrap items-center justify-end gap-2"
                            : "mb-1 flex flex-wrap items-center gap-2"
                        }
                      >
                        {!isFreelancer && (
                          <span className="text-sm font-medium">
                            {item.name}
                          </span>
                        )}

                        <span className="text-xs text-muted-foreground">
                          {item.time}
                        </span>

                        {isFreelancer && (
                          <span className="text-sm font-medium">
                            {item.name}
                          </span>
                        )}
                      </div>

                      <div
                        className={
                          isFreelancer
                            ? "rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                            : "rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm"
                        }
                      >
                        {item.message}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Chat Input */}
            <div className="border-t p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={message}
                  onChange={(event) =>
                    setMessage(
                      event.target.value
                    )
                  }
                  onKeyDown={
                    handleChatKeyDown
                  }
                  placeholder="Write a message..."
                  className="min-h-[44px] resize-none"
                />

                <Button
                  size="icon"
                  className="shrink-0"
                  disabled={!message.trim()}
                  onClick={
                    handleSendMessage
                  }
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              <p className="mt-1.5 hidden text-[11px] text-muted-foreground sm:block">
                Press Enter to send · Shift + Enter
                for a new line
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ===================================================
            MILESTONES
        =================================================== */}

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
                onClick={
                  handleAddMilestone
                }
              >
                <Plus className="h-4 w-4" />

                Add Milestone
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-4 sm:p-5">
            {milestones.map(
              (milestone, index) => {
                const isEditing =
                  editingMilestone ===
                  milestone.id;

                return (
                  <div
                    key={milestone.id}
                    className="rounded-xl border bg-background p-3.5 sm:p-4"
                  >
                    {/* Milestone Header */}
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {index + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <Input
                              value={
                                editTitle
                              }
                              onChange={(
                                event
                              ) =>
                                setEditTitle(
                                  event
                                    .target
                                    .value
                                )
                              }
                              className="h-9"
                              placeholder="Milestone title"
                            />
                          ) : (
                            <h3 className="break-words text-sm font-medium sm:text-base">
                              {
                                milestone.title
                              }
                            </h3>
                          )}

                          {isEditing ? (
                            <Textarea
                              value={
                                editDescription
                              }
                              onChange={(
                                event
                              ) =>
                                setEditDescription(
                                  event
                                    .target
                                    .value
                                )
                              }
                              className="mt-2 min-h-[80px] resize-none"
                              placeholder="Milestone description"
                            />
                          ) : (
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                              {
                                milestone.description
                              }
                            </p>
                          )}
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          deleteMilestone(
                            milestone.id
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Milestone Fields */}
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
                            type="number"
                            min={0}
                            value={
                              isEditing
                                ? editBudget
                                : milestone.budget
                            }
                            readOnly={
                              !isEditing
                            }
                            onChange={(
                              event
                            ) =>
                              setEditBudget(
                                Number(
                                  event
                                    .target
                                    .value
                                )
                              )
                            }
                            className="pl-7"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-medium">
                          Proposed Due Date
                        </label>

                        <Input
                          type={
                            isEditing
                              ? "date"
                              : "text"
                          }
                          value={
                            isEditing
                              ? editDueDate
                              : milestone.dueDate
                          }
                          readOnly={
                            !isEditing
                          }
                          onChange={(
                            event
                          ) =>
                            setEditDueDate(
                              event
                                .target
                                .value
                            )
                          }
                        />
                      </div>
                    </div>

                    {/* Milestone Footer */}
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <Badge
                        variant="outline"
                        className="w-fit text-xs"
                      >
                        {milestone.status}
                      </Badge>

                      <div className="flex w-full gap-2 sm:w-auto">
                        {isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 flex-1 sm:flex-none"
                            onClick={
                              cancelEditing
                            }
                          >
                            Cancel
                          </Button>
                        )}

                        <Button
                          variant={
                            isEditing
                              ? "default"
                              : "ghost"
                          }
                          size="sm"
                          className="h-8 flex-1 sm:flex-none"
                          onClick={() => {
                            if (
                              isEditing
                            ) {
                              saveMilestone(
                                milestone.id
                              );
                            } else {
                              startEditing(
                                milestone.id
                              );
                            }
                          }}
                        >
                          {isEditing
                            ? "Save"
                            : "Edit"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              }
            )}

            <Button
              variant="outline"
              className="h-10 w-full gap-2 border-dashed"
              onClick={
                handleAddMilestone
              }
            >
              <Plus className="h-4 w-4" />

              Add Another Milestone
            </Button>
          </CardContent>
        </Card>

        {/* ===================================================
            MANAGEMENT SIDEBAR
        =================================================== */}

        <div className="space-y-5">
          {/* =================================================
              PROJECT TERMS
          ================================================= */}

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
                    min={0}
                    value={projectBudget}
                    onChange={(event) =>
                      setProjectBudget(
                        Number(
                          event.target.value
                        )
                      )
                    }
                    className="pl-7 text-lg font-semibold"
                  />
                </div>

                {projectBudget !==
                  milestoneTotal && (
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
                    onChange={(event) =>
                      setDuration(
                        Number(
                          event.target.value
                        )
                      )
                    }
                    className="pr-14"
                  />

                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    days
                  </span>
                </div>

                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  The project clock starts only after
                  both parties accept the agreement.
                </p>
              </div>

              {/* Budget Summary */}
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    Milestone total
                  </span>

                  <span className="font-medium">
                    ₱
                    {milestoneTotal.toLocaleString()}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    Proposed budget
                  </span>

                  <span className="font-medium">
                    ₱
                    {projectBudget.toLocaleString()}
                  </span>
                </div>

                {budgetDifference !== 0 && (
                  <div className="mt-2 border-t pt-2">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">
                        Unallocated
                      </span>

                      <span className="font-medium">
                        ₱
                        {budgetDifference.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* =================================================
              AGREEMENT
          ================================================= */}

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
                    {clientStatus ===
                    "accepted"
                      ? "Accepted"
                      : clientStatus ===
                          "rejected"
                        ? "Rejected"
                        : "Pending"}
                  </Badge>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Freelancer
                  </span>

                  <Badge variant="outline">
                    {freelancerStatus ===
                    "accepted"
                      ? "Accepted"
                      : freelancerStatus ===
                          "rejected"
                        ? "Rejected"
                        : "Pending"}
                  </Badge>
                </div>
              </div>

              <Button className="mt-5 w-full gap-2">
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

          {/* =================================================
              PLANNING STATUS
          ================================================= */}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Planning Status
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  Milestones planned
                </span>

                <span className="font-medium">
                  {milestones.length}
                </span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${
                      milestones.length > 0
                        ? Math.min(
                            100,
                            (milestones.length /
                              3) *
                              100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>

              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Adjust the budget, duration, and
                milestones until both parties agree.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

