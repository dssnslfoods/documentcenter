import { useQuery } from "@tanstack/react-query";
import { Star, Download, FileSpreadsheet } from "lucide-react";
import { FilePreviewButton } from "@/components/project/file-preview-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtCurrency } from "@/lib/format";
import { getProjectFileUrl } from "@/lib/project-files";

type Row = {
  id: string;
  quotation_amount: number | null;
  submitted_date: string | null;
  notes: string | null;
  file_url: string | null;
  vat_rate: number | null;
  amount_incl_vat: number | null;
};

/** Shows the customer quotation marked as Final in the "ยื่นข้อเสนอลูกค้า" step. */
export function FinalCustomerQuotation({
  projectId,
  canSeePrice = true,
}: {
  projectId: string;
  canSeePrice?: boolean;
}) {
  const sb = getSupabase();
  const { data, isLoading } = useQuery({
    queryKey: ["customer-quotation-final", projectId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("customer_quotations")
        .select("id, quotation_amount, submitted_date, notes, file_url, vat_rate, amount_incl_vat")
        .eq("project_id", projectId)
        .eq("is_final", true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Row | null;
    },
  });

  const openFile = async (path: string) => {
    const url = await getProjectFileUrl(path);
    if (url) window.open(url, "_blank");
  };

  if (isLoading) {
    return <div className="py-4 text-center text-sm text-muted-foreground">กำลังโหลด...</div>;
  }
  if (!data) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        ยังไม่ได้เลือกใบเสนอราคาฉบับสุดท้ายในขั้นตอน "ยื่นข้อเสนอลูกค้า"
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-lg border border-primary p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Star className="h-5 w-5 fill-current" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">ใบเสนอราคาที่เลือก</span>
          <Badge className="bg-primary/15 text-primary">Final</Badge>
        </div>
        <div className="text-xs text-muted-foreground">ส่งเมื่อ {fmtDate(data.submitted_date)}</div>
        {data.notes && <p className="mt-1 text-sm">{data.notes}</p>}
      </div>
      <div className="text-right">
        <div className="text-lg font-semibold tabular-nums">
          {canSeePrice ? fmtCurrency(data.quotation_amount, "THB") : "฿ ••••••"}
        </div>
        {canSeePrice && (
          <div className="text-xs text-muted-foreground tabular-nums">
            ก่อน VAT · VAT {Number(data.vat_rate ?? 0).toFixed(2)}% ={" "}
            {fmtCurrency(data.amount_incl_vat ?? data.quotation_amount, "THB")} (สุทธิ)
          </div>
        )}
      </div>
      {data.file_url ? (
        <div className="flex gap-1">
          <FilePreviewButton path={data.file_url} label="ดูใบเสนอราคา" />
          <Button size="sm" variant="outline" onClick={() => openFile(data.file_url!)} title="ดาวน์โหลด">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}
