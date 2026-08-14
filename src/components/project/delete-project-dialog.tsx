import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { getSupabase } from "@/lib/supabase";

/**
 * ตารางระดับองค์กรรุ่นเก่า (legacy) ที่อ้างอิง project_id แบบ NO ACTION (ไม่ cascade)
 * ต้องปลด project_id ออกก่อนลบโครงการ ไม่เช่นนั้นจะชน foreign key constraint
 */
const LEGACY_TABLES = ["documents", "quotations", "procurements"] as const;

export function DeleteProjectDialog({
  projectId,
  projectCode,
  projectName,
  open,
  onOpenChange,
  onDeleted,
}: {
  projectId: string;
  projectCode: string;
  projectName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");

  const remove = useMutation({
    mutationFn: async () => {
      const sb = getSupabase();
      for (const table of LEGACY_TABLES) {
        const { error } = await sb.from(table).update({ project_id: null }).eq("project_id", projectId);
        if (error) throw error;
      }
      const { error } = await sb.from("projects").delete().eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบโครงการเรียบร้อยแล้ว");
      onOpenChange(false);
      onDeleted();
    },
    onError: (e: Error) => toast.error("ลบโครงการไม่สำเร็จ", { description: e.message }),
  });

  const canConfirm = confirmText.trim() === projectCode;

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!remove.isPending) { onOpenChange(v); if (!v) setConfirmText(""); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />ลบโครงการ "{projectName}"
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                การลบโครงการเป็นการกระทำที่ <span className="font-semibold text-destructive">ย้อนกลับไม่ได้</span> ข้อมูลทั้งหมดที่ผูกกับโครงการนี้จะถูกลบถาวรไปด้วย ได้แก่
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                <li>RFQ / Spec, ใบเสนอราคา Supplier และลูกค้า</li>
                <li>สัญญา / งวดงาน, แผนงาน (Timeline) และการมอบหมายงาน</li>
                <li>สมาชิกโครงการ, สิทธิ์รายบุคคล และประวัติการแก้ไข</li>
                <li>เอกสารแนบทั้งหมดของโครงการ</li>
              </ul>
              <p>
                พิมพ์รหัสโครงการ <span className="font-mono font-semibold text-foreground">{projectCode}</span> เพื่อยืนยัน
              </p>
              <Input
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={projectCode}
                className="font-mono"
              />
              <Label className="sr-only">ยืนยันรหัสโครงการ</Label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" disabled={remove.isPending} onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm || remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            ลบโครงการถาวร
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
