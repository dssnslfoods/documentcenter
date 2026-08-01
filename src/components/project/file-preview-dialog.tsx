import { useEffect, useRef, useState } from "react";
import { Eye, Download, Loader2, ExternalLink } from "lucide-react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getProjectFileUrl, guessContentType } from "@/lib/project-files";

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

function PdfPreview({ data }: { data: Uint8Array }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    setError(false);

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        const pdf = await pdfjs.getDocument({ data: data.slice() }).promise;

        for (let pageNumber = 1; pageNumber <= pdf.numPages && !cancelled; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const availableWidth = Math.max(280, Math.min(host.clientWidth - 24, 1100));
          const scale = availableWidth / baseViewport.width;
          const viewport = page.getViewport({ scale });
          const ratio = Math.min(window.devicePixelRatio || 1, 2);
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.className = "mx-auto block max-w-full bg-background shadow-sm";
          canvas.setAttribute("aria-label", `หน้าที่ ${pageNumber}`);
          host.appendChild(canvas);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas is unavailable");
          await page.render({
            canvas,
            canvasContext: context,
            viewport,
            transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
          }).promise;
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [data]);

  if (error) {
    return <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">ไม่สามารถแสดง PDF ภายในหน้านี้ได้ กรุณาเปิดในแท็บใหม่</div>;
  }

  return <div ref={hostRef} className="h-full space-y-3 overflow-auto bg-muted/30 p-3" />;
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
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  const show = async () => {
    setOpen(true);
    if (url) return;
    setLoading(true);
    try {
      const signed = await getProjectFileUrl(path);
      setUrl(signed);
      if (signed) {
        // Force a correct MIME type so browsers render (some files were stored as octet-stream)
        try {
          const res = await fetch(signed);
          if (!res.ok) throw new Error("Unable to load file");
          const raw = await res.blob();
          if (isPdf(path)) {
            setPdfData(new Uint8Array(await raw.arrayBuffer()));
          } else {
            const typed = new Blob([raw], { type: guessContentType(path) });
            setBlobUrl(URL.createObjectURL(typed));
          }
        } catch {
          setBlobUrl(null);
          setPdfData(null);
        }
      }
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
                <img src={blobUrl ?? url} alt={baseName(path)} className="max-h-full max-w-full object-contain" />
              </div>
            ) : isPdf(path) && pdfData ? (
              <PdfPreview data={pdfData} />
            ) : previewable ? (
              <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
                ไม่สามารถแสดงตัวอย่างได้ กรุณาเปิดในแท็บใหม่
              </div>
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
