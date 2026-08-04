// Project lifecycle constants & helpers

export type ProjectLifecycleStatus =
  | "draft"
  | "rfq_sent"
  | "quotation_received"
  | "proposal_submitted"
  | "won"
  | "lost"
  | "in_progress"
  | "completed";

export const LIFECYCLE_LABEL: Record<ProjectLifecycleStatus, string> = {
  draft: "ร่างโครงการ",
  rfq_sent: "ส่ง RFQ",
  quotation_received: "รับใบเสนอราคา Supplier",
  proposal_submitted: "ยื่นข้อเสนอลูกค้า",
  won: "ชนะงาน",
  lost: "แพ้งาน",
  in_progress: "ดำเนินโครงการ",
  completed: "ปิดโครงการ",
};

// 7 stepper phases (won/lost is a branch on phase 4)
export const LIFECYCLE_PHASES: {
  key: ProjectLifecycleStatus;
  label: string;
  short: string;
}[] = [
  { key: "draft", label: "ร่างโครงการ", short: "Draft" },
  { key: "rfq_sent", label: "ส่ง RFQ / Spec", short: "RFQ" },
  { key: "quotation_received", label: "รับใบเสนอราคา", short: "Supplier" },
  { key: "proposal_submitted", label: "ยื่นข้อเสนอ", short: "Proposal" },
  { key: "won", label: "ผลการเสนอ", short: "Won/Lost" },
  { key: "in_progress", label: "ดำเนินโครงการ", short: "Execution" },
  { key: "completed", label: "ปิดโครงการ", short: "Closed" },
];

const ORDER: Record<ProjectLifecycleStatus, number> = {
  draft: 0,
  rfq_sent: 1,
  quotation_received: 2,
  proposal_submitted: 3,
  won: 4,
  lost: 4,
  in_progress: 5,
  completed: 6,
};

export function phaseIndex(status: ProjectLifecycleStatus | null | undefined): number {
  if (!status) return 0;
  return ORDER[status] ?? 0;
}

// Valid next transitions
const NEXT: Record<ProjectLifecycleStatus, ProjectLifecycleStatus[]> = {
  draft: ["rfq_sent"],
  rfq_sent: ["quotation_received"],
  quotation_received: ["proposal_submitted"],
  proposal_submitted: ["won", "lost"],
  won: ["in_progress"],
  lost: [],
  in_progress: ["completed"],
  completed: [],
};

export function nextStatuses(
  status: ProjectLifecycleStatus,
  isInhouse = false,
): ProjectLifecycleStatus[] {
  // งานผลิตภายใน: ข้ามขั้น RFQ และรับใบเสนอราคา Supplier
  if (isInhouse && (status === "draft" || status === "rfq_sent" || status === "quotation_received")) {
    return ["proposal_submitted"];
  }
  return NEXT[status] ?? [];
}

/** ขั้นตอนที่แสดงในแถบ stepper (งานผลิตภายในจะตัด RFQ / Supplier ออก) */
export function lifecyclePhases(isInhouse = false) {
  return isInhouse
    ? LIFECYCLE_PHASES.filter((p) => p.key !== "rfq_sent" && p.key !== "quotation_received")
    : LIFECYCLE_PHASES;
}

/** ตำแหน่งขั้นตอนปัจจุบันภายในชุดขั้นตอนที่แสดงจริง */
export function visiblePhaseIndex(
  status: ProjectLifecycleStatus | null | undefined,
  isInhouse = false,
): number {
  const phases = lifecyclePhases(isInhouse);
  const idx = phaseIndex(status);
  // map absolute order -> index ในรายการที่แสดง
  let last = 0;
  phases.forEach((p, i) => {
    if (ORDER[p.key] <= idx) last = i;
  });
  return last;
}

export const STATUS_TONE: Record<ProjectLifecycleStatus, string> = {
  draft: "bg-muted text-foreground",
  rfq_sent: "bg-primary/10 text-primary",
  quotation_received: "bg-primary/10 text-primary",
  proposal_submitted: "bg-warning/10 text-warning",
  won: "bg-success/15 text-success",
  lost: "bg-destructive/10 text-destructive",
  in_progress: "bg-primary/15 text-primary",
  completed: "bg-success/15 text-success",
};
