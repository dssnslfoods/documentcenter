/** สถานะการมอบหมายงานให้สมาชิกโครงการ */
export type AssignmentStatus =
  | "draft"
  | "assigned"
  | "acknowledged"
  | "in_review"
  | "revision"
  | "accepted";

export const ASSIGNMENT_META: Record<AssignmentStatus, { label: string; badge: string }> = {
  draft: { label: "ยังไม่มอบหมาย", badge: "border-muted-foreground/30 text-muted-foreground" },
  assigned: { label: "รอสมาชิกรับทราบ", badge: "border-warning/50 text-warning" },
  acknowledged: { label: "รับทราบแล้ว / กำลังทำ", badge: "border-primary/40 text-primary" },
  in_review: { label: "ส่งมอบแล้ว รอตรวจรับ", badge: "border-primary/60 text-primary" },
  revision: { label: "ขอให้แก้ไข", badge: "border-destructive/40 text-destructive" },
  accepted: { label: "ผู้บริหารรับมอบแล้ว", badge: "border-success/40 text-success" },
};

/**
 * ค่าที่ต้องอัปเดตเมื่อเปลี่ยนตัวผู้รับผิดชอบงาน — เริ่มขั้นตอนการมอบหมายใหม่ให้ผู้รับคนใหม่
 * คืน null เมื่อผู้รับผิดชอบไม่เปลี่ยน หรืองานยังไม่เคยมอบหมาย (draft)
 * `notify` = ต้องบันทึก project_task_updates ชนิด 'assign' (trigger แจ้งเตือนทำงานเมื่อสถานะเป็น 'assigned')
 */
export function reassignmentPatch(
  task: {
    assignee_id: string | null;
    assignment_status?: AssignmentStatus | null;
    status: string;
  },
  nextAssigneeId: string | null,
  actorId: string | null,
): { patch: Record<string, unknown>; notify: boolean } | null {
  if ((task.assignee_id ?? null) === (nextAssigneeId ?? null)) return null;
  const prev = (task.assignment_status ?? "draft") as AssignmentStatus;
  if (prev === "draft") return null;
  const cleared = { acknowledged_at: null, submitted_at: null, accepted_at: null };
  const reopen = task.status === "done" || prev === "accepted" ? { status: "not_started", progress: 0 } : {};
  if (!nextAssigneeId) {
    // งานที่รับมอบแล้วคงสถานะไว้; งานที่ยังค้างอยู่ไม่มีผู้รับผิดชอบภายใน → กลับเป็นร่าง
    if (prev === "accepted") return null;
    return {
      patch: { ...cleared, assignment_status: "draft", assigned_at: null, assigned_by: null },
      notify: false,
    };
  }
  return {
    patch: {
      ...cleared,
      ...reopen,
      assignment_status: "assigned",
      assigned_at: new Date().toISOString(),
      assigned_by: actorId,
    },
    notify: true,
  };
}

export type TaskUpdateKind = "assign" | "acknowledge" | "feedback" | "submit" | "accept" | "revision";

export const UPDATE_KIND_LABEL: Record<TaskUpdateKind, string> = {
  assign: "มอบหมายงาน",
  acknowledge: "รับทราบงาน",
  feedback: "ความคืบหน้า / ข้อเสนอแนะ",
  submit: "ส่งมอบงาน",
  accept: "รับมอบงาน",
  revision: "ขอให้แก้ไข",
};

export type TaskUpdate = {
  id: string;
  task_id: string;
  author_id: string;
  kind: TaskUpdateKind;
  message: string | null;
  progress: number | null;
  created_at: string;
};

/** แยกรายการ "ภารกิจ:" ออกจากคำอธิบายงาน เพื่อแสดงผลเป็นการ์ดละ 1 ภารกิจ */
export function splitMissions(description: string | null | undefined): {
  missions: string[];
  note: string;
} {
  const lines = (description ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const missions: string[] = [];
  const notes: string[] = [];
  for (const line of lines) {
    const m = line.match(/^ภารกิจ\s*:\s*(.+)$/);
    if (m) missions.push(m[1].trim());
    else notes.push(line);
  }
  return { missions, note: notes.join("\n") };
}
