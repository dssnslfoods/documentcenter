import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Trash2, Plus, FileText, Pencil, X, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page-header";
import { getSupabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";

type NoteType = "general" | "clause" | "obligation" | "risk" | "other";

const TYPE_LABEL: Record<NoteType, string> = {
  general: "ทั่วไป",
  clause: "ข้อสัญญา",
  obligation: "ภาระผูกพัน",
  risk: "ความเสี่ยง",
  other: "อื่นๆ",
};

type Note = {
  id: string;
  note_type: NoteType;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export function ContractNotesList({ contractId, canEdit = true }: { contractId: string; canEdit?: boolean }) {
  const sb = getSupabase();
  const qc = useQueryClient();
  const key = ["contract-notes", contractId];

  const [adding, setAdding] = useState(false);
  const [noteType, setNoteType] = useState<NoteType>("general");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditType] = useState<NoteType>("general");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<NoteType | "all">("all");

  const { data: notes, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await sb
        .from("contract_notes")
        .select("id, note_type, title, content, created_at, updated_at")
        .eq("contract_id", contractId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Note[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      const c = content.trim();
      if (!t || !c) throw new Error("กรุณากรอกหัวข้อและเนื้อหา");
      const { error } = await sb.from("contract_notes").insert({
        contract_id: contractId,
        note_type: noteType,
        title: t,
        content: c,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("บันทึกเรียบร้อย");
      setTitle(""); setContent(""); setNoteType("general"); setAdding(false);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const { error } = await sb.from("contract_notes").update({
        title: editTitle.trim(), content: editContent.trim(), note_type: editType,
      }).eq("id", editingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("อัปเดตแล้ว");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("contract_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบแล้ว");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("คัดลอกแล้ว");
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = (notes ?? []).filter((n) => {
    if (filter !== "all" && n.note_type !== filter) return false;
    if (!q) return true;
    return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" />
          บันทึก/ข้อความสัญญา (freeform) {notes && notes.length > 0 && `(${notes.length})`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="ค้นหาในบันทึก..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as NoteType | "all")}>
            <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกประเภท</SelectItem>
              {(Object.keys(TYPE_LABEL) as NoteType[]).map((t) => (
                <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit && !adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-1" /> เพิ่มบันทึก
            </Button>
          )}
        </div>

        {canEdit && adding && (
          <div className="space-y-2 rounded-md border p-3 bg-muted/30">
            <div className="flex gap-2">
              <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABEL) as NoteType[]).map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="หัวข้อ เช่น ข้อ 5.2 การรับประกัน"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <Textarea
              placeholder="วางหรือพิมพ์ข้อความจากสัญญา / บันทึกภายใน..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setTitle(""); setContent(""); }}>
                ยกเลิก
              </Button>
              <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
                บันทึก
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
        ) : filtered.length === 0 ? (
          <EmptyState title={notes && notes.length > 0 ? "ไม่พบตรงกับการค้นหา" : "ยังไม่มีบันทึก"} icon={FileText} />
        ) : (
          <div className="space-y-3">
            {filtered.map((n) => (
              <div key={n.id} className="rounded-md border p-3">
                {editingId === n.id ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Select value={editType} onValueChange={(v) => setEditType(v as NoteType)}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(TYPE_LABEL) as NoteType[]).map((t) => (
                            <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    </div>
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={10}
                      className="font-mono text-sm"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4 mr-1" /> ยกเลิก
                      </Button>
                      <Button size="sm" onClick={() => update.mutate()} disabled={update.isPending}>
                        <Check className="h-4 w-4 mr-1" /> บันทึก
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-[10px]">{TYPE_LABEL[n.note_type]}</Badge>
                          <span className="font-medium text-sm">{n.title}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          อัปเดต {fmtDateTime(n.updated_at)}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" title="คัดลอกเนื้อหา" onClick={() => copy(n.content)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      {canEdit && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => {
                            setEditingId(n.id); setEditType(n.note_type); setEditTitle(n.title); setEditContent(n.content);
                          }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => { if (confirm("ลบบันทึกนี้?")) remove.mutate(n.id); }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-muted/40 p-3 text-sm font-mono max-h-64 overflow-auto">
{n.content}
                    </pre>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
