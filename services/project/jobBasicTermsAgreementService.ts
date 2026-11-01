import { supabase } from "@/lib/supabaseClient";

export interface JobBasicTerms {
  projectTitle: string;
  description: string;
  budget: number;
  revisionsCount: number;
  startDate: string;
  deadline: string;
}

export interface JobBasicTermsAgreement {
  terms: JobBasicTerms | null;
  clientAgreed: boolean;
  freelancerAgreed: boolean;
}

function explainRpcError(error: { code?: string; message: string }): Error {
  if (error.code === "PGRST202" || /Could not find the function .*schema cache/i.test(error.message)) {
    return new Error(
      "The basic terms agreement database migration is not installed. Apply supabase/proposed_migrations/worksync_job_basic_terms_agreement.sql, then reload the Supabase API schema cache.",
    );
  }
  return new Error(error.message);
}

function parseAgreement(value: unknown): JobBasicTermsAgreement {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The basic terms agreement response was invalid.");
  }
  const result = value as Record<string, unknown>;
  const rawTerms = result.terms;
  let terms: JobBasicTerms | null = null;
  if (rawTerms && typeof rawTerms === "object" && !Array.isArray(rawTerms)) {
    const raw = rawTerms as Record<string, unknown>;
    if (
      typeof raw.projectTitle !== "string" ||
      typeof raw.description !== "string" ||
      typeof raw.budget !== "number" ||
      typeof raw.revisionsCount !== "number" ||
      typeof raw.startDate !== "string" ||
      typeof raw.deadline !== "string"
    ) {
      throw new Error("The saved basic terms could not be read.");
    }
    terms = {
      projectTitle: raw.projectTitle,
      description: raw.description,
      budget: raw.budget,
      revisionsCount: raw.revisionsCount,
      startDate: raw.startDate,
      deadline: raw.deadline,
    };
  }
  return {
    terms,
    clientAgreed: result.clientAgreed === true,
    freelancerAgreed: result.freelancerAgreed === true,
  };
}

export async function getJobBasicTermsAgreement(
  applicationId: string,
): Promise<JobBasicTermsAgreement> {
  const { data, error } = await supabase.rpc(
    "worksync_get_job_basic_terms_agreement",
    { p_application: applicationId },
  );
  if (error) throw explainRpcError(error);
  return parseAgreement(data);
}

export async function agreeToJobBasicTerms(
  applicationId: string,
  terms: JobBasicTerms,
): Promise<JobBasicTermsAgreement> {
  const { data, error } = await supabase.rpc(
    "worksync_agree_job_basic_terms",
    { p_application: applicationId, p_terms: terms },
  );
  if (error) throw explainRpcError(error);
  return parseAgreement(data);
}
