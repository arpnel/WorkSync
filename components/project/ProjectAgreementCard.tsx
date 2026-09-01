"use client";

import { useState } from "react";
import { Check, Loader2, Save, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ProjectWorkspace } from "@/types/project/projectWorkspace";

type Props = {
  project: ProjectWorkspace;
  updating: boolean;
  onRespond: (accepted: boolean) => Promise<boolean>;
  onSaveTerms: (budget: number, deliveryDays: number) => Promise<boolean>;
};

export function ProjectAgreementCard({
  project,
  updating,
  onRespond,
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

  const respond = async (accepted: boolean) => {
    const saved = await onRespond(accepted);
    if (saved) {
      toast.success(
        accepted
          ? "Your agreement was recorded."
          : "The agreement was reset for both parties.",
      );
    } else {
      toast.error("The agreement could not be updated.");
    }
  };

  const saveTerms = async () => {
    const saved = await onSaveTerms(budget, deliveryDays);
    if (saved) {
      toast.success("Terms updated. Both parties must agree again.");
    } else {
      toast.error("The project terms could not be updated.");
    }
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <label className="space-y-1.5 text-xs font-medium">
            Agreed budget
            <div className="relative">
              <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
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

        <div className="space-y-2 border-t pt-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Client</span>
            <Badge variant={clientAccepted ? "secondary" : "outline"}>
              {clientAccepted ? "Agreed" : "Pending"}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Freelancer</span>
            <Badge variant={freelancerAccepted ? "secondary" : "outline"}>
              {freelancerAccepted ? "Agreed" : "Pending"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            disabled={
              updating || mineAccepted || termsChanged || !project.contractId
            }
            onClick={() => void respond(true)}
          >
            <Check className="h-4 w-4" />
            Agree
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
            ? "Both parties agreed. Changing the terms or disagreeing resets both approvals."
            : mineAccepted
              ? "You agreed. Waiting for the other party."
              : "Both parties must agree before the agreement is complete."}
        </p>
      </CardContent>
    </Card>
  );
}
