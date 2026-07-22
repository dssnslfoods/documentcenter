import { useState, type ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Trash2, Upload, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { getSupabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";
import {
  uploadProjectFile,
  getProjectFileUrl,
  removeProjectFile,
} from "@/lib/project-files";

type DocType = "rfq_spec" | "tor" | "contract" | "final_quotation" | "other";

export function ProjectDocumentsList({
  projectId,
  type,
  emptyLabel,
  canEdit = true,
}: {
  projectId: string;
  type: DocType;
  emptyLabel: string;
  canEdit?: boolean;
}) {
  const sb = getSupabase();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);

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

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadProjectFile(projectId, file);
      const { error } = await sb.from("project_documents").insert({
        project_id: projectId,
        document_type: type,
        document_name: file.name,
        file_url: path,
      });
      if (error) throw error;
      toast.success("อัปโหลดสำเร็จ");
      qc.invalidateQueries({ queryKey: ["project-docs", projectId, type] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const openFile = async (path: string) => {
    const url = await getProjectFileUrl(path);
    if (url) window.open(url, "_blank");
    else toast.error("ไม่สามารถเปิดไฟล์ได้");
  };

  return (
    <Card>
      <CardContent className="p-4">
        {canEdit && (
          <div className="mb-4 flex items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-4 py-2 text-sm hover:bg-muted">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? "กำลังอัปโหลด..." : "อัปโหลดไฟล์"}
              <input type="file" className="hidden" onChange={onFile} disabled={uploading} />
            </label>
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
        ) : !docs || docs.length === 0 ? (
          <EmptyState title={emptyLabel} icon={FileText} />
        ) : (
          <div className="divide-y">
            {docs.map((d) => (
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
      </CardContent>
    </Card>
  );
}
