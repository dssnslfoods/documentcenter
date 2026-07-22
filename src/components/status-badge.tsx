import { Badge } from "@/components/ui/badge";
import type { ConfidentialityLevel, DocumentStatus, ContractStatus } from "@/lib/types";

const CONF_LABEL: Record<ConfidentialityLevel, string> = {
  public: "สาธารณะภายใน",
  internal: "Internal",
  confidential: "Confidential",
  highly_confidential: "Highly Confidential",
};
const CONF_CLASS: Record<ConfidentialityLevel, string> = {
  public: "badge-public",
  internal: "badge-internal",
  confidential: "badge-confidential",
  highly_confidential: "badge-highly-confidential",
};

export function ConfidentialityBadge({ level }: { level: ConfidentialityLevel }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CONF_CLASS[level]}`}>
      {CONF_LABEL[level]}
    </span>
  );
}

const DOC_STATUS: Record<DocumentStatus, { label: string; cls: string }> = {
  draft: { label: "ร่าง", cls: "bg-muted text-muted-foreground" },
  under_review: { label: "กำลังตรวจสอบ", cls: "bg-info/15 text-info" },
  approved: { label: "อนุมัติแล้ว", cls: "bg-success/15 text-success" },
  active: { label: "ใช้งาน", cls: "bg-success/15 text-success" },
  expired: { label: "หมดอายุ", cls: "bg-destructive/15 text-destructive" },
  archived: { label: "จัดเก็บ", cls: "bg-muted text-muted-foreground" },
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const s = DOC_STATUS[status] ?? DOC_STATUS.draft;
  return <Badge className={`${s.cls} border-0`}>{s.label}</Badge>;
}

const CONTRACT_STATUS: Record<ContractStatus, { label: string; cls: string }> = {
  draft: { label: "ร่าง", cls: "bg-muted text-muted-foreground" },
  under_review: { label: "กำลังตรวจ", cls: "bg-info/15 text-info" },
  pending_approval: { label: "รออนุมัติ", cls: "bg-warning/20 text-warning-foreground" },
  pending_signature: { label: "รอลงนาม", cls: "bg-warning/20 text-warning-foreground" },
  active: { label: "มีผลบังคับใช้", cls: "bg-success/15 text-success" },
  near_expiry: { label: "ใกล้หมดอายุ", cls: "bg-warning/25 text-warning-foreground" },
  renewal_in_progress: { label: "กำลังต่ออายุ", cls: "bg-info/15 text-info" },
  expired: { label: "หมดอายุ", cls: "bg-destructive/15 text-destructive" },
  terminated: { label: "ยกเลิก", cls: "bg-destructive/15 text-destructive" },
  archived: { label: "จัดเก็บ", cls: "bg-muted text-muted-foreground" },
};

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const s = CONTRACT_STATUS[status] ?? CONTRACT_STATUS.draft;
  return <Badge className={`${s.cls} border-0`}>{s.label}</Badge>;
}

const QUOTATION_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "ร่าง", cls: "bg-muted text-muted-foreground" },
  submitted: { label: "ยื่นแล้ว", cls: "bg-info/15 text-info" },
  under_review: { label: "กำลังตรวจ", cls: "bg-info/15 text-info" },
  negotiation: { label: "เจรจา", cls: "bg-warning/20 text-warning-foreground" },
  approved: { label: "อนุมัติ", cls: "bg-success/15 text-success" },
  rejected: { label: "ปฏิเสธ", cls: "bg-destructive/15 text-destructive" },
  won: { label: "ชนะงาน", cls: "bg-success/15 text-success" },
  lost: { label: "แพ้งาน", cls: "bg-destructive/15 text-destructive" },
  expired: { label: "หมดอายุ", cls: "bg-destructive/15 text-destructive" },
  converted_to_contract: { label: "แปลงเป็นสัญญา", cls: "bg-primary/15 text-primary" },
  converted_to_po: { label: "แปลงเป็น PO", cls: "bg-primary/15 text-primary" },
};

export function QuotationStatusBadge({ status }: { status: string }) {
  const s = QUOTATION_STATUS[status] ?? QUOTATION_STATUS.draft;
  return <Badge className={`${s.cls} border-0`}>{s.label}</Badge>;
}

const PROCUREMENT_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "ร่าง", cls: "bg-muted text-muted-foreground" },
  request_submitted: { label: "ยื่นคำขอ", cls: "bg-info/15 text-info" },
  under_review: { label: "กำลังตรวจ", cls: "bg-info/15 text-info" },
  rfq: { label: "RFQ", cls: "bg-info/15 text-info" },
  vendor_comparison: { label: "เปรียบเทียบผู้ขาย", cls: "bg-info/15 text-info" },
  pending_approval: { label: "รออนุมัติ", cls: "bg-warning/20 text-warning-foreground" },
  approved: { label: "อนุมัติแล้ว", cls: "bg-success/15 text-success" },
  contracting: { label: "ทำสัญญา", cls: "bg-info/15 text-info" },
  in_progress: { label: "กำลังดำเนินการ", cls: "bg-info/15 text-info" },
  delivered: { label: "ส่งมอบแล้ว", cls: "bg-success/15 text-success" },
  inspection_pending: { label: "รอตรวจรับ", cls: "bg-warning/20 text-warning-foreground" },
  completed: { label: "เสร็จสิ้น", cls: "bg-success/15 text-success" },
  cancelled: { label: "ยกเลิก", cls: "bg-destructive/15 text-destructive" },
  overdue: { label: "เกินกำหนด", cls: "bg-destructive/15 text-destructive" },
};

export function ProcurementStatusBadge({ status }: { status: string }) {
  const s = PROCUREMENT_STATUS[status] ?? PROCUREMENT_STATUS.draft;
  return <Badge className={`${s.cls} border-0`}>{s.label}</Badge>;
}

export const QUOTATION_STATUS_OPTIONS = QUOTATION_STATUS;
export const PROCUREMENT_STATUS_OPTIONS = PROCUREMENT_STATUS;
export const CONTRACT_STATUS_OPTIONS = CONTRACT_STATUS;
