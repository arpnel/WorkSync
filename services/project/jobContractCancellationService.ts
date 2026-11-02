import { supabase } from "@/lib/supabaseClient";

export type JobContractCancellation = {
  cancellationId: string;
  applicationId: string;
  requestedBy: string;
  reason: string;
  status: "requested" | "accepted" | "rejected";
  response: string | null;
  createdAt: string;
  respondedAt: string | null;
};

export async function getJobContractCancellation(applicationId: string) {
  const { data, error } = await supabase.rpc(
    "worksync_get_job_contract_cancellation",
    { p_application: applicationId },
  );
  if (error) throw new Error(error.message);
  return (data ?? null) as JobContractCancellation | null;
}

export async function requestJobContractCancellation(
  applicationId: string,
  reason: string,
) {
  const { data, error } = await supabase.rpc(
    "worksync_request_job_contract_cancellation",
    { p_application: applicationId, p_reason: reason.trim() },
  );
  if (error) throw new Error(error.message);
  return data as JobContractCancellation;
}

export async function respondToJobContractCancellation(
  cancellationId: string,
  accept: boolean,
  response: string,
) {
  const { data, error } = await supabase.rpc(
    "worksync_respond_job_contract_cancellation",
    {
      p_cancellation: cancellationId,
      p_accept: accept,
      p_response: response.trim(),
    },
  );
  if (error) throw new Error(error.message);
  return data as JobContractCancellation;
}
