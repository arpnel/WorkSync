import { supabase } from "@/lib/supabaseClient";
import { databaseError } from "@/services/platform/platformService";
import {
  adminListSchema,
  openingSettingsSchema,
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
export const listAdminAssessments = async (): Promise<AdminAssessment[]> => {
  const rows = parseAssessment(adminListSchema, await admin("list"));
  const openingIds = rows.flatMap((row) => row.openings.map((opening) => opening.id));
  if (!openingIds.length) return rows;

  const settings = parseAssessment(
    openingSettingsSchema,
    await rpc("worksync_skill_assessment_opening_settings", {
      p_openings: openingIds,
    }),
  );
  const settingsById = new Map(settings.map((item) => [item.openingId, item]));
  return rows.map((row) => ({
    ...row,
    openings: row.openings.map((opening) => {
      const setting = settingsById.get(opening.id);
      return setting
        ? {
            ...opening,
            audienceScope: setting.audienceScope,
            minimumAccountAgeDays: setting.minimumAccountAgeDays,
            eligibleCount: setting.eligibleCount,
          }
        : opening;
    }),
  }));
};
export const saveAssessment = (
  categoryId: string,
  expectedVersion: number,
  quiz: Quiz,
) => admin<{ version: number }>("save", { categoryId, expectedVersion, quiz });
export type AssessmentAudienceScope = "category" | "all_freelancers";
export const eligibleCount = (
  categoryId: string,
  audienceScope: AssessmentAudienceScope,
  minimumAccountAgeDays: number,
) =>
  rpc<{ count: number }>("worksync_skill_assessment_eligible_count", {
    p_category: categoryId,
    p_audience_scope: audienceScope,
    p_minimum_account_age_days: minimumAccountAgeDays,
  });
export const openAssessment = (
  categoryId: string,
  expectedVersion: number,
  openingId: string,
  opensAt: string | null,
  closesAt: string,
  audienceScope: AssessmentAudienceScope,
  minimumAccountAgeDays: number,
) =>
  rpc<{ id: string; eligible: number }>("worksync_open_skill_assessment", {
    p_category: categoryId,
    p_expected_version: expectedVersion,
    p_opening: openingId,
    p_opens_at: opensAt,
    p_closes_at: closesAt,
    p_audience_scope: audienceScope,
    p_minimum_account_age_days: minimumAccountAgeDays,
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
