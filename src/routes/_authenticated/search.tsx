import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, FolderKanban, FileText, ListChecks, FileSignature } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";
import { fmtDate } from "@/lib/format";
import { LIFECYCLE_LABEL, STATUS_TONE, type ProjectLifecycleStatus } from "@/lib/project-lifecycle";

const searchSchema = z.object({ q: z.string().optional() });

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({ meta: [{ title: "ค้นหาข้อมูล | Document Hub" }] }),
  validateSearch: (s) => searchSchema.parse(s),
  component: SmartSearch,
});

function SmartSearch() {
  const navigate = useNavigate({ from: "/search" });
  const { q: initialQ } = Route.useSearch();
  const [q, setQ] = useState(initialQ ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      navigate({ search: { q: q || undefined }, replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [q, navigate]);

  const term = q.trim();
  const enabled = term.length >= 2;

  const { data: projects } = useQuery({
    queryKey: ["search-projects", term],
    enabled,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("projects")
        .select("id, code, name, status, customer_name")
        .or(`name.ilike.%${term}%,code.ilike.%${term}%,customer_name.ilike.%${term}%,description.ilike.%${term}%`)
        .is("archived_at", null)
        .limit(20);
      return data ?? [];
    },
  });

  const { data: documents } = useQuery({
    queryKey: ["search-documents", term],
    enabled,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("documents")
        .select("id, doc_no, title, status")
        .or(`title.ilike.%${term}%,doc_no.ilike.%${term}%,description.ilike.%${term}%`)
        .limit(20);
      return data ?? [];
    },
  });

  const { data: contracts } = useQuery({
    queryKey: ["search-contracts", term],
    enabled,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("contracts")
        .select("id, contract_no, title, status, end_date")
        .or(`title.ilike.%${term}%,contract_no.ilike.%${term}%`)
        .limit(20);
      return data ?? [];
    },
  });

  const { data: milestones } = useQuery({
    queryKey: ["search-milestones", term],
    enabled,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("project_milestones")
        .select("id, description, due_date, status, project_id, projects(code, name)")
        .or(`description.ilike.%${term}%,notes.ilike.%${term}%`)
        .limit(20);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="ค้นหาข้อมูล" description="ค้นข้ามโครงการ เอกสาร สัญญา และงวดงาน" />

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="พิมพ์คำค้นอย่างน้อย 2 ตัวอักษร..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {!enabled ? (
        <p className="text-center text-sm text-muted-foreground">กรอกคำค้นเพื่อเริ่มค้นหา</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ResultCard icon={FolderKanban} title="โครงการ" count={projects?.length ?? 0}>
            {projects?.map((p) => {
              const st = (p.status ?? "draft") as ProjectLifecycleStatus;
              return (
                <Link key={p.id} to="/projects/$id" params={{ id: p.id }} className="flex items-center justify-between gap-3 rounded-md p-2 text-sm hover:bg-muted/60">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{p.code} · {p.customer_name ?? "-"}</div>
                  </div>
                  <Badge variant="outline" className={STATUS_TONE[st]}>{LIFECYCLE_LABEL[st]}</Badge>
                </Link>
              );
            })}
          </ResultCard>

          <ResultCard icon={ListChecks} title="งวดงาน" count={milestones?.length ?? 0}>
            {milestones?.map((m) => {
              const proj = Array.isArray(m.projects) ? m.projects[0] : m.projects;
              return (
                <Link key={m.id} to="/projects/$id" params={{ id: m.project_id }} className="block rounded-md p-2 text-sm hover:bg-muted/60">
                  <div className="truncate font-medium">{m.description}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {proj?.code ?? ""} · {proj?.name ?? ""} · กำหนด {fmtDate(m.due_date)}
                  </div>
                </Link>
              );
            })}
          </ResultCard>

          <ResultCard icon={FileText} title="เอกสาร" count={documents?.length ?? 0}>
            {documents?.map((d) => (
              <Link key={d.id} to="/documents/$id" params={{ id: d.id }} className="block rounded-md p-2 text-sm hover:bg-muted/60">
                <div className="truncate font-medium">{d.title}</div>
                <div className="truncate text-xs text-muted-foreground">{d.doc_no}</div>
              </Link>
            ))}
          </ResultCard>

          <ResultCard icon={FileSignature} title="สัญญา" count={contracts?.length ?? 0}>
            {contracts?.map((c) => (
              <Link key={c.id} to="/contracts/$id" params={{ id: c.id }} className="block rounded-md p-2 text-sm hover:bg-muted/60">
                <div className="truncate font-medium">{c.title}</div>
                <div className="truncate text-xs text-muted-foreground">{c.contract_no} · สิ้นสุด {fmtDate(c.end_date)}</div>
              </Link>
            ))}
          </ResultCard>
        </div>
      )}
    </div>
  );
}

function ResultCard({
  icon: Icon, title, count, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-muted-foreground" />{title}
        </CardTitle>
        <Badge variant="secondary">{count}</Badge>
      </CardHeader>
      <CardContent className="pt-0">
        {count === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">ไม่พบข้อมูล</p>
        ) : (
          <div className="space-y-0.5">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}
