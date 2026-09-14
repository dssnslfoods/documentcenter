export const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }) : "-";

export const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "-";

export const fmtCurrency = (v?: number | null, currency = "THB") =>
  v == null ? "-" : new Intl.NumberFormat("th-TH", { style: "currency", currency }).format(v);

export const fmtNumber = (v?: number | null) =>
  v == null ? "-" : new Intl.NumberFormat("th-TH").format(v);

/** แปลง Date เป็น YYYY-MM-DD ตามเวลาท้องถิ่น (ไม่ใช้ toISOString ซึ่งเป็น UTC และทำให้วันที่เลื่อน) */
export const toLocalISODate = (d: Date = new Date()): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** แปลง YYYY-MM-DD เป็น Date เวลาเที่ยงคืนตามเวลาท้องถิ่น */
export const parseLocalDate = (s: string): Date => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** บวก/ลบจำนวนวันตามปฏิทินท้องถิ่น (ปลอดภัยต่อการเปลี่ยนเวลา) */
export const addLocalDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** จำนวนวันจากวันนี้ถึงวันที่กำหนด (0 = วันนี้, ติดลบ = เลยกำหนด) นับตามวันปฏิทินท้องถิ่น */
export const daysUntil = (dateStr?: string | null): number | null => {
  if (!dateStr) return null;
  const target = parseLocalDate(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  const today = parseLocalDate(toLocalISODate());
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};
