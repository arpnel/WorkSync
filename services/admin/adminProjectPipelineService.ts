import { z } from "zod";
import { platformAction } from "@/services/platform/platformService";
import { supabase } from "@/lib/supabaseClient";

const pipelineRowSchema = z.object({
  record_id: z.string().uuid(),
  record_type: z.enum(["application", "service_order"]),
  title: z.string(),
  phase: z.enum(["In discussion", "Agreement pending", "Contract"]),
  status: z.string(),
  contract_status: z.string().nullable(),
  client_name: z.string(),
  freelancer_name: z.string(),
  budget: z.union([z.number(), z.string()]).nullable(),
  work_description: z.string().nullable().optional(),
  proposal: z.string().nullable().optional(),
  proposed_plan: z.unknown().nullable().optional(),
  contract_terms: z.string().nullable().optional(),
  delivery_days: z.number().nullable().optional(),
  revisions: z.number().nullable().optional(),
  contract_created_at: z.string().nullable().optional(),
  contract_updated_at: z.string().nullable().optional(),
  client_signed_at: z.string().nullable().optional(),
  freelancer_signed_at: z.string().nullable().optional(),
  current_version: z.number().nullable().optional(),
  client_signed_version: z.number().nullable().optional(),
  freelancer_signed_version: z.number().nullable().optional(),
  milestones: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().nullable(),
        amount: z.union([z.number(), z.string()]).nullable(),
        due_date: z.string().nullable(),
      }),
    )
    .optional(),
  created_at: z.string().nullable(),
});

export type AdminProjectPipelineRow = z.infer<typeof pipelineRowSchema>;

export async function getAdminProjectPipeline() {
  const { data, error } = await supabase.rpc("worksync_admin_project_pipeline");
  if (error)
    throw new Error(
      `Unable to load contract and discussion records (${error.code || "unknown"}): ${error.message}`,
    );
  const rows = z.array(pipelineRowSchema).safeParse(data);
  if (!rows.success)
    throw new Error(
      "Contract and discussion records returned an incompatible response.",
    );
  return rows.data.map((row) => ({
    ...row,
    phase: row.phase === "Contract" ? "Agreement pending" : row.phase,
  }));
}

export async function cancelAdminProjectPipelineRecord(
  row: Pick<AdminProjectPipelineRow, "record_id" | "record_type">,
  reason: string,
) {
  return platformAction("worksync_admin_cancel_preproject_work", {
    p_record_type: row.record_type,
    p_record: row.record_id,
    p_notes: reason.trim(),
  });
}
