"use client";

import { useState } from "react";
import { Check, Loader2, PencilLine, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type {
  ProjectWorkspace,
  WorkspaceAgreementItem,
} from "@/types/project/projectWorkspace";

type ItemKey = "budget" | "delivery" | "revisions";

type Props = {
  project: ProjectWorkspace;
  updating: boolean;
  updatingApprovalKey: string | null;
  onRespond: (accepted: boolean) => Promise<boolean>;
  onRespondItem: (itemKey: string, approved: boolean) => Promise<boolean>;
  onSaveItem: (itemKey: ItemKey, value: number) => Promise<boolean>;
};

type ConfirmationDialogProps = {
  open: boolean;
  action: "agree" | "cancel";
  subject: string;
  processing: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

function ConfirmationDialog({
  open,
  action,
  subject,
  processing,
  onOpenChange,
  onConfirm,
}: ConfirmationDialogProps) {
  const agreeing = action === "agree";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {agreeing ? `Confirm ${subject}?` : `Cancel ${subject} agreement?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {agreeing
              ? "You are confirming that you accept every agreed term. The project becomes active after the other party also confirms."
              : "This removes only your final confirmation. The other party's confirmation and all agreed terms remain unchanged."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={processing}>Go back</AlertDialogCancel>
          <AlertDialogAction
            disabled={processing}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            className={
              agreeing
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-destructive text-white hover:bg-destructive/90"
            }
          >
            {processing && <Loader2 className="h-4 w-4 animate-spin" />}
            {agreeing ? "Confirm contract" : "Confirm cancellation"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type ApprovalRowProps = {
  label: string;
  suffix: string;
  itemKey: ItemKey;
  value: number;
  approval?: WorkspaceAgreementItem;
  currentParty: "client" | "freelancer";
  updating: boolean;
  onRespond: (itemKey: string, approved: boolean) => Promise<boolean>;
  onSave: (itemKey: ItemKey, value: number) => Promise<boolean>;
};

function ApprovalRow({
  label,
  suffix,
  itemKey,
  value: initialValue,
  approval,
  currentParty,
  updating,
  onRespond,
  onSave,
}: ApprovalRowProps) {
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [locallyReset, setLocallyReset] = useState(false);
  const changed = value !== savedValue;
  const clientApproved = !locallyReset && Boolean(approval?.clientApprovedAt);
  const freelancerApproved =
    !locallyReset && Boolean(approval?.freelancerApprovedAt);
  const needsReview =
    locallyReset ||
    Boolean(
      approval && !approval.clientApprovedAt && !approval.freelancerApprovedAt,
    );
  const mineApproved =
    currentParty === "client" ? clientApproved : freelancerApproved;

  const saveValue = async () => {
    if (await onSave(itemKey, value)) {
      setSavedValue(value);
      setLocallyReset(true);
    }
  };

  const respond = async (approved: boolean) => {
    if (await onRespond(itemKey, approved)) {
      setLocallyReset(false);
    }
  };

  return (
    <div className="rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{label}</h3>
        <Badge
          variant="outline"
          className={
            clientApproved && freelancerApproved
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : undefined
          }
        >
          {clientApproved && freelancerApproved
            ? "Agreed"
            : needsReview
              ? "Changed - review"
              : "Review"}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative min-w-0 flex-1">
          <Input
            type="number"
            min={itemKey === "revisions" ? 0 : 1}
            step={itemKey === "budget" ? "any" : 1}
            value={value}
            disabled={updating}
            onChange={(event) => setValue(Number(event.target.value))}
            className="pr-16 font-medium"
          />
          <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!changed || updating}
          onClick={() => void saveValue()}
          className="shrink-0"
        >
          {updating && changed ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PencilLine className="h-4 w-4" />
          )}
          Propose change
        </Button>
      </div>

      {changed && (
        <div className="mt-2 text-xs text-muted-foreground">
          <p>
            Currently shared:{" "}
            <span className="font-medium text-foreground">
              {savedValue.toLocaleString()} {suffix}
            </span>
          </p>
          <p className="mt-1">
            Proposing this change will notify the other party and reset both
            approvals for {label.toLowerCase()}.
          </p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <span className="text-muted-foreground">
          Client:{" "}
          {clientApproved ? "Agreed" : needsReview ? "Needs review" : "Waiting"}
        </span>
        <span className="text-right text-muted-foreground">
          Freelancer:{" "}
          {freelancerApproved
            ? "Agreed"
            : needsReview
              ? "Needs review"
              : "Waiting"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant={mineApproved ? "secondary" : "outline"}
          disabled={updating || mineApproved || changed}
          onClick={() => void respond(true)}
        >
          <Check className="h-3.5 w-3.5" />
          {mineApproved ? "Agreed" : "Agree"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={updating || changed}
          onClick={() => void respond(false)}
        >
          <X className="h-3.5 w-3.5" />
          Disagree
        </Button>
      </div>
    </div>
  );
}

export function ProjectAgreementCard({
  project,
  updating,
  updatingApprovalKey,
  onRespond,
  onRespondItem,
  onSaveItem,
}: Props) {
  const [pendingFinalResponse, setPendingFinalResponse] = useState<
    boolean | null
  >(null);
  const clientAccepted = Boolean(project.clientSignedAt);
  const freelancerAccepted = Boolean(project.freelancerSignedAt);
  const mineAccepted =
    project.currentParty === "client" ? clientAccepted : freelancerAccepted;
  const approvalMap = new Map(
    project.agreementItems.map((item) => [item.itemKey, item]),
  );
  const requiredKeys = [
    "budget",
    "delivery",
    "revisions",
    ...project.milestones.map((milestone) => `milestone:${milestone.id}`),
  ];
  const everyItemApproved = requiredKeys.every((key) => {
    const item = approvalMap.get(key);
    return Boolean(item?.clientApprovedAt && item.freelancerApprovedAt);
  });

  const respond = async (accepted: boolean) => {
    const saved = await onRespond(accepted);
    setPendingFinalResponse(null);
    toast[saved ? "success" : "error"](
      saved
        ? accepted
          ? "Your final confirmation was recorded."
          : "The final confirmation was reset."
        : "The final confirmation could not be updated.",
    );
  };

  const respondItem = async (itemKey: string, approved: boolean) => {
    const saved = await onRespondItem(itemKey, approved);
    toast[saved ? "success" : "error"](
      saved
        ? approved
          ? "Item approval recorded."
          : "Both approvals for this item were reset."
        : "The item approval could not be updated.",
    );
    return saved;
  };

  const saveItem = async (itemKey: ItemKey, value: number) => {
    const saved = await onSaveItem(itemKey, value);
    toast[saved ? "success" : "error"](
      saved
        ? "Term updated and its approvals were reset."
        : "The term could not be updated.",
    );
    return saved;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contract Approvals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ApprovalRow
          key={`budget:${project.budget}`}
          label="Budget"
          suffix="PHP"
          itemKey="budget"
          value={project.budget}
          approval={approvalMap.get("budget")}
          currentParty={project.currentParty}
          updating={updatingApprovalKey === "budget"}
          onRespond={respondItem}
          onSave={saveItem}
        />
        <ApprovalRow
          key={`delivery:${project.deliveryDays}`}
          label="Delivery"
          suffix="days"
          itemKey="delivery"
          value={project.deliveryDays ?? 1}
          approval={approvalMap.get("delivery")}
          currentParty={project.currentParty}
          updating={updatingApprovalKey === "delivery"}
          onRespond={respondItem}
          onSave={saveItem}
        />
        <ApprovalRow
          key={`revisions:${project.revisions}`}
          label="Revisions"
          suffix="allowed"
          itemKey="revisions"
          value={project.revisions ?? 0}
          approval={approvalMap.get("revisions")}
          currentParty={project.currentParty}
          updating={updatingApprovalKey === "revisions"}
          onRespond={respondItem}
          onSave={saveItem}
        />

        <div className="space-y-3 border-t pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Client confirmation</span>
            <Badge variant={clientAccepted ? "secondary" : "outline"}>
              {clientAccepted ? "Confirmed" : "Pending"}
            </Badge>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">
              Freelancer confirmation
            </span>
            <Badge variant={freelancerAccepted ? "secondary" : "outline"}>
              {freelancerAccepted ? "Confirmed" : "Pending"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              disabled={
                updating ||
                mineAccepted ||
                !everyItemApproved ||
                !project.contractId
              }
              onClick={() => setPendingFinalResponse(true)}
            >
              <Check className="h-4 w-4" />
              Confirm
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={updating || !project.contractId}
              onClick={() => setPendingFinalResponse(false)}
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>

        <ConfirmationDialog
          open={pendingFinalResponse !== null}
          action={pendingFinalResponse === false ? "cancel" : "agree"}
          subject="the complete contract"
          processing={updating}
          onOpenChange={(open) => {
            if (!open && !updating) setPendingFinalResponse(null);
          }}
          onConfirm={() => void respond(pendingFinalResponse ?? true)}
        />
      </CardContent>
    </Card>
  );
}
