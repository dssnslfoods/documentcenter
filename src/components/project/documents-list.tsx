import { useState, type ChangeEvent, type DragEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Trash2, Upload, FileText, Loader2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/page-header";
import { getSupabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";
import {
  uploadProjectFile,
  getProjectFileUrl,
  getProjectFileUrls,
  removeProjectFile,
} from "@/lib/project-files";

type DocType = "rfq_spec" | "tor" | "contract" | "final_quotation" | "other";

const isImageName = (name: string) => /\.(png|jpe?g|gif|webp|bmp|avif|heic)$/i.test(name);

export function ProjectDocumentsList({
  projectId,
  type,
  emptyLabel,
  canEdit = true,
  gallery = false,
}: {
  projectId: string;
  type: DocType;
  emptyLabel: string;
  canEdit?: boolean;
  /** แสดงผลเป็นแกลเลอรีรูปภาพพร้อม preview */
  gallery?: boolean;
}) {
  const sb = getSupabase();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["project-docs", projectId, type],
    queryFn: async () => {
      const { data, error } = await sb
        .from("project_documents")
        .select("id, document_name, file_url, uploaded_at")
        .eq("project_id", projectId)
        .eq("document_type", type)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const imagePaths = (docs ?? []).filter((d) => isImageName(d.document_name)).map((d) => d.file_url);
  const { data: thumbs } = useQuery({
    queryKey: ["project-doc-urls", projectId, type, imagePaths.join("|")],
    queryFn: () => getProjectFileUrls(imagePaths),
    enabled: gallery && imagePaths.length > 0,
    staleTime: 1000 * 60 * 20,
  });

  const remove = useMutation({
    mutationFn: async (row: { id: string; file_url: string }) => {
      await removeProjectFile(row.file_url);
      const { error } = await sb.from("project_documents").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบไฟล์เรียบร้อย");
      qc.invalidateQueries({ queryKey: ["project-docs", projectId, type] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    let ok = 0;
    try {
      for (const file of files) {
        try {
          const path = await uploadProjectFile(projectId, file);
          const { error } = await sb.from("project_documents").insert({
            project_id: projectId,
            document_type: type,
            document_name: file.name,
            file_url: path,
          });
          if (error) throw error;
          ok++;
        } catch (err) {
          toast.error(`${file.name}: ${(err as Error).message}`);
        }
      }
      if (ok > 0) {
        toast.success(`อัปโหลดสำเร็จ ${ok} ไฟล์`);
        qc.invalidateQueries({ queryKey: ["project-docs", projectId, type] });
      }
    } finally {
      setUploading(false);
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    await uploadFiles(files);
  };

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (!canEdit) return;
    await uploadFiles(Array.from(e.dataTransfer.files ?? []));
  };

  const openFile = async (path: string) => {
    const url = await getProjectFileUrl(path);
    if (url) window.open(url, "_blank");
    else toast.error("ไม่สามารถเปิดไฟล์ได้");
  };

  const images = (docs ?? []).filter((d) => isImageName(d.document_name));
  const others = (docs ?? []).filter((d) => !isImageName(d.document_name));
  const current = previewIdx != null ? images[previewIdx] : null;

  const uploader = canEdit && (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`mb-4 rounded-lg border border-dashed p-4 text-center transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "bg-muted/20"
      }`}
    >
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? "กำลังอัปโหลด..." : gallery ? "อัปโหลดรูป (เลือกได้หลายรูป)" : "อัปโหลดไฟล์"}
        <input
          type="file"
          multiple
          accept={gallery ? "image/*,application/pdf" : undefined}
          className="hidden"
          onChange={onFile}
          disabled={uploading}
        />
      </label>
      <div className="mt-2 text-xs text-muted-foreground">
        หรือลากไฟล์มาวางตรงนี้ได้เลย (รองรับหลายไฟล์พร้อมกัน)
      </div>
    </div>
  );

  return (
    <Card>
      <CardContent className="p-4">
        {uploader}

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
        ) : !docs || docs.length === 0 ? (
          <EmptyState title={emptyLabel} icon={gallery ? ImageIcon : FileText} />
        ) : (
          <div className="space-y-4">
            {gallery && images.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {images.map((d, i) => (
                  <div key={d.id} className="group overflow-hidden rounded-lg border">
                    <button
                      type="button"
                      className="block aspect-4/3 w-full bg-muted"
                      onClick={() => setPreviewIdx(i)}
                    >
                      {thumbs?.[d.file_url] ? (
                        <img
                          src={thumbs[d.file_url]}
                          alt={d.document_name}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </button>
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{d.document_name}</div>
                        <div className="text-[11px] text-muted-foreground">{fmtDateTime(d.uploaded_at)}</div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openFile(d.file_url)}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      {canEdit && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            if (confirm("ลบไฟล์นี้?")) remove.mutate({ id: d.id, file_url: d.file_url });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(gallery ? others : docs).length > 0 && (
              <div className="divide-y">
                {(gallery ? others : docs).map((d) => (
                  <div key={d.id} className="flex items-center gap-3 py-3">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{d.document_name}</div>
                      <div className="text-xs text-muted-foreground">{fmtDateTime(d.uploaded_at)}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => openFile(d.file_url)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm("ลบไฟล์นี้?")) remove.mutate({ id: d.id, file_url: d.file_url });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Dialog open={previewIdx != null} onOpenChange={(o) => !o && setPreviewIdx(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="truncate text-base">{current?.document_name}</DialogTitle>
            </DialogHeader>
            {current && thumbs?.[current.file_url] && (
              <img
                src={thumbs[current.file_url]}
                alt={current.document_name}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
            )}
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {previewIdx != null ? `${previewIdx + 1} / ${images.length}` : ""}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={previewIdx == null || previewIdx <= 0}
                  onClick={() => setPreviewIdx((i) => (i == null ? i : i - 1))}
                >
                  ก่อนหน้า
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={previewIdx == null || previewIdx >= images.length - 1}
                  onClick={() => setPreviewIdx((i) => (i == null ? i : i + 1))}
                >
                  ถัดไป
                </Button>
                <Button size="sm" onClick={() => current && openFile(current.file_url)}>
                  <Download className="mr-1 h-4 w-4" />
                  ดาวน์โหลด
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
