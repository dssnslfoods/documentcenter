import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { ArrowLeft, Upload, Download, FileText, Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentStatusBadge, ConfidentialityBadge } from "@/components/status-badge";
import { getSupabase } from "@/lib/supabase";
import { fmtDate, fmtDateTime, fmtCurrency } from "@/lib/format";
import { useCanSeeMoney, MONEY_MASK } from "@/hooks/use-page-access";

export const Route = createFileRoute("/_authenticated/documents/$id")({
  head: () => ({ meta: [{ title: "รายละเอียดเอกสาร | Document Hub" }] }),
  component: DocumentDetail,
});

function DocumentDetail() {
  const { canSeeMoney } = useCanSeeMoney();
  const { id } = useParams({ from: "/_authenticated/documents/$id" });
  const qc = useQueryClient();

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("documents")
        .select("*, document_categories(name_th), departments(name_th), partners(name), profiles!documents_owner_id_fkey(full_name, email)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: files } = useQuery({
    queryKey: ["document-files", id],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("document_files")
        .select("*")
        .eq("document_id", id)
        .order("version_number", { ascending: false });
      return data ?? [];
    },
  });

  const { data: audit } = useQuery({
    queryKey: ["document-audit", id],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("audit_logs")
        .select("*, profiles(full_name, email)")
        .eq("record_id", id)
        .eq("module", "documents")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  if (isLoading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!doc) {
    return <div className="py-16 text-center text-muted-foreground">ไม่พบเอกสารนี้</div>;
  }

  const partner = Array.isArray(doc.partners) ? doc.partners[0] : doc.partners;
  const cat = Array.isArray(doc.document_categories) ? doc.document_categories[0] : doc.document_categories;
  const dept = Array.isArray(doc.departments) ? doc.departments[0] : doc.departments;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/documents"><ArrowLeft className="mr-1 h-4 w-4" /> กลับสู่คลังเอกสาร</Link>
      </Button>

      <PageHeader
        title={doc.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{doc.document_no}</span>
            <DocumentStatusBadge status={doc.status} />
            <ConfidentialityBadge level={doc.confidentiality} />
          </span> as never
        }
      />

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">ข้อมูลเอกสาร</TabsTrigger>
          <TabsTrigger value="files">ไฟล์ & Version ({files?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="audit">ประวัติกิจกรรม ({audit?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardContent className="grid gap-x-8 gap-y-4 p-6 sm:grid-cols-2">
              <Field label="หมวดหมู่" value={cat?.name_th} />
              <Field label="แผนกเจ้าของ" value={dept?.name_th} />
              <Field label="คู่ค้า / ลูกค้า" value={partner?.name} />
              <Field label="ผู้รับผิดชอบ" value={(Array.isArray(doc.profiles) ? doc.profiles[0] : doc.profiles)?.full_name} />
              <Field label="วันที่ออก" value={fmtDate(doc.issue_date)} />
              <Field label="วันเริ่มมีผล" value={fmtDate(doc.effective_date)} />
              <Field label="วันสิ้นสุด" value={fmtDate(doc.end_date)} />
              {canSeeMoney && <Field label="มูลค่า" value={fmtCurrency(doc.value_amount, doc.currency)} />}
              <Field label="สร้างเมื่อ" value={fmtDateTime(doc.created_at)} />
              <Field label="แก้ไขล่าสุด" value={fmtDateTime(doc.updated_at)} />
              {doc.description && (
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">คำอธิบาย</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{doc.description}</p>
                </div>
              )}
              {doc.keywords && (
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">Keywords</div>
                  <p className="mt-1 text-sm">{doc.keywords}</p>
                </div>
              )}
              {doc.notes && (
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">หมายเหตุ</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{doc.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <FilesTab documentId={id} files={files ?? []} onChange={() => qc.invalidateQueries({ queryKey: ["document-files", id] })} />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader><CardTitle>ประวัติกิจกรรม</CardTitle></CardHeader>
            <CardContent>
              {audit && audit.length > 0 ? (
                <ol className="space-y-3">
                  {audit.map((a: any) => {
                    const prof = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
                    return (
                      <li key={a.id} className="flex gap-3 border-b pb-3 last:border-0">
                        <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm">
                            <span className="font-medium">{prof?.full_name ?? prof?.email ?? "ระบบ"}</span>{" "}
                            <span className="text-muted-foreground">{a.action}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">ยังไม่มีประวัติ</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value ?? "-"}</div>
    </div>
  );
}

function FilesTab({
  documentId, files, onChange,
}: { documentId: string; files: any[]; onChange: () => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const sb = getSupabase();
      const { data: userData } = await sb.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");
      const nextVersion = (files[0]?.version_number ?? 0) + 1;
      const path = `${documentId}/v${nextVersion}/${file.name}`;
      const { error: upErr } = await sb.storage.from("documents").upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      const { error: dbErr } = await sb.from("document_files").insert({
        document_id: documentId,
        version_number: nextVersion,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        storage_path: path,
        uploaded_by: userData.user.id,
        is_current: true,
      });
      if (dbErr) throw dbErr;

      // Mark previous versions as not current
      if (files.length > 0) {
        await sb.from("document_files").update({ is_current: false }).eq("document_id", documentId).neq("version_number", nextVersion);
      }

      toast.success(`อัปโหลด Version ${nextVersion} สำเร็จ`);
      onChange();
    } catch (e) {
      toast.error("อัปโหลดไม่สำเร็จ", { description: (e as Error).message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const download = useMutation({
    mutationFn: async (f: any) => {
      const { data, error } = await getSupabase().storage.from("documents").createSignedUrl(f.storage_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    },
    onError: (e: Error) => toast.error("ดาวน์โหลดไม่สำเร็จ", { description: e.message }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>ไฟล์แนบและประวัติ Version</CardTitle>
        <div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <Button size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            อัปโหลด Version ใหม่
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {files.length > 0 ? (
          <ul className="divide-y">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-3">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium truncate">{f.file_name}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">v{f.version_number}</span>
                    {f.is_current && <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] text-success">Current</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(f.file_size / 1024).toFixed(1)} KB · อัปโหลด {fmtDateTime(f.created_at)}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => download.mutate(f)}>
                  <Download className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            ยังไม่มีไฟล์แนบ — คลิก "อัปโหลด Version ใหม่" เพื่อเริ่มต้น
          </div>
        )}
      </CardContent>
    </Card>
  );
}
