export type ProjectHealth = "green" | "yellow" | "red" | "grey";

export const HEALTH_LABEL: Record<ProjectHealth, string> = {
  green: "ตามแผน",
  yellow: "ใกล้เสี่ยง",
  red: "ล่าช้า",
  grey: "ปิดโครงการ",
};

export const HEALTH_DOT: Record<ProjectHealth, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  grey: "bg-slate-400",
};

export const HEALTH_BG: Record<ProjectHealth, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  yellow: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  grey: "bg-slate-100 text-slate-600 border-slate-200",
};

export function healthFromString(value: string | null): ProjectHealth {
  if (value === "green" || value === "yellow" || value === "red" || value === "grey") return value;
  return "green";
}
