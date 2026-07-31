import { useState } from "react";
import { Eye, Download, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getProjectFileUrl } from "@/lib/project-files";

function isImage(path: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path);
}
function isPdf(path: string) {
  return /\.pdf$/i.test(path);
}
function baseName(path: string) {
  const n = path.split("/").pop() ?? path;
  return n.replace(/^\d+-/, "");
}

/** ปุ่มดูตัวอย่างไฟล์ (PDF / รูปภาพ) แบบ inline ก่อนดาวน์โหลด */
export function FilePreviewButton({
  path,
  label = "ดูไฟล์",
  size = "sm",
  variant = "outline",
  className,
}: {
  path: string;
  label?: string;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost" | "default" | "secondary";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const show = async () => {
    setOpen(true);
    if (url) return;
    setLoading(true);
    try {
      setUrl(await getProjectFileUrl(path));
    } finally {
      setLoading(false);
    }
  };

  const previewable = isImage(path) || isPdf(path);

  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={show} title="ดูตัวอย่างไฟล์">
        <Eye className={label ? "mr-1 h-4 w-4" : "h-4 w-4"} />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[88vh] w-[95vw] max-w-5xl flex-col gap-3">
          <DialogHeader className="pr-8">
            <DialogTitle className="truncate text-sm">{baseName(path)}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden rounded-lg border bg-muted/30">
            {loading || !url ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : "ไม่สามารถเปิดไฟล์นี้ได้"}
              </div>
            ) : isImage(path) ? (
              <div className="flex h-full items-center justify-center overflow-auto p-2">
                <img src={url} alt={baseName(path)} className="max-h-full max-w-full object-contain" />
              </div>
            ) : previewable ? (
              <iframe src={url} title={baseName(path)} className="h-full w-full" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                ไฟล์ประเภทนี้ดูตัวอย่างในหน้าเว็บไม่ได้ — กรุณาดาวน์โหลด
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            {url && (
              <>
                <Button variant="outline" size="sm" onClick={() => window.open(url, "_blank")}>
                  <ExternalLink className="mr-1 h-4 w-4" />เปิดแท็บใหม่
                </Button>
                <Button size="sm" asChild>
                  <a href={url} download={baseName(path)}>
                    <Download className="mr-1 h-4 w-4" />ดาวน์โหลด
                  </a>
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
