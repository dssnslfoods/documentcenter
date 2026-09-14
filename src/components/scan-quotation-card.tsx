import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ScanLine, AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { scanQuotation, type ScannedQuotation } from "@/lib/scan-quotation.functions";
import { getAccessToken } from "@/lib/supabase";

const LABELS: Record<keyof ScannedQuotation, string> = {
  title: "หัวข้อ",
  quotation_no: "เลขที่ใบเสนอราคา",
  partner_name: "ผู้ออกใบเสนอราคา (ผู้ขาย)",
  buyer_name: "ผู้รับ (ลูกค้า)",
  issue_date: "วันที่ออก",
  expiry_date: "วันหมดอายุ",
  amount_before_tax: "มูลค่าก่อน VAT",
  discount: "ส่วนลด",
  tax: "VAT",
  total_amount: "ยอดรวม",
  currency: "สกุลเงิน",
  description: "รายละเอียด",
  confidence: "ความมั่นใจ",
  items: "รายการสินค้า/บริการ",
};

function confidenceColor(score: number | null | undefined) {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 0.9) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (score >= 0.7) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400";
}

function confidenceIcon(score: number | null | undefined) {
  if (score == null) return <HelpCircle className="h-3.5 w-3.5" />;
  if (score >= 0.9) return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (score >= 0.7) return <AlertCircle className="h-3.5 w-3.5" />;
  return <AlertCircle className="h-3.5 w-3.5" />;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

/** สแกนรูปใบเสนอราคาแล้วเติมข้อมูลลงฟอร์มอัตโนมัติ พร้อมแสดงค่า confidence */
const MONEY_FIELDS = new Set<string>(["amount_before_tax", "discount", "tax", "total_amount"]);

export function ScanQuotationCard({
  onScanned,
  onFile,
  hideAmounts = false,
}: {
  onScanned: (d: ScannedQuotation) => void;
  /** ไฟล์ที่ใช้สแกน — ส่งกลับเพื่อให้ผู้เรียกเก็บไฟล์แนบไว้ด้วย */
  onFile?: (file: File) => void;
  /** ซ่อนยอดเงินในผลการอ่าน สำหรับผู้ที่ไม่มีสิทธิ์เห็นราคา */
  hideAmounts?: boolean;
}) {
  const scan = useServerFn(scanQuotation);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ScannedQuotation | null>(null);

  const handleFile = async (file: File) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!file.type.startsWith("image/") && !isPdf) {
      toast.error("รองรับเฉพาะไฟล์รูปภาพหรือ PDF", { description: "อัปโหลดไฟล์ JPG, PNG หรือ PDF" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("ไฟล์ใหญ่เกินไป (สูงสุด 8MB)");
      return;
    }
    setBusy(true);
    setFileName(file.name);
    setLastResult(null);
    try {
      const image = await fileToDataUrl(file);
      const result = await scan({ data: { accessToken: await getAccessToken(), image, filename: file.name } });
      setLastResult(result);
      onScanned(result);
      onFile?.(file);
      toast.success("อ่านเอกสารสำเร็จ", { description: "กรุณาตรวจสอบข้อมูลที่ระบบเติมให้ก่อนบันทึก" });
    } catch (e) {
      toast.error("สแกนไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const confidenceFields = lastResult?.confidence
    ? (Object.entries(lastResult.confidence) as [keyof ScannedQuotation["confidence"], number | null | undefined][])
        .filter(([key]) => key !== "confidence" && key !== "items" && !(hideAmounts && MONEY_FIELDS.has(key)))
        .map(([key, score]) => ({ key, label: LABELS[key] ?? key, score, value: lastResult[key as keyof ScannedQuotation] }))
        .filter((item) => (item.value != null && typeof item.value !== "object") || item.score != null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    : [];


  const lowConfidenceCount = confidenceFields.filter((f) => (f.score ?? 0) < 0.7).length;

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 rounded-lg bg-primary/10 p-2 text-primary"><ScanLine className="h-5 w-5" /></div>
          <div className="min-w-0">
            <div className="text-sm font-medium">สแกนเอกสารเพื่อกรอกอัตโนมัติ</div>
            <div className="break-words text-xs text-muted-foreground">
              {fileName ? `ไฟล์ล่าสุด: ${fileName}` : "อัปโหลด/ถ่ายรูปใบเสนอราคา (JPG, PNG หรือ PDF) แล้วระบบจะอ่านข้อมูลใส่ในฟอร์มให้"}
            </div>
          </div>
        </div>
        <div className="w-full shrink-0 sm:w-auto">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleFile(f);
            }}
          />
          <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังอ่าน...</> : <><ScanLine className="mr-2 h-4 w-4" />สแกนเอกสาร</>}
          </Button>
        </div>
      </CardContent>

      {lastResult && confidenceFields.length > 0 && (
        <CardContent className="border-t px-4 pb-4 pt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">ผลการอ่านเอกสาร — ค่าความมั่นใจ</div>
            {lowConfidenceCount > 0 && (
              <Badge variant="outline" className="text-rose-600">
                มี {lowConfidenceCount} ช่องที่ควรตรวจสอบ
              </Badge>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {confidenceFields.map(({ key, label, score, value }) => (
              <div key={key} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-muted-foreground">{label}</span>
                  <span className="min-w-0 break-words font-medium">{value == null ? "-" : String(value)}</span>
                </div>
                <div className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${confidenceColor(score)}`}>
                  {confidenceIcon(score)}
                  {score == null ? "ไม่ระบุ" : `${Math.round(score * 100)}%`}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            ค่าความมั่นใจ 90% ขึ้นไป = น่าเชื่อถือ, 70-89% = ควรตรวจสอบ, ต่ำกว่า 70% = ควรแก้ไขก่อนบันทึก
          </p>
        </CardContent>
      )}
    </Card>
  );
}
