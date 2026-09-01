"use client";

import * as React from "react";

export type AgreementStatus =
  | "pending"
  | "accepted"
  | "rejected";

export interface UseProjectAgreementReturn {
  clientStatus: AgreementStatus;

  freelancerStatus: AgreementStatus;

  bothAccepted: boolean;

  agreementAccepted: boolean;

  isPending: boolean;

  isRejected: boolean;

  acceptClientAgreement: () => void;

  acceptFreelancerAgreement: () => void;

  rejectClientAgreement: () => void;

  rejectFreelancerAgreement: () => void;

  resetAgreement: () => void;
}

export function useProjectAgreement(): UseProjectAgreementReturn {
  const [clientStatus, setClientStatus] =
    React.useState<AgreementStatus>(
      "pending"
    );

  const [
    freelancerStatus,
    setFreelancerStatus,
  ] =
    React.useState<AgreementStatus>(
      "pending"
    );

  const bothAccepted =
    clientStatus === "accepted" &&
    freelancerStatus === "accepted";

  const agreementAccepted =
    bothAccepted;

  const isPending =
    clientStatus === "pending" ||
    freelancerStatus === "pending";

  const isRejected =
    clientStatus === "rejected" ||
    freelancerStatus === "rejected";

  const acceptClientAgreement =
    React.useCallback(() => {
      setClientStatus("accepted");
    }, []);

  const acceptFreelancerAgreement =
    React.useCallback(() => {
      setFreelancerStatus(
        "accepted"
      );
    }, []);

  const rejectClientAgreement =
    React.useCallback(() => {
      setClientStatus("rejected");
    }, []);

  const rejectFreelancerAgreement =
    React.useCallback(() => {
      setFreelancerStatus(
        "rejected"
      );
    }, []);

  const resetAgreement =
    React.useCallback(() => {
      setClientStatus("pending");
      setFreelancerStatus("pending");
    }, []);

  return {
    clientStatus,
    freelancerStatus,

    bothAccepted,
    agreementAccepted,

    isPending,
    isRejected,

    acceptClientAgreement,
    acceptFreelancerAgreement,

    rejectClientAgreement,
    rejectFreelancerAgreement,

    resetAgreement,
  };
}

export default useProjectAgreement;