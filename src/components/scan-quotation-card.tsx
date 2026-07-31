import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { scanQuotation, type ScannedQuotation } from "@/lib/scan-quotation.functions";

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

/** สแกนรูปใบเสนอราคาแล้วเติมข้อมูลลงฟอร์มอัตโนมัติ */
export function ScanQuotationCard({ onScanned }: { onScanned: (d: ScannedQuotation) => void }) {
  const scan = useServerFn(scanQuotation);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("รองรับเฉพาะไฟล์รูปภาพ", { description: "ถ่ายรูปหรือแปลง PDF เป็นรูปภาพก่อน (JPG / PNG)" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("ไฟล์ใหญ่เกินไป (สูงสุด 8MB)");
      return;
    }
    setBusy(true);
    setFileName(file.name);
    try {
      const image = await fileToDataUrl(file);
      const result = await scan({ data: { image } });
      onScanned(result);
      toast.success("อ่านเอกสารสำเร็จ", { description: "กรุณาตรวจสอบข้อมูลที่ระบบเติมให้ก่อนบันทึก" });
    } catch (e) {
      toast.error("สแกนไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary"><ScanLine className="h-5 w-5" /></div>
          <div>
            <div className="text-sm font-medium">สแกนเอกสารเพื่อกรอกอัตโนมัติ</div>
            <div className="text-xs text-muted-foreground">
              {fileName ? `ไฟล์ล่าสุด: ${fileName}` : "อัปโหลด/ถ่ายรูปใบเสนอราคา (JPG, PNG) แล้วระบบจะอ่านข้อมูลใส่ในฟอร์มให้"}
            </div>
          </div>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleFile(f);
            }}
          />
          <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลังอ่าน...</> : <><ScanLine className="mr-2 h-4 w-4" />สแกนเอกสาร</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
