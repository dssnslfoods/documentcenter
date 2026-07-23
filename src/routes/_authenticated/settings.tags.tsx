import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Tag as TagIcon } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { SettingsNav } from "@/components/settings-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabase } from "@/lib/supabase";
import { useAdminGuard } from "@/hooks/use-admin-guard";

export const Route = createFileRoute("/_authenticated/settings/tags")({
  head: () => ({ meta: [{ title: "Tag และ Keyword | Document Hub" }] }),
  component: TagsPage,
});

const COLORS = [
  { value: "gray", cls: "bg-gray-100 text-gray-700" },
  { value: "blue", cls: "bg-blue-100 text-blue-700" },
  { value: "green", cls: "bg-green-100 text-green-700" },
  { value: "yellow", cls: "bg-yellow-100 text-yellow-700" },
  { value: "red", cls: "bg-red-100 text-red-700" },
  { value: "purple", cls: "bg-purple-100 text-purple-700" },
];
const colorCls = (c: string) => COLORS.find((x) => x.value === c)?.cls ?? COLORS[0].cls;

type Tag = { id: string; name: string; color: string };

function TagsPage() {
  const guard = useAdminGuard();
  const sb = getSupabase();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState("gray");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["tags-admin"],
    enabled: guard.allowed,
    queryFn: async () => {
      const { data, error } = await sb.from("tags").select("id, name, color").order("name");
      if (error) throw error;
      return (data ?? []) as Tag[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const n = name.trim();
      if (!n) throw new Error("กรุณากรอกชื่อ tag");
      const { error } = await sb.from("tags").insert({ name: n, color });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("เพิ่ม tag แล้ว");
      setName(""); setColor("gray");
      qc.invalidateQueries({ queryKey: ["tags-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ลบแล้ว");
      qc.invalidateQueries({ queryKey: ["tags-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (guard.node) return guard.node;

  return (
    <div className="space-y-6">
      <SettingsNav />
      <PageHeader title="Tag และ Keyword" description="จัดการ tag สำหรับใช้กับเอกสารและโครงการ" />

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
            <div><Label>ชื่อ Tag</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น เร่งด่วน, VIP, งบประมาณ" />
            </div>
            <div><Label>สี</Label>
              <Select value={color} onValueChange={setColor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLORS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      <span className={`inline-flex rounded px-2 py-0.5 text-xs ${c.cls}`}>{c.value}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => add.mutate()} disabled={add.isPending}>
                <Plus className="h-4 w-4 mr-1" /> เพิ่ม
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : !rows || rows.length === 0 ? (
            <EmptyState title="ยังไม่มี tag" icon={TagIcon} />
          ) : (
            <div className="flex flex-wrap gap-2">
              {rows.map((t) => (
                <span key={t.id} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${colorCls(t.color)}`}>
                  {t.name}
                  <button
                    className="opacity-60 hover:opacity-100"
                    onClick={() => { if (confirm(`ลบ tag "${t.name}"?`)) del.mutate(t.id); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
