import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Trash2, Plus, FileText, Pencil, X, Check, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/page-header";
import { getSupabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";

type NoteType = "rfq_spec" | "tor" | "other";

type Note = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  sort_order: number | null;
};

export function ProjectSpecNotesList({
  projectId,
  type,
  emptyLabel,
  canEdit = true,
}: {
  projectId: string;
  type: NoteType;
  emptyLabel: string;
  canEdit?: boolean;
}) {
  const sb = getSupabase();
  const qc = useQueryClient();
  const key = ["project-spec-notes", projectId, type];

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const { data: notes, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await sb
        .from("project_spec_notes")
        .select("id, title, content, created_at, updated_at, sort_order")
        .eq("project_id", projectId)
        .eq("note_type", type)
        .order("sort_order", { ascending: true })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Note[];
    },
  });

  const reorder = useMutation({
    mutationFn: async ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const list = [...(notes ?? [])];
      const target = index + dir;
      if (target < 0 || target >= list.length) return;
      [list[index], list[target]] = [list[target], list[index]];
      for (let i = 0; i < list.length; i++) {
        const { error } = await sb
          .from("project_spec_notes")
          .update({ sort_order: i + 1 })
          .eq("id", list[i].id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });


  const create = useMutation({
    mutationFn: async () => {
      const t = title.trim();
      const c = content.trim();
      if (!t || !c) throw new Error("กรุณากรอกชื่อเรื่องและเนื้อหา");
      const { error } = await sb.from("project_spec_notes").insert({
        project_id: projectId,
        note_type: type,
        title: t,
        content: c,
        sort_order: (notes?.length ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("บันทึกเรียบร้อย");
      setTitle(""); setContent(""); setAdding(false);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["project-signals", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const { error } = await sb.from("project_spec_notes").update({
        title: editTitle.trim(), content: editContent.trim(),
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
      const { error } = await sb.from("project_spec_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบแล้ว");
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["project-signals", projectId] });
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

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {canEdit && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> เพิ่มบันทึกแบบข้อความ
          </Button>
        )}

        {canEdit && adding && (
          <div className="space-y-2 rounded-md border p-3 bg-muted/30">
            <Input
              placeholder="หัวข้อ เช่น สเปกอุปกรณ์ POS"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              placeholder="วางหรือพิมพ์รายละเอียด spec / RFQ ที่จะส่งให้ supplier..."
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
        ) : !notes || notes.length === 0 ? (
          <EmptyState title={emptyLabel} icon={FileText} />
        ) : (
          <div className="space-y-3">
            {notes.map((n) => (
              <div key={n.id} className="rounded-md border p-3">
                {editingId === n.id ? (
                  <div className="space-y-2">
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
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
                        <div className="font-medium text-sm">{n.title}</div>
                        <div className="text-xs text-muted-foreground">
                          อัปเดต {fmtDateTime(n.updated_at)}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" title="คัดลอกเนื้อหา" onClick={() => copy(n.content)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      {canEdit && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => {
                            setEditingId(n.id); setEditTitle(n.title); setEditContent(n.content);
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
