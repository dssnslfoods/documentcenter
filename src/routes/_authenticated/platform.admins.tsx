import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { adminInviteUser } from "@/lib/admin-invite";
import { PageHeader, EmptyState } from "@/components/page-header";
import { PlatformGuard, PlatformNav } from "@/components/platform-nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShieldCheck, UserPlus, Copy, Trash2, History, RotateCcw } from "lucide-react";
import { useOrganizations } from "@/lib/org";

export const Route = createFileRoute("/_authenticated/platform/admins")({
  head: () => ({
    meta: [
      { title: "ผู้ดูแลแพลตฟอร์ม · ผู้ดูแลองค์กร | Document Hub" },
      { name: "description", content: "สร้างและจัดการบัญชีผู้ดูแลองค์กร (super admin) ของแต่ละองค์กร" },
      { property: "og:title", content: "ผู้ดูแลองค์กร" },
      { property: "og:description", content: "สร้างและจัดการบัญชีผู้ดูแลองค์กรของแต่ละองค์กร" },
    ],
  }),
  component: () => (
    <PlatformGuard title="ผู้ดูแลองค์กร">
      <OrgAdminsPage />
    </PlatformGuard>
  ),
});

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

type AdminRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  organization_id: string | null;
  is_active: boolean;
};

function OrgAdminsPage() {
  const qc = useQueryClient();
  const sb = getSupabase();
  const { data: orgs } = useOrganizations(true);
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState({
    email: "", fullName: "", password: genPassword(), organizationId: "",
  });

  const { data: admins, isLoading } = useQuery({
    queryKey: ["platform-org-admins"],
    queryFn: async () => {
      const { data: roleRows } = await sb.from("user_roles").select("user_id, role").eq("role", "super_admin");
      const ids = ((roleRows ?? []) as { user_id: string }[]).map((r) => r.user_id);
      if (!ids.length) return [] as AdminRow[];
      const { data } = await sb
        .from("profiles")
        .select("id, email, full_name, organization_id, is_active")
        .in("id", ids);
      return ((data ?? []) as AdminRow[]);
    },
  });

  const orgName = (id: string | null) => orgs?.find((o) => o.id === id)?.name ?? "—";

  const filtered = useMemo(
    () => (admins ?? []).filter((a) => orgFilter === "all" || a.organization_id === orgFilter),
    [admins, orgFilter],
  );

  const create = useMutation({
    mutationFn: async () => {
      const email = form.email.trim().toLowerCase();
      if (!email) throw new Error("กรุณากรอกอีเมล");
      if (form.password.length < 8) throw new Error("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร");
      if (!form.organizationId) throw new Error("กรุณาเลือกองค์กร");

      const promote = async (userId: string) => {
        await sb.from("user_roles").delete().eq("user_id", userId).neq("role", "platform_owner");
        const { error } = await sb.from("user_roles").insert({ user_id: userId, role: "super_admin" });
        if (error) throw error;
        await sb
          .from("profiles")
          .update({
            organization_id: form.organizationId,
            ...(form.fullName ? { full_name: form.fullName } : {}),
            is_active: true,
          })
          .eq("id", userId);
      };

      let res: { userId: string | null; needsConfirmation: boolean };
      try {
        res = await adminInviteUser({
          email,
          password: form.password,
          fullName: form.fullName || email,
          organizationId: form.organizationId,
        });
      } catch (e) {
        const msg = (e as Error).message ?? "";
        if (!/already registered|already been registered|user_exists/i.test(msg)) throw e;
        // มีบัญชีนี้อยู่แล้ว → เลื่อนบทบาทเป็นผู้ดูแลองค์กรแทนการสร้างใหม่
        const { data: existing } = await sb
          .from("profiles").select("id").ilike("email", email).maybeSingle();
        if (!existing) {
          throw new Error("อีเมลนี้มีบัญชีอยู่แล้วในระบบยืนยันตัวตน แต่ยังไม่มีโปรไฟล์ — ให้ผู้ใช้เข้าสู่ระบบ 1 ครั้งก่อน แล้วลองใหม่");
        }
        await promote((existing as { id: string }).id);
        return { email, password: "", needsConfirmation: false, existed: true };
      }

      if (res.userId) await promote(res.userId);
      return { email, password: form.password, needsConfirmation: res.needsConfirmation, existed: false };
    },
    onSuccess: (r) => {
      if (r.existed) {
        toast.success("อีเมลนี้มีบัญชีอยู่แล้ว — ตั้งเป็นผู้ดูแลองค์กรให้เรียบร้อยแล้ว");
        setOpen(false);
      } else {
        setCreated({ email: r.email, password: r.password });
        toast.success(
          r.needsConfirmation ? "สร้างบัญชีแล้ว — ผู้ใช้ต้องยืนยันอีเมลก่อนเข้าใช้งาน" : "สร้างผู้ดูแลองค์กรเรียบร้อย",
        );
      }
      setForm({ email: "", fullName: "", password: genPassword(), organizationId: "" });
      qc.invalidateQueries({ queryKey: ["platform-org-admins"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "สร้างบัญชีไม่สำเร็จ"),
  });


  // ---- แต่งตั้งผู้ใช้ที่มีอยู่แล้วเป็นผู้ดูแลองค์กร
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [pickUserId, setPickUserId] = useState<string>("");

  const { data: candidates, isLoading: candidatesLoading } = useQuery({
    queryKey: ["platform-candidate-users", form.organizationId],
    enabled: open && mode === "existing",
    queryFn: async () => {
      let q = sb
        .from("profiles")
        .select("id, email, full_name, organization_id, is_active")
        .order("full_name");
      if (form.organizationId) q = q.eq("organization_id", form.organizationId);
      const { data } = await q;
      return (data ?? []) as AdminRow[];
    },
  });

  const candidateList = useMemo(
    () => (candidates ?? []).filter((c) => !(admins ?? []).some((a) => a.id === c.id)),
    [candidates, admins],
  );

  const promoteExisting = useMutation({
    mutationFn: async (userId: string) => {
      if (!form.organizationId) throw new Error("กรุณาเลือกองค์กร");
      await sb.from("user_roles").delete().eq("user_id", userId).neq("role", "platform_owner");
      const { error } = await sb.from("user_roles").insert({ user_id: userId, role: "super_admin" });
      if (error) throw error;
      const { error: pErr } = await sb
        .from("profiles")
        .update({ organization_id: form.organizationId, is_active: true })
        .eq("id", userId);
      if (pErr) throw pErr;
    },
    onSuccess: () => {
      toast.success("แต่งตั้งเป็นผู้ดูแลองค์กรเรียบร้อย");
      setPickUserId("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["platform-org-admins"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "แต่งตั้งไม่สำเร็จ"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await sb.from("profiles").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("อัปเดตสถานะแล้ว");
      qc.invalidateQueries({ queryKey: ["platform-org-admins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [revokeTarget, setRevokeTarget] = useState<AdminRow | null>(null);
  const [successorId, setSuccessorId] = useState<string>("");

  const isLastAdminOfOrg = (a: AdminRow) =>
    (admins ?? []).filter((x) => x.organization_id === a.organization_id && x.id !== a.id).length === 0;

  const { data: orgMembers } = useQuery({
    queryKey: ["platform-org-members", revokeTarget?.organization_id],
    enabled: !!revokeTarget?.organization_id,
    queryFn: async () => {
      const { data } = await sb
        .from("profiles")
        .select("id, email, full_name")
        .eq("organization_id", revokeTarget!.organization_id!)
        .neq("id", revokeTarget!.id)
        .eq("is_active", true);
      return (data ?? []) as { id: string; email: string | null; full_name: string | null }[];
    },
  });

  const revoke = useMutation({
    mutationFn: async ({ id, successor }: { id: string; successor?: string }) => {
      if (successor) {
        await sb.from("user_roles").delete().eq("user_id", successor);
        const { error: insErr } = await sb.from("user_roles").insert({ user_id: successor, role: "super_admin" });
        if (insErr) throw insErr;
      }
      const { error: delErr } = await sb
        .from("user_roles").delete().eq("user_id", id).eq("role", "super_admin");
      if (delErr) throw delErr;
      const { error } = await sb.from("user_roles").insert({ user_id: id, role: "staff" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ถอดสิทธิ์ผู้ดูแลองค์กรแล้ว");
      setRevokeTarget(null);
      setSuccessorId("");
      qc.invalidateQueries({ queryKey: ["platform-org-admins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [fixOrgId, setFixOrgId] = useState<string>("");
  const orgsWithoutAdmin = useMemo(
    () => (orgs ?? []).filter((o) => !(admins ?? []).some((a) => a.organization_id === o.id)),
    [orgs, admins],
  );

  const { data: fixMembers } = useQuery({
    queryKey: ["platform-appoint-members", fixOrgId],
    enabled: !!fixOrgId,
    queryFn: async () => {
      const { data } = await sb
        .from("profiles")
        .select("id, email, full_name")
        .eq("organization_id", fixOrgId)
        .eq("is_active", true);
      return (data ?? []) as { id: string; email: string | null; full_name: string | null }[];
    },
  });

  const appoint = useMutation({
    mutationFn: async (userId: string) => {
      await sb.from("user_roles").delete().eq("user_id", userId).neq("role", "platform_owner");
      const { error } = await sb.from("user_roles").insert({ user_id: userId, role: "super_admin" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("แต่งตั้งผู้ดูแลองค์กรเรียบร้อย");
      setFixOrgId("");
      qc.invalidateQueries({ queryKey: ["platform-org-admins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleRevokeClick = (a: AdminRow) => {
    if (isLastAdminOfOrg(a)) {
      setSuccessorId("");
      setRevokeTarget(a);
      return;
    }
    revoke.mutate({ id: a.id });
  };

  const moveOrg = useMutation({
    mutationFn: async ({ id, orgId }: { id: string; orgId: string }) => {
      const { error } = await sb.from("profiles").update({ organization_id: orgId }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ย้ายองค์กรแล้ว");
      qc.invalidateQueries({ queryKey: ["platform-org-admins"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyCreds = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.password}`);
    toast.success("คัดลอกข้อมูลเข้าสู่ระบบแล้ว");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="ผู้ดูแลองค์กร (Super Admin)"
        description="สร้างบัญชีผู้ดูแลระดับองค์กร และกำหนดว่าสังกัดองค์กรใด"
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setCreated(null); }}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto"><UserPlus className="mr-2 h-4 w-4" />เพิ่มผู้ดูแลองค์กร</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>สร้างบัญชีผู้ดูแลองค์กร</DialogTitle>
                <DialogDescription>
                  ระบบจะสร้างบัญชีพร้อมกำหนดบทบาท super_admin และสังกัดองค์กรที่เลือกให้อัตโนมัติ
                </DialogDescription>
              </DialogHeader>

              {created ? (
                <div className="space-y-3">
                  <Alert>
                    <AlertTitle>สร้างบัญชีสำเร็จ</AlertTitle>
                    <AlertDescription>คัดลอกและแจ้งข้อมูลด้านล่างให้ผู้ดูแลองค์กร (เก็บเป็นความลับ)</AlertDescription>
                  </Alert>
                  <div className="break-all rounded-md border bg-muted/40 p-3 font-mono text-sm">
                    <div>Email: {created.email}</div>
                    <div>Password: {created.password}</div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={copyCreds}><Copy className="mr-1 h-4 w-4" />คัดลอก</Button>
                    <Button onClick={() => setCreated(null)}>เพิ่มอีกคน</Button>
                    <Button variant="ghost" onClick={() => { setCreated(null); setOpen(false); }}>ปิด</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>องค์กร *</Label>
                    <Select value={form.organizationId} onValueChange={(v) => setForm({ ...form, organizationId: v })}>
                      <SelectTrigger><SelectValue placeholder="เลือกองค์กร" /></SelectTrigger>
                      <SelectContent>
                        {(orgs ?? []).map((o) => (
                          <SelectItem key={o.id} value={o.id}>{o.code} · {o.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>อีเมล *</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ชื่อ-นามสกุล</Label>
                    <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>รหัสผ่านเริ่มต้น *</Label>
                    <div className="flex gap-2">
                      <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                      <Button type="button" variant="outline" onClick={() => setForm({ ...form, password: genPassword() })}>
                        สุ่ม
                      </Button>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
                    <Button onClick={() => create.mutate()} disabled={create.isPending}>สร้างบัญชี</Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        }
      />
      <PlatformNav />

      {orgsWithoutAdmin.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>มีองค์กรที่ยังไม่มีผู้ดูแลองค์กร</AlertTitle>
          <AlertDescription>
            <div className="mt-2 space-y-2">
              {orgsWithoutAdmin.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{o.name}</span>
                  {fixOrgId === o.id ? (
                    <>
                      <Select onValueChange={(v) => appoint.mutate(v)}>
                        <SelectTrigger className="h-8 w-64 text-xs"><SelectValue placeholder="เลือกผู้ใช้มาเป็นผู้ดูแล" /></SelectTrigger>
                        <SelectContent>
                          {(fixMembers ?? []).map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" onClick={() => setFixOrgId("")}>ยกเลิก</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setFixOrgId(o.id)}>แต่งตั้งผู้ดูแล</Button>
                  )}
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs text-muted-foreground">กรององค์กร</Label>
        <Select value={orgFilter} onValueChange={setOrgFilter}>
          <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกองค์กร</SelectItem>
            {(orgs ?? []).map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : !filtered.length ? (
            <EmptyState icon={ShieldCheck} title="ยังไม่มีผู้ดูแลองค์กร" description="สร้างบัญชีผู้ดูแลองค์กรเพื่อให้ดูแลผู้ใช้ในองค์กรนั้น" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ผู้ดูแล</TableHead>
                    <TableHead className="w-56">องค์กร</TableHead>
                    <TableHead className="whitespace-nowrap">สถานะ</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="font-medium break-words">{a.full_name || "—"}</div>
                        <div className="break-all text-xs text-muted-foreground">{a.email}</div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={a.organization_id ?? ""}
                          onValueChange={(v) => moveOrg.mutate({ id: a.id, orgId: v })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder={orgName(a.organization_id)} />
                          </SelectTrigger>
                          <SelectContent>
                            {(orgs ?? []).map((o) => (
                              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {a.is_active ? (
                          <Badge className="bg-success/10 text-success">ใช้งาน</Badge>
                        ) : (
                          <Badge variant="secondary">ปิดใช้งาน</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleActive.mutate({ id: a.id, active: !a.is_active })}
                          >
                            {a.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRevokeClick(a)}>
                            <Trash2 className="mr-1 h-3.5 w-3.5" />ถอดสิทธิ์
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RoleChangeLogCard orgFilter={orgFilter} orgName={orgName} />

      <Dialog open={!!revokeTarget} onOpenChange={(v) => { if (!v) { setRevokeTarget(null); setSuccessorId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ต้องแต่งตั้งผู้ดูแลองค์กรคนใหม่</DialogTitle>
            <DialogDescription>
              {revokeTarget?.email} เป็นผู้ดูแลองค์กรคนสุดท้ายของ {orgName(revokeTarget?.organization_id ?? null)} —
              องค์กรต้องมีผู้ดูแลอย่างน้อย 1 คน กรุณาเลือกผู้ใช้ในองค์กรมารับสิทธิ์แทน
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>ผู้ดูแลคนใหม่ *</Label>
            <Select value={successorId} onValueChange={setSuccessorId}>
              <SelectTrigger><SelectValue placeholder="เลือกผู้ใช้ในองค์กร" /></SelectTrigger>
              <SelectContent>
                {(orgMembers ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!(orgMembers ?? []).length && (
              <p className="text-xs text-destructive">ไม่มีผู้ใช้อื่นในองค์กรนี้ — ต้องเพิ่มผู้ใช้ก่อนจึงถอดสิทธิ์ได้</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>ยกเลิก</Button>
            <Button
              disabled={!successorId || revoke.isPending}
              onClick={() => revokeTarget && revoke.mutate({ id: revokeTarget.id, successor: successorId })}
            >
              แต่งตั้งและถอดสิทธิ์
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type LogRow = {
  id: string;
  organization_id: string | null;
  user_id: string;
  role: string;
  action: string;
  actor_id: string | null;
  restored_at: string | null;
  created_at: string;
};

const ROLE_TH: Record<string, string> = {
  platform_owner: "ผู้ดูแลแพลตฟอร์ม",
  super_admin: "ผู้ดูแลองค์กร",
  management: "ผู้บริหาร",
  dept_manager: "ผู้จัดการฝ่าย",
  staff: "เจ้าหน้าที่",
};

function RoleChangeLogCard({
  orgFilter,
  orgName,
}: {
  orgFilter: string;
  orgName: (id: string | null) => string;
}) {
  const sb = getSupabase();
  const qc = useQueryClient();

  const { data: logs, isLoading } = useQuery({
    queryKey: ["role-change-log", orgFilter],
    queryFn: async () => {
      let q = sb
        .from("role_change_log")
        .select("id, organization_id, user_id, role, action, actor_id, restored_at, created_at")
        .eq("action", "revoked")
        .order("created_at", { ascending: false })
        .limit(100);
      if (orgFilter !== "all") q = q.eq("organization_id", orgFilter);
      const { data } = await q;
      return (data ?? []) as LogRow[];
    },
  });

  const ids = useMemo(() => {
    const s = new Set<string>();
    (logs ?? []).forEach((l) => {
      s.add(l.user_id);
      if (l.actor_id) s.add(l.actor_id);
    });
    return [...s];
  }, [logs]);

  const { data: people } = useQuery({
    queryKey: ["role-change-log-people", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await sb.from("profiles").select("id, email, full_name").in("id", ids);
      const map: Record<string, string> = {};
      ((data ?? []) as { id: string; email: string | null; full_name: string | null }[]).forEach((p) => {
        map[p.id] = p.full_name || p.email || p.id.slice(0, 8);
      });
      return map;
    },
  });

  const nameOf = (id: string | null) => (id ? people?.[id] ?? "—" : "—");

  const restore = useMutation({
    mutationFn: async (row: LogRow) => {
      const { data: existing } = await sb
        .from("user_roles")
        .select("id")
        .eq("user_id", row.user_id)
        .eq("role", row.role)
        .maybeSingle();
      if (!existing) {
        const { error } = await sb.from("user_roles").insert({ user_id: row.user_id, role: row.role });
        if (error) throw error;
      }
      const { error: upErr } = await sb
        .from("role_change_log")
        .update({ restored_at: new Date().toISOString() })
        .eq("id", row.id);
      if (upErr) throw upErr;
    },
    onSuccess: () => {
      toast.success("กู้คืนสิทธิ์เรียบร้อย");
      qc.invalidateQueries({ queryKey: ["role-change-log"] });
      qc.invalidateQueries({ queryKey: ["platform-org-admins"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "กู้คืนสิทธิ์ไม่สำเร็จ"),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />ประวัติการถอดสิทธิ์
        </CardTitle>
        <CardDescription>บันทึกการถอดบทบาทผู้ใช้ พร้อมกู้คืนสิทธิ์เดิมกลับมาได้</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
        ) : !(logs ?? []).length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีประวัติการถอดสิทธิ์</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ผู้ใช้</TableHead>
                  <TableHead className="whitespace-nowrap">บทบาทที่ถูกถอด</TableHead>
                  <TableHead className="w-48">องค์กร</TableHead>
                  <TableHead className="whitespace-nowrap">ผู้ดำเนินการ / เวลา</TableHead>
                  <TableHead className="text-right">กู้คืน</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logs ?? []).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium break-words">{nameOf(l.user_id)}</TableCell>
                    <TableCell><Badge variant="secondary">{ROLE_TH[l.role] ?? l.role}</Badge></TableCell>
                    <TableCell className="text-sm">{orgName(l.organization_id)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{nameOf(l.actor_id)}</div>
                      <div>{new Date(l.created_at).toLocaleString("th-TH")}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      {l.restored_at ? (
                        <Badge className="bg-success/10 text-success">กู้คืนแล้ว</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={restore.isPending}
                          onClick={() => restore.mutate(l)}
                        >
                          <RotateCcw className="mr-1 h-3.5 w-3.5" />กู้คืนสิทธิ์
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
