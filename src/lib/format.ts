export const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }) : "-";

export const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "-";

export const fmtCurrency = (v?: number | null, currency = "THB") =>
  v == null ? "-" : new Intl.NumberFormat("th-TH", { style: "currency", currency }).format(v);

export const fmtNumber = (v?: number | null) =>
  v == null ? "-" : new Intl.NumberFormat("th-TH").format(v);

export const daysUntil = (dateStr?: string | null): number | null => {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};
