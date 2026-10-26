export type PublicJobHiringStats = {
  applicantCount: number;
  discussionCount: number;
  connectedCount: number;
  hiredCount: number;
};

export type PublicJobApplicationRow = {
  application_id: string;
  freelancer_id: string;
  status: string;
};

export type PublicJobContractRow = {
  application_id: string | null;
  status: string;
};

export function summarizePublicJobHiring(
  applications: PublicJobApplicationRow[],
  contracts: PublicJobContractRow[],
): PublicJobHiringStats {
  const freelancerByApplication = new Map(
    applications.map((application) => [
      application.application_id,
      application.freelancer_id,
    ]),
  );
  const applicants = new Set(
    applications
      .map((application) => application.freelancer_id)
      .filter(Boolean),
  );
  const connected = new Set(
    applications
      .filter((application) => application.status === "accepted")
      .map((application) => application.freelancer_id)
      .filter(Boolean),
  );
  const hired = new Set<string>();
  for (const contract of contracts) {
    if (
      !contract.application_id ||
      !["active", "completed"].includes(contract.status)
    )
      continue;
    const freelancerId = freelancerByApplication.get(contract.application_id);
    if (freelancerId) hired.add(freelancerId);
  }
  const discussing = new Set(
    [...connected].filter((freelancerId) => !hired.has(freelancerId)),
  );

  return {
    applicantCount: applicants.size,
    discussionCount: discussing.size,
    connectedCount: connected.size,
    hiredCount: hired.size,
  };
}

export async function getPublicJobHiringStats(
  jobId: string,
): Promise<PublicJobHiringStats> {
  const response = await fetch(
    `/api/marketplace/job-stats?jobId=${encodeURIComponent(jobId)}`,
    { cache: "no-store" },
  );
  const result = (await response.json().catch(() => null)) as
    | PublicJobHiringStats
    | { error?: string }
    | null;
  if (!response.ok || !result || !("applicantCount" in result))
    throw new Error(
      result && "error" in result
        ? result.error || "Job activity is unavailable."
        : "Job activity is unavailable.",
    );
  return result;
}
