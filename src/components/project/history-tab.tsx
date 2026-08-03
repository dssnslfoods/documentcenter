import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Loader2, PlusCircle, PencilLine, Trash2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";
import { fmtDateTime, fmtCurrency } from "@/lib/format";
import { LIFECYCLE_LABEL } from "@/lib/project-lifecycle";
import { useCanSeeMoney, MONEY_MASK } from "@/hooks/use-page-access";

type Change = { field: string; old: unknown; new: unknown };
type HistoryRow = {
  id: string;
  action: string;
  changes: Change[] | null;
  created_at: string;
  changed_by: string | null;
  entity: string | null;
  entity_id: string | null;
  entity_label: string | null;
};

const ENTITY_LABEL: Record<string, string> = {
  project: "รายละเอียดโครงการ",
  project_documents: "เอกสาร/ไฟล์แนบ",
  project_spec_notes: "RFQ / Spec",
  project_milestones: "งวดงาน",
  project_tasks: "แผนงาน (Timeline)",
  project_members: "สมาชิกโครงการ",
  supplier_quotations: "ใบเสนอราคา Supplier",
  customer_quotations: "ใบเสนอราคาลูกค้า",
};

const ACTION_LABEL: Record<string, string> = {
  create: "เพิ่ม",
  update: "แก้ไข",
  delete: "ลบ",
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
  // ตารางลูก
  document_name: "ชื่อไฟล์",
  file_url: "ไฟล์",
  document_type: "ประเภทเอกสาร",
  title: "หัวข้อ",
  content: "เนื้อหา",
  note_type: "ประเภทบันทึก",
  due_date: "กำหนดส่ง",
  amount: "จำนวนเงิน",
  payment_percent: "สัดส่วนการวางบิล (%)",
  deliverables: "รายละเอียดการส่งมอบ",
  quotation_amount: "ยอดใบเสนอราคา",
  amount_incl_vat: "ยอดรวม VAT",
  is_final: "เป็นฉบับสุดท้าย (Final)",
  submitted_date: "วันที่ยื่น",
  supplier_id: "คู่ค้า",
  partner_id: "คู่ค้า/ลูกค้า",
  user_id: "ผู้ใช้",
  role_title: "ตำแหน่งในโครงการ",
  project_role: "บทบาทในโครงการ",
  responsibilities: "หน้าที่รับผิดชอบ",
  assignee_label: "ผู้รับผิดชอบ",
  start_date_plan: "วันเริ่ม (แผน)",
  end_date_plan: "วันสิ้นสุด (แผน)",
  notes: "หมายเหตุ",
};

const MONEY_FIELDS = new Set([
  "contract_value",
  "budget",
  "vat_amount",
  "contract_value_incl_vat",
  "amount",
  "quotation_amount",
  "amount_incl_vat",
  "payment_value",
]);

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
  const { canSeeMoney } = useCanSeeMoney();

  const { data, isLoading, error } = useQuery({
    queryKey: ["project-history", projectId],
    queryFn: async () => {
      const { data: rows, error: err } = await sb
        .from("project_history")
        .select("id, action, changes, created_at, changed_by, entity, entity_id, entity_label")
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

  const [q, setQ] = useState("");
  const [entity, setEntity] = useState<string>("all");

  const entities = useMemo(
    () => Array.from(new Set((data ?? []).map((h) => h.entity || "project"))),
    [data],
  );

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((h) => {
      const e = h.entity || "project";
      if (entity !== "all" && e !== entity) return false;
      if (!s) return true;
      const hay = [
        h.editor,
        h.entity_label ?? "",
        ENTITY_LABEL[e] ?? e,
        ...(h.changes ?? []).flatMap((c) => [
          FIELD_LABEL[c.field] ?? c.field,
          renderValue(c.field, c.old),
          renderValue(c.field, c.new),
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [data, q, entity]);

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
        ยังไม่ได้ติดตั้งตารางประวัติการแก้ไข — กรุณารันไฟล์ <code className="font-mono">db/0039_detailed_project_history.sql</code> ใน SQL Editor ของฐานข้อมูลก่อน
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
        <p className="text-xs text-muted-foreground">
          บันทึกทุกการเปลี่ยนแปลงในโครงการ (รายละเอียดโครงการ, เอกสาร, RFQ/Spec, ใบเสนอราคา, งวดงาน, แผนงาน, สมาชิก) พร้อมผู้แก้ไข เวลา และค่าก่อน/หลัง
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อผู้แก้ไข, ฟิลด์ หรือค่า..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {["all", ...entities].map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEntity(e)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                entity === e ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
              }`}
            >
              {e === "all" ? "ทั้งหมด" : (ENTITY_LABEL[e] ?? e)}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 && (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          ไม่พบรายการที่ตรงกับเงื่อนไข
        </div>
      )}

      <ol className="relative space-y-5 border-l pl-6">
        {rows.map((h) => (
          <li key={h.id} className="relative">
            <span className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full border bg-card">
              {h.action === "create" ? (
                <PlusCircle className="h-3 w-3 text-success" />
              ) : h.action === "delete" ? (
                <Trash2 className="h-3 w-3 text-destructive" />
              ) : (
                <PencilLine className="h-3 w-3 text-primary" />
              )}
            </span>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{h.editor}</span>
              <span>·</span>
              <span>{fmtDateTime(h.created_at)}</span>
              <Badge variant="outline" className="text-[10px]">
                {ACTION_LABEL[h.action] ?? h.action} · {ENTITY_LABEL[h.entity || "project"] ?? h.entity}
              </Badge>
              {h.entity_label && (
                <span className="max-w-full truncate font-medium text-foreground">“{h.entity_label}”</span>
              )}
            </div>

            {(h.changes?.length ?? 0) > 0 && (

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
                          {renderValue(c.field, c.old, canSeeMoney)}
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">{renderValue(c.field, c.new, canSeeMoney)}</td>
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
