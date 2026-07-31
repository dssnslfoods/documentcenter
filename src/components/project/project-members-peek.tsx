import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";
import { PROJECT_ROLE_LABEL, type ProjectRole } from "@/lib/project-roles";

type PeekMember = {
  id: string;
  user_id: string;
  project_role: ProjectRole;
  role_title: string | null;
  responsibilities: string | null;
  name: string;
  email: string | null;
};

export function ProjectMembersPeek({
  projectId,
  projectName,
  className,
}: {
  projectId: string;
  projectName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const { data: members, isLoading } = useQuery({
    queryKey: ["project-members-peek", projectId],
    enabled: open,
    queryFn: async (): Promise<PeekMember[]> => {
      const sb = getSupabase();
      const { data, error } = await sb
        .from("project_members")
        .select("id, user_id, project_role, role_title, responsibilities")
        .eq("project_id", projectId);
      if (error) throw error;
      const rows = data ?? [];
      const ids = rows.map((r) => r.user_id as string);
      const { data: profiles } = ids.length
        ? await sb.from("profiles").select("id, full_name, email").in("id", ids)
        : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
      const pMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      const order: Record<string, number> = { exec: 0, dept_head: 1, staff: 2 };
      return rows
        .map((m) => {
          const p = pMap.get(m.user_id as string);
          return {
            id: m.id as string,
            user_id: m.user_id as string,
            project_role: ((m as { project_role?: string }).project_role ?? "staff") as ProjectRole,
            role_title: (m as { role_title?: string | null }).role_title ?? null,
            responsibilities: (m as { responsibilities?: string | null }).responsibilities ?? null,
            name: p?.full_name || p?.email || "ผู้ใช้ไม่ทราบชื่อ",
            email: p?.email ?? null,
          };
        })
        .sort((a, b) => (order[a.project_role] ?? 9) - (order[b.project_role] ?? 9) || a.name.localeCompare(b.name));
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
          className={`inline-flex items-center gap-1 rounded-full border bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${className ?? ""}`}
        >
          <Users className="h-3 w-3" />สมาชิกโครงการ
        </button>
      </DialogTrigger>
      <DialogContent
        className="max-w-lg"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      >
        <DialogHeader>
          <DialogTitle>สมาชิกโครงการ</DialogTitle>
          <DialogDescription>{projectName}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted/60" />
            ))}
          </div>
        ) : (members?.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีสมาชิกในโครงการนี้</p>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
            {members!.map((m) => (
              <li key={m.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.name}</div>
                    {m.email && <div className="truncate text-xs text-muted-foreground">{m.email}</div>}
                    {m.role_title && <div className="mt-1 text-xs">ตำแหน่ง: {m.role_title}</div>}
                    {m.responsibilities && (
                      <div className="mt-0.5 text-xs text-muted-foreground">หน้าที่: {m.responsibilities}</div>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0">{PROJECT_ROLE_LABEL[m.project_role]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
