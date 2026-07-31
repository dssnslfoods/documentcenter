import { getSupabase } from "@/lib/supabase";

export type FinalQuotationSummary = {
  hasQuotations: boolean;
  final: {
    id: string;
    quotation_amount: number | null;
    vat_rate: number | null;
    vat_amount: number | null;
    amount_incl_vat: number | null;
    submitted_date: string | null;
  } | null;
};

/**
 * Reads the customer quotations of a project and pushes the FINAL one's amounts
 * into the project record (contract value is derived, never typed by hand).
 * When there is no final quotation, the contract value is cleared.
 */
export async function syncContractValueFromFinalQuotation(projectId: string): Promise<FinalQuotationSummary> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("customer_quotations")
    .select("id, quotation_amount, vat_rate, vat_amount, amount_incl_vat, submitted_date, is_final")
    .eq("project_id", projectId);
  if (error) throw error;

  const rows = data ?? [];
  const final = rows.find((r) => r.is_final) ?? null;

  const patch = final
    ? {
        contract_value: final.quotation_amount,
        budget: final.quotation_amount,
        vat_rate: final.vat_rate,
        vat_amount: final.vat_amount,
        contract_value_incl_vat: final.amount_incl_vat,
      }
    : {
        contract_value: null,
        budget: null,
        vat_rate: null,
        vat_amount: null,
        contract_value_incl_vat: null,
      };

  await sb.from("projects").update(patch).eq("id", projectId);

  return {
    hasQuotations: rows.length > 0,
    final: final
      ? {
          id: final.id,
          quotation_amount: final.quotation_amount,
          vat_rate: final.vat_rate,
          vat_amount: final.vat_amount,
          amount_incl_vat: final.amount_incl_vat,
          submitted_date: final.submitted_date,
        }
      : null,
  };
}

/** Read-only view of the quotation state used for banners/labels. */
export async function fetchFinalQuotationSummary(projectId: string): Promise<FinalQuotationSummary> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("customer_quotations")
    .select("id, quotation_amount, vat_rate, vat_amount, amount_incl_vat, submitted_date, is_final")
    .eq("project_id", projectId);
  if (error) throw error;
  const rows = data ?? [];
  const final = rows.find((r) => r.is_final) ?? null;
  return { hasQuotations: rows.length > 0, final };
}
