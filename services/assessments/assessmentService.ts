import { supabase } from "@/lib/supabaseClient";
import { databaseError } from "@/services/platform/platformService";
import {
  adminListSchema,
  memberListSchema,
  evidenceSchema,
  resultsSchema,
  attemptSchema,
  parseAssessment,
} from "@/lib/assessments/contracts";
import type {
  AdminAssessment,
  AssessmentEvidence,
  AttemptResponse,
  MemberAssessment,
  OpeningResults,
  Quiz,
} from "@/lib/assessments/types";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw databaseError(error);
  if (data === null) throw new Error("Assessment response is unavailable.");
  return data as T;
}
const admin = <T>(action: string, payload: Record<string, unknown> = {}) =>
  rpc<T>("worksync_skill_assessment_admin", {
    p_action: action,
    p_payload: payload,
  });
export const listAdminAssessments = async (): Promise<AdminAssessment[]> =>
  parseAssessment(adminListSchema, await admin("list"));
export const saveAssessment = (
  categoryId: string,
  expectedVersion: number,
  quiz: Quiz,
) => admin<{ version: number }>("save", { categoryId, expectedVersion, quiz });
export const eligibleCount = (categoryId: string) =>
  admin<{ count: number }>("eligible", { categoryId });
export const openAssessment = (
  categoryId: string,
  expectedVersion: number,
  openingId: string,
  opensAt: string | null,
  closesAt: string,
) =>
  admin<{ id: string }>("open", {
    categoryId,
    expectedVersion,
    openingId,
    opensAt,
    closesAt,
  });
export const closeAssessment = (openingId: string) =>
  admin("close", { openingId });
export const assessmentResults = async (
  openingId: string,
): Promise<OpeningResults> =>
  parseAssessment(resultsSchema, await admin("results", { openingId }));
export const listMyAssessments = async (): Promise<MemberAssessment[]> =>
  parseAssessment(
    memberListSchema,
    await rpc("worksync_skill_assessment_member", {
      p_action: "list",
    }),
  );
export const assessmentAttempt = async (
  action: "start" | "save" | "submit",
  openingId: string,
  answers: Record<string, string[]> = {},
): Promise<AttemptResponse> =>
  parseAssessment(
    attemptSchema,
    await rpc("worksync_skill_assessment_member", {
      p_action: action,
      p_opening: openingId,
      p_answers: answers,
    }),
  );
export const getAssessmentEvidence = async (
  userId: string,
): Promise<AssessmentEvidence[]> =>
  parseAssessment(
    evidenceSchema,
    await rpc("worksync_skill_assessment_evidence", {
      p_user: userId,
    }),
  );
