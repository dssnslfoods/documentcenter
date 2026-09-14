import { getSupabase } from "@/lib/supabase";

/**
 * Money columns on projects / project_milestones are not selectable directly (db/0058).
 * These RPCs return them only for projects the caller may see money for
 * (super_admin, management, or project exec) — other projects are simply omitted.
 */

export type ProjectFinancials = {
  project_id: string;
  budget: number | null;
  contract_value: number | null;
  vat_amount: number | null;
  contract_value_incl_vat: number | null;
};

/** Non-money columns of projects that authenticated users may select. */
export const PROJECT_COLUMNS =
  "id, code, name, description, department_id, owner_id, start_date, end_date, status, created_at, updated_at, progress, created_by, updated_by, archived_at, customer_name, project_type, lost_reason, completion_comment, is_inhouse, vat_rate, customer_id, customer_aka, customer_aka_color, health_status, health_reason, organization_id";

export async function fetchProjectFinancials(projectIds: string[]): Promise<Map<string, ProjectFinancials>> {
  const map = new Map<string, ProjectFinancials>();
  if (!projectIds.length) return map;
  const { data, error } = await getSupabase().rpc("project_financials", { _project_ids: projectIds });
  if (error) throw error;
  for (const row of (data ?? []) as ProjectFinancials[]) {
    map.set(row.project_id, {
      ...row,
      budget: row.budget == null ? null : Number(row.budget),
      contract_value: row.contract_value == null ? null : Number(row.contract_value),
      vat_amount: row.vat_amount == null ? null : Number(row.vat_amount),
      contract_value_incl_vat: row.contract_value_incl_vat == null ? null : Number(row.contract_value_incl_vat),
    });
  }
  return map;
}

const EMPTY_FINANCIALS = { budget: null, contract_value: null, vat_amount: null, contract_value_incl_vat: null };

/** Merge financials into project rows (null money for projects the caller can't see). */
export async function withFinancials<T extends { id: string }>(rows: T[]) {
  const fin = await fetchProjectFinancials(rows.map((r) => r.id));
  return rows.map((r) => {
    const f = fin.get(r.id);
    return { ...r, ...EMPTY_FINANCIALS, ...(f ? { budget: f.budget, contract_value: f.contract_value, vat_amount: f.vat_amount, contract_value_incl_vat: f.contract_value_incl_vat } : {}) };
  });
}

/** payment_value per milestone id, for callers allowed to see project money. */
export async function fetchMilestonePayments(projectId: string): Promise<Map<string, number>> {
  const { data, error } = await getSupabase().rpc("project_milestone_payments", { _project_id: projectId });
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; payment_value: number }[]).map((r) => [r.id, Number(r.payment_value)]));
}
