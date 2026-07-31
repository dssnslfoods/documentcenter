export type AkaColorKey =
  | "slate" | "blue" | "cyan" | "violet" | "amber" | "emerald" | "rose" | "orange";

export const AKA_COLORS: { key: AkaColorKey; label: string; swatch: string; badge: string }[] = [
  { key: "slate", label: "เทา", swatch: "bg-slate-500", badge: "bg-slate-500 text-white" },
  { key: "blue", label: "น้ำเงิน", swatch: "bg-blue-600", badge: "bg-blue-600 text-white" },
  { key: "cyan", label: "ฟ้า", swatch: "bg-cyan-500", badge: "bg-cyan-500 text-white" },
  { key: "violet", label: "ม่วง", swatch: "bg-violet-600", badge: "bg-violet-600 text-white" },
  { key: "amber", label: "เหลือง", swatch: "bg-amber-500", badge: "bg-amber-500 text-black" },
  { key: "emerald", label: "เขียว", swatch: "bg-emerald-600", badge: "bg-emerald-600 text-white" },
  { key: "rose", label: "ชมพู", swatch: "bg-rose-500", badge: "bg-rose-500 text-white" },
  { key: "orange", label: "ส้ม", swatch: "bg-orange-500", badge: "bg-orange-500 text-white" },
];

export function akaBadgeClass(color?: string | null) {
  return AKA_COLORS.find((c) => c.key === color)?.badge ?? "bg-primary text-primary-foreground";
}
