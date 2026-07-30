import { useQuery } from "@tanstack/react-query";
import { History, Loader2, PlusCircle, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";
import { fmtDateTime, fmtCurrency } from "@/lib/format";
import { LIFECYCLE_LABEL } from "@/lib/project-lifecycle";

type Change = { field: string; old: unknown; new: unknown };
type HistoryRow = {
  id: string;
  action: string;
  changes: Change[] | null;
  created_at: string;
  changed_by: string | null;
};

const FIELD_LABEL: Record<string, string> = {
  name: "ชื่อโครงการ",
  code: "รหัสโครงการ",
  description: "รายละเอียด",
  status: "สถานะโครงการ",
  customer_name: "ชื่อลูกค้า",
  customer_id: "ลูกค้า (master)",
  project_type: "ประเภทงาน",
  start_date: "วันเริ่ม",
  end_date: "วันสิ้นสุด",
  contract_value: "มูลค่าสัญญา (ก่อน VAT)",
  budget: "งบประมาณ",
  vat_rate: "อัตรา VAT (%)",
  vat_amount: "ยอด VAT",
  contract_value_incl_vat: "มูลค่ารวม VAT",
  is_inhouse: "งานผลิตภายใน",
  progress: "ความคืบหน้า (%)",
  department_id: "แผนก",
  archived_at: "วันที่จัดเก็บ",
};

const MONEY_FIELDS = new Set(["contract_value", "budget", "vat_amount", "contract_value_incl_vat"]);

function renderValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่ใช่";
  if (field === "status" && typeof v === "string")
    return LIFECYCLE_LABEL[v as keyof typeof LIFECYCLE_LABEL] ?? v;
  if (MONEY_FIELDS.has(field)) return fmtCurrency(Number(v), "THB");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function ProjectHistoryTab({ projectId }: { projectId: string }) {
  const sb = getSupabase();

  const { data, isLoading, error } = useQuery({
    queryKey: ["project-history", projectId],
    queryFn: async () => {
      const { data: rows, error: err } = await sb
        .from("project_history")
        .select("id, action, changes, created_at, changed_by")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (err) throw err;
      const list = (rows ?? []) as HistoryRow[];
      const ids = Array.from(new Set(list.map((r) => r.changed_by).filter(Boolean))) as string[];
      let names: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
        names = Object.fromEntries(
          (profs ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
            p.id,
            p.full_name || p.email || "ผู้ใช้",
          ]),
        );
      }
      return list.map((r) => ({ ...r, editor: r.changed_by ? (names[r.changed_by] ?? "ผู้ใช้") : "ระบบ" }));
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
        ยังไม่ได้ติดตั้งตารางประวัติการแก้ไข — กรุณารันไฟล์ <code className="font-mono">db/0024_project_history.sql</code> ใน SQL Editor ของฐานข้อมูลก่อน
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/30 py-16 text-sm text-muted-foreground">
        <History className="h-6 w-6" />
        ยังไม่มีประวัติการแก้ไข
      </div>
    );
  }

  return (
    <div className="tile p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">ประวัติการแก้ไขโครงการ</h3>
        <p className="text-xs text-muted-foreground">ทุกครั้งที่มีการแก้ไข ระบบจะบันทึกว่าใครแก้ไข เมื่อไหร่ และเปลี่ยนค่าอะไรบ้าง</p>
      </div>

      <ol className="relative space-y-5 border-l pl-6">
        {data.map((h) => (
          <li key={h.id} className="relative">
            <span className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full border bg-card">
              {h.action === "create" ? (
                <PlusCircle className="h-3 w-3 text-success" />
              ) : (
                <PencilLine className="h-3 w-3 text-primary" />
              )}
            </span>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{h.editor}</span>
              <span>·</span>
              <span>{fmtDateTime(h.created_at)}</span>
              <Badge variant="outline" className="text-[10px]">
                {h.action === "create" ? "สร้างโครงการ" : "แก้ไข"}
              </Badge>
            </div>

            {h.action !== "create" && (h.changes?.length ?? 0) > 0 && (
              <div className="mt-2 overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">ฟิลด์</th>
                      <th className="px-3 py-2">ค่าเดิม</th>
                      <th className="px-3 py-2">ค่าใหม่</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(h.changes ?? []).map((c, i) => (
                      <tr key={`${h.id}-${c.field}-${i}`} className="border-t">
                        <td className="px-3 py-2 font-medium">{FIELD_LABEL[c.field] ?? c.field}</td>
                        <td className="px-3 py-2 text-muted-foreground line-through decoration-muted-foreground/40">
                          {renderValue(c.field, c.old)}
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">{renderValue(c.field, c.new)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
