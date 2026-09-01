"use client";

import { useState } from "react";
import { Check, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type ApprovalRowProps = {
  label: string;
  suffix: string;
  itemKey: ItemKey;
  value: number;
  approval?: WorkspaceAgreementItem;
  currentParty: "client" | "freelancer";
  updating: boolean;
  onRespond: (itemKey: string, approved: boolean) => Promise<void>;
  onSave: (itemKey: ItemKey, value: number) => Promise<void>;
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
  const changed = value !== initialValue;
  const clientApproved = Boolean(approval?.clientApprovedAt);
  const freelancerApproved = Boolean(approval?.freelancerApprovedAt);
  const mineApproved =
    currentParty === "client" ? clientApproved : freelancerApproved;

  return (
    <div className="rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{label}</h3>
        <Badge
          variant={
            clientApproved && freelancerApproved ? "secondary" : "outline"
          }
        >
          {clientApproved && freelancerApproved ? "Approved" : "Review"}
        </Badge>
      </div>

      <div className="mt-3 flex gap-2">
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
          size="icon"
          variant="outline"
          aria-label={`Save ${label.toLowerCase()}`}
          disabled={!changed || updating}
          onClick={() => void onSave(itemKey, value)}
        >
          {updating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
        </Button>
      </div>

      {changed && (
        <p className="mt-2 text-xs text-muted-foreground">
          Saving this change resets both approvals for {label.toLowerCase()}.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <span className="text-muted-foreground">
          Client: {clientApproved ? "Agreed" : "Waiting"}
        </span>
        <span className="text-right text-muted-foreground">
          Freelancer: {freelancerApproved ? "Agreed" : "Waiting"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant={mineApproved ? "secondary" : "outline"}
          disabled={updating || mineApproved || changed}
          onClick={() => void onRespond(itemKey, true)}
        >
          <Check className="h-3.5 w-3.5" />
          {mineApproved ? "Agreed" : "Agree"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={updating || changed}
          onClick={() => void onRespond(itemKey, false)}
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
  };

  const saveItem = async (itemKey: ItemKey, value: number) => {
    const saved = await onSaveItem(itemKey, value);
    toast[saved ? "success" : "error"](
      saved
        ? "Term updated and its approvals were reset."
        : "The term could not be updated.",
    );
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
              onClick={() => void respond(true)}
            >
              <Check className="h-4 w-4" />
              Confirm all
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={updating || !project.contractId}
              onClick={() => void respond(false)}
            >
              <X className="h-4 w-4" />
              Reset
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
