"use client";

import { useState } from "react";
import { Check, Loader2, Save, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  ProjectWorkspace,
  WorkspaceAgreementItem,
} from "@/types/project/projectWorkspace";

type Props = {
  project: ProjectWorkspace;
  updating: boolean;
  updatingApprovalKey: string | null;
  onRespond: (accepted: boolean) => Promise<boolean>;
  onRespondItem: (itemKey: string, approved: boolean) => Promise<boolean>;
  onSaveTerms: (budget: number, deliveryDays: number) => Promise<boolean>;
};

type ApprovalRowProps = {
  label: string;
  value: string;
  itemKey: string;
  approval?: WorkspaceAgreementItem;
  currentParty: "client" | "freelancer";
  updating: boolean;
  onRespond: (itemKey: string, approved: boolean) => Promise<void>;
};

function ApprovalRow({
  label,
  value,
  itemKey,
  approval,
  currentParty,
  updating,
  onRespond,
}: ApprovalRowProps) {
  const clientApproved = Boolean(approval?.clientApprovedAt);
  const freelancerApproved = Boolean(approval?.freelancerApprovedAt);
  const mineApproved =
    currentParty === "client" ? clientApproved : freelancerApproved;

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 font-semibold">{value}</p>
        </div>
        <Badge
          variant={
            clientApproved && freelancerApproved ? "secondary" : "outline"
          }
        >
          {clientApproved && freelancerApproved ? "Approved" : "Review"}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
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
          disabled={updating || mineApproved}
          onClick={() => void onRespond(itemKey, true)}
        >
          <Check className="h-3.5 w-3.5" />
          {mineApproved ? "Agreed" : "Agree"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={updating}
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
  onSaveTerms,
}: Props) {
  const [budget, setBudget] = useState(project.budget);
  const [deliveryDays, setDeliveryDays] = useState(project.deliveryDays ?? 1);
  const clientAccepted = Boolean(project.clientSignedAt);
  const freelancerAccepted = Boolean(project.freelancerSignedAt);
  const bothAccepted = clientAccepted && freelancerAccepted;
  const mineAccepted =
    project.currentParty === "client" ? clientAccepted : freelancerAccepted;
  const termsChanged =
    budget !== project.budget || deliveryDays !== (project.deliveryDays ?? 1);
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
          ? "Your final agreement was recorded."
          : "The final agreement was reset for both parties."
        : "The final agreement could not be updated.",
    );
  };

  const respondItem = async (itemKey: string, approved: boolean) => {
    const saved = await onRespondItem(itemKey, approved);
    toast[saved ? "success" : "error"](
      saved
        ? approved
          ? "Item approval recorded."
          : "Both approvals for this item were reset."
        : "Run the Supabase individual-approval migration first.",
    );
  };

  const saveTerms = async () => {
    const saved = await onSaveTerms(budget, deliveryDays);
    toast[saved ? "success" : "error"](
      saved
        ? "Terms updated. Approvals must be reviewed again."
        : "The project terms could not be updated.",
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" />
          Agreement
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs font-medium">
            Agreed budget
            <div className="relative">
              <span className="absolute top-1/2 left-3 -translate-y-1/2 text-xs text-muted-foreground">
                PHP
              </span>
              <Input
                type="number"
                min={1}
                value={budget}
                disabled={updating}
                onChange={(event) => setBudget(Number(event.target.value))}
                className="pl-12"
              />
            </div>
          </label>
          <label className="space-y-1.5 text-xs font-medium">
            Delivery duration
            <div className="relative">
              <Input
                type="number"
                min={1}
                step={1}
                value={deliveryDays}
                disabled={updating}
                onChange={(event) =>
                  setDeliveryDays(Number(event.target.value))
                }
                className="pr-12"
              />
              <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                days
              </span>
            </div>
          </label>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={!termsChanged || updating || !project.contractId}
          onClick={() => void saveTerms()}
        >
          {updating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save terms
        </Button>

        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold">Individual approvals</h3>
          <ApprovalRow
            label="Budget"
            value={`PHP ${project.budget.toLocaleString()}`}
            itemKey="budget"
            approval={approvalMap.get("budget")}
            currentParty={project.currentParty}
            updating={updatingApprovalKey === "budget"}
            onRespond={respondItem}
          />
          <ApprovalRow
            label="Delivery"
            value={
              project.deliveryDays == null
                ? "Not set"
                : `${project.deliveryDays} days`
            }
            itemKey="delivery"
            approval={approvalMap.get("delivery")}
            currentParty={project.currentParty}
            updating={updatingApprovalKey === "delivery"}
            onRespond={respondItem}
          />
          <ApprovalRow
            label="Revisions"
            value={String(project.revisions ?? "Not set")}
            itemKey="revisions"
            approval={approvalMap.get("revisions")}
            currentParty={project.currentParty}
            updating={updatingApprovalKey === "revisions"}
            onRespond={respondItem}
          />
        </div>

        <div className="space-y-3 border-t pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Final client approval</span>
            <Badge variant={clientAccepted ? "secondary" : "outline"}>
              {clientAccepted ? "Agreed" : "Pending"}
            </Badge>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">
              Final freelancer approval
            </span>
            <Badge variant={freelancerAccepted ? "secondary" : "outline"}>
              {freelancerAccepted ? "Agreed" : "Pending"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            disabled={
              updating ||
              mineAccepted ||
              termsChanged ||
              !everyItemApproved ||
              !project.contractId
            }
            onClick={() => void respond(true)}
          >
            <Check className="h-4 w-4" />
            Confirm
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={updating || !project.contractId}
            onClick={() => void respond(false)}
          >
            <X className="h-4 w-4" />
            Disagree
          </Button>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          {bothAccepted
            ? "Both parties confirmed the complete agreement."
            : everyItemApproved
              ? "Every item is approved. Both parties can now confirm."
              : "Every item requires approval from both parties before final confirmation."}
        </p>
      </CardContent>
    </Card>
  );
}
