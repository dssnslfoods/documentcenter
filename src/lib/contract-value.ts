import { getSupabase } from "@/lib/supabase";

export type FinalQuotationSummary = {
  hasQuotations: boolean;
  /** จำนวนใบเสนอราคาที่ถูกกำหนดเป็น Final (มีได้มากกว่า 1 ใบ) */
  finalCount: number;
  /** ยอดรวมของใบเสนอราคา Final ทั้งหมด (ใช้เป็นมูลค่าสัญญา) */
  final: {
    id: string;
    quotation_amount: number | null;
    vat_rate: number | null;
    vat_amount: number | null;
    amount_incl_vat: number | null;
    submitted_date: string | null;
  } | null;
};

type CqRow = {
  id: string;
  quotation_amount: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  amount_incl_vat: number | null;
  submitted_date: string | null;
  is_final: boolean;
};

/** รวมใบเสนอราคา Final ทั้งหมดให้เป็นยอดเดียวสำหรับมูลค่าสัญญา */
function aggregate(rows: CqRow[]): FinalQuotationSummary {
  const finals = rows.filter((r) => r.is_final);
  if (finals.length === 0) return { hasQuotations: rows.length > 0, finalCount: 0, final: null };

  const amount = finals.reduce((s, r) => s + Number(r.quotation_amount ?? 0), 0);
  const vatAmount = finals.reduce((s, r) => s + Number(r.vat_amount ?? 0), 0);
  const inclVat = finals.reduce(
    (s, r) => s + Number(r.amount_incl_vat ?? r.quotation_amount ?? 0),
    0,
  );
  const latest = finals
    .map((r) => r.submitted_date)
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  return {
    hasQuotations: rows.length > 0,
    finalCount: finals.length,
    final: {
      id: finals[0].id,
      quotation_amount: amount,
      // ถ้าอัตรา VAT เท่ากันทุกใบ ใช้ค่านั้น มิฉะนั้นคำนวณย้อนกลับจากยอดรวม
      vat_rate:
        finals.every((r) => Number(r.vat_rate ?? 0) === Number(finals[0].vat_rate ?? 0))
          ? finals[0].vat_rate
          : amount > 0
            ? Math.round((vatAmount / amount) * 10000) / 100
            : 0,
      vat_amount: vatAmount,
      amount_incl_vat: inclVat,
      submitted_date: latest,
    },
  };
}

/**
 * Reads the customer quotations of a project and pushes the FINAL ones' totals
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

  const summary = aggregate((data ?? []) as CqRow[]);
  const final = summary.final;

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

  const { data: updated, error: updateError } = await sb.from("projects").update(patch).eq("id", projectId).select("id");
  if (updateError) throw updateError;
  if (!updated?.length) throw new Error("ไม่มีสิทธิ์อัปเดตมูลค่าสัญญาของโครงการ (เฉพาะผู้บริหารโครงการ)");

  return summary;
}

/** Read-only view of the quotation state used for banners/labels. */
export async function fetchFinalQuotationSummary(projectId: string): Promise<FinalQuotationSummary> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("customer_quotations")
    .select("id, quotation_amount, vat_rate, vat_amount, amount_incl_vat, submitted_date, is_final")
    .eq("project_id", projectId);
  if (error) throw error;
  return aggregate((data ?? []) as CqRow[]);
}
