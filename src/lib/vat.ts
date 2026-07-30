import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";

export type VatRate = {
  id: string;
  code: string;
  label: string;
  rate: number;
  is_default: boolean;
};

/** Master data VAT rates (active only). */
export function useVatRates() {
  return useQuery({
    queryKey: ["vat-rates"],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("vat_rates")
        .select("id, code, label, rate, is_default")
        .eq("is_active", true)
        .order("sort_order");
      if (error) return [] as VatRate[];
      return (data ?? []) as VatRate[];
    },
  });
}

/** All amounts entered in the system are BEFORE VAT. */
export function calcVat(amountBeforeVat: number, ratePercent: number) {
  const base = Number.isFinite(amountBeforeVat) ? amountBeforeVat : 0;
  const pct = Number.isFinite(ratePercent) ? ratePercent : 0;
  const vatAmount = Math.round(base * pct) / 100;
  const total = Math.round((base + vatAmount) * 100) / 100;
  return { base, pct, vatAmount, total };
}

export function pickVatRate(rates: VatRate[] | undefined, selectedId: string | undefined) {
  const list = rates ?? [];
  if (selectedId === "none") return undefined;
  return list.find((v) => v.id === selectedId) ?? list.find((v) => v.is_default);
}

export function fmtNum(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
