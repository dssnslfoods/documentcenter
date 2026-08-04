import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import { PageHeader, EmptyState } from "@/components/page-header";
import { SettingsNav } from "@/components/settings-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { ShieldAlert, UserPlus, Search, Copy, Pencil, KeyRound } from "lucide-react";
import { adminInviteUser } from "@/lib/admin-invite";
import { adminUpdateUser, adminResetPassword } from "@/lib/admin-users.functions";
import { useMyOrg } from "@/lib/org";
import { useMySupportAccess, useSetSupportAccess, useRevokeSupportAccess, isSupportActive } from "@/lib/support-access";

export const Route = createFileRoute("/_authenticated/settings/users")({
  head: () => ({ meta: [{ title: "ผู้ใช้งานและสิทธิ์ | Document Hub" }] }),
  component: UsersPage,
});

type Role = "super_admin" | "management" | "dept_manager" | "staff";
const ROLES: { value: Role; label: string; tone: string }[] = [
  { value: "super_admin", label: "ผู้ดูแลระบบสูงสุด", tone: "bg-destructive/10 text-destructive" },
  { value: "management", label: "ผู้บริหาร", tone: "bg-primary/10 text-primary" },
  { value: "dept_manager", label: "หัวหน้าแผนก", tone: "bg-warning/10 text-warning" },
  { value: "staff", label: "เจ้าหน้าที่", tone: "bg-muted text-foreground" },
];
const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)?.label ?? r;
const roleTone = (r: Role) => ROLES.find((x) => x.value === r)?.tone ?? "bg-muted";

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 12; i++) s += chars[arr[i] % chars.length];
  return s + "!";
}

function UsersPage() {
  const sb = getSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: myOrg } = useMyOrg();
  const { orgId: supportOrgId, row: supportRow } = useMySupportAccess();
  const setSupport = useSetSupportAccess();
  const revokeSupport = useRevokeSupportAccess();
  const supportOn = isSupportActive(supportRow);
  const [q, setQ] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // ---------- Invite dialog state ----------
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invForm, setInvForm] = useState({
    email: "", fullName: "", password: genPassword(),
    role: "staff" as Role, departmentId: "none",
  });
  const [lastCreated, setLastCreated] = useState<{ email: string; password: string } | null>(null);

  const { data: myRoles } = useQuery({
    queryKey: ["my-roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await sb.from("user_roles").select("role").eq("user_id", user!.id);
      return (data ?? []).map((r) => r.role as Role);
    },
  });
  const isAdmin = myRoles?.includes("super_admin");

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await sb.from("departments").select("id, name_th").order("name_th");
      return data ?? [];
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["users-list"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data: profiles, error } = await sb
        .from("profiles")
        .select("id, email, full_name, department_id, is_active, created_at, departments(name_th)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (profiles ?? []).map((p) => p.id);
      const { data: rolesData } = await sb.from("user_roles").select("user_id, role").in("user_id", ids);
      const roleMap = new Map<string, Role[]>();
      (rolesData ?? []).forEach((r) => {
        const arr = roleMap.get(r.user_id) ?? [];
        arr.push(r.role as Role);
        roleMap.set(r.user_id, arr);
      });
      return (profiles ?? []).map((p) => ({
        ...p,
        department_name: (p as unknown as { departments?: { name_th?: string } }).departments?.name_th ?? null,
        roles: roleMap.get(p.id) ?? [],
      }));
    },
  });

  const filtered = useMemo(() => {
    return (rows ?? []).filter((r) => {
      if (deptFilter !== "all" && r.department_id !== deptFilter) return false;
      if (roleFilter !== "all" && !r.roles.includes(roleFilter as Role)) return false;
      if (q) {
        const s = q.toLowerCase();
        if (!(r.full_name?.toLowerCase().includes(s) || r.email?.toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [rows, q, deptFilter, roleFilter]);

  const changeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      // ห้ามลบบทบาท platform_owner จากหน้าจัดการผู้ใช้ระดับองค์กร
      await sb.from("user_roles").delete().eq("user_id", userId).neq("role", "platform_owner");
      const { error } = await sb.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("อัปเดตบทบาทเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["users-list"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "เกิดข้อผิดพลาด"),
  });


  const [demoteTarget, setDemoteTarget] = useState<{ userId: string; role: Role; email: string } | null>(null);
  const [successorId, setSuccessorId] = useState<string>("");

  const promoteThenChange = useMutation({
    mutationFn: async ({ userId, role, successor }: { userId: string; role: Role; successor: string }) => {
      await sb.from("user_roles").delete().eq("user_id", successor).neq("role", "platform_owner");
      const { error: insErr } = await sb.from("user_roles").insert({ user_id: successor, role: "super_admin" });
      if (insErr) throw insErr;
      await sb.from("user_roles").delete().eq("user_id", userId).neq("role", "platform_owner");
      const { error } = await sb.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("แต่งตั้งผู้ดูแลระบบสูงสุดคนใหม่และเปลี่ยนบทบาทเรียบร้อย");
      setDemoteTarget(null);
      setSuccessorId("");
      qc.invalidateQueries({ queryKey: ["users-list"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "เกิดข้อผิดพลาด"),
  });

  const changeDept = useMutation({
    mutationFn: async ({ userId, deptId }: { userId: string; deptId: string | null }) => {
      const { error } = await sb.from("profiles").update({ department_id: deptId }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("อัปเดตแผนกเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["users-list"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "เกิดข้อผิดพลาด"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      const { error } = await sb.from("profiles").update({ is_active: active }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("อัปเดตสถานะเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["users-list"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "เกิดข้อผิดพลาด"),
  });

  const invite = useMutation({
    mutationFn: async () => {
      const email = invForm.email.trim().toLowerCase();
      const pw = invForm.password;
      if (!email || !pw) throw new Error("กรุณากรอกอีเมลและรหัสผ่าน");
      if (pw.length < 8) throw new Error("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร");
      const res = await adminInviteUser({ email, password: pw, fullName: invForm.fullName || email, organizationId: myOrg?.activeId ?? null });
      // If user came back (no email confirmation), update role/dept immediately
      if (res.userId) {
        if (invForm.role && invForm.role !== "staff") {
          await sb.from("user_roles").delete().eq("user_id", res.userId);
          await sb.from("user_roles").insert({ user_id: res.userId, role: invForm.role });
        }
        if (invForm.departmentId !== "none") {
          await sb.from("profiles").update({ department_id: invForm.departmentId }).eq("id", res.userId);
        }
        if (invForm.fullName) {
          await sb.from("profiles").update({ full_name: invForm.fullName }).eq("id", res.userId);
        }
      }
      return { email, password: pw, needsConfirmation: res.needsConfirmation };
    },
    onSuccess: (r) => {
      setLastCreated({ email: r.email, password: r.password });
      toast.success(
        r.needsConfirmation
          ? "สร้างบัญชีแล้ว — ผู้ใช้ต้องยืนยันอีเมลก่อนเข้าใช้งาน"
          : "สร้างบัญชีเรียบร้อย"
      );
      setInvForm({ email: "", fullName: "", password: genPassword(), role: "staff", departmentId: "none" });
      qc.invalidateQueries({ queryKey: ["users-list"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "สร้างบัญชีไม่สำเร็จ"),
  });

  const copyCreds = async () => {
    if (!lastCreated) return;
    await navigator.clipboard.writeText(
      `Email: ${lastCreated.email}\nPassword: ${lastCreated.password}`
    );
    toast.success("คัดลอกข้อมูลเข้าสู่ระบบแล้ว");
  };

  if (!user) return null;
  if (myRoles && !isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="ผู้ใช้งานและสิทธิ์" description="สำหรับผู้ดูแลระบบสูงสุดเท่านั้น" />
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>ไม่มีสิทธิ์เข้าถึง</AlertTitle>
          <AlertDescription>เฉพาะผู้ที่มีบทบาท Super Admin เท่านั้นที่สามารถจัดการผู้ใช้งานได้</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsNav />
      <PageHeader
        title="ผู้ใช้งานและสิทธิ์"
        description="เพิ่ม/เชิญผู้ใช้ กำหนดบทบาทและแผนก สำหรับใช้งานร่วมกันในระบบ"
        actions={
          <Dialog open={inviteOpen} onOpenChange={(v) => { setInviteOpen(v); if (!v) setLastCreated(null); }}>
            <DialogTrigger asChild>
              <Button><UserPlus className="h-4 w-4 mr-1" /> เพิ่มผู้ใช้</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>สร้างบัญชีผู้ใช้ใหม่</DialogTitle>
                <DialogDescription>
                  ระบบจะสร้างบัญชีทันทีและกำหนดบทบาท/แผนกให้อัตโนมัติ จากนั้นแจ้งรหัสผ่านให้ผู้ใช้ไปเปลี่ยนภายหลัง
                </DialogDescription>
              </DialogHeader>

              {lastCreated ? (
                <div className="space-y-3">
                  <Alert>
                    <AlertTitle>สร้างบัญชีสำเร็จ</AlertTitle>
                    <AlertDescription>
                      คัดลอกและแจ้งข้อมูลด้านล่างให้ผู้ใช้ (เก็บเป็นความลับ)
                    </AlertDescription>
                  </Alert>
                  <div className="rounded-md border bg-muted/40 p-3 font-mono text-sm">
                    <div>Email: {lastCreated.email}</div>
                    <div>Password: {lastCreated.password}</div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={copyCreds}><Copy className="h-4 w-4 mr-1" /> คัดลอก</Button>
                    <Button onClick={() => setLastCreated(null)}>เพิ่มอีกคน</Button>
                    <Button variant="ghost" onClick={() => { setLastCreated(null); setInviteOpen(false); }}>ปิด</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label>อีเมล *</Label>
                    <Input type="email" value={invForm.email}
                      onChange={(e) => setInvForm({ ...invForm, email: e.target.value })}
                      placeholder="user@company.co.th" />
                  </div>
                  <div>
                    <Label>ชื่อ-นามสกุล</Label>
                    <Input value={invForm.fullName}
                      onChange={(e) => setInvForm({ ...invForm, fullName: e.target.value })} />
                  </div>
                  <div>
                    <Label>รหัสผ่านชั่วคราว *</Label>
                    <div className="flex gap-2">
                      <Input value={invForm.password}
                        onChange={(e) => setInvForm({ ...invForm, password: e.target.value })} />
                      <Button type="button" variant="outline"
                        onClick={() => setInvForm({ ...invForm, password: genPassword() })}>
                        สุ่มใหม่
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>บทบาท</Label>
                      <Select value={invForm.role} onValueChange={(v) => setInvForm({ ...invForm, role: v as Role })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>แผนก</Label>
                      <Select value={invForm.departmentId} onValueChange={(v) => setInvForm({ ...invForm, departmentId: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">ไม่ระบุ</SelectItem>
                          {(departments ?? []).map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setInviteOpen(false)}>ยกเลิก</Button>
                    <Button onClick={() => invite.mutate()} disabled={invite.isPending}>
                      สร้างบัญชี
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px_200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาชื่อหรืออีเมล..." className="pl-9" />
            </div>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger><SelectValue placeholder="ทุกแผนก" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกแผนก</SelectItem>
                {(departments ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger><SelectValue placeholder="ทุกบทบาท" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกบทบาท</SelectItem>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">กำลังโหลด...</div>
          ) : filtered.length === 0 ? (
            <EmptyState title="ไม่พบผู้ใช้งาน" description="ลองปรับตัวกรอง หรือเพิ่มผู้ใช้ใหม่จากปุ่มด้านบน" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ผู้ใช้งาน</TableHead>
                  <TableHead>บทบาทปัจจุบัน</TableHead>
                  <TableHead className="w-[200px]">เปลี่ยนบทบาท</TableHead>
                  <TableHead className="w-[200px]">แผนก</TableHead>
                  <TableHead className="w-[120px]">สถานะ</TableHead>
                  <TableHead className="w-[150px] text-right">จัดการ</TableHead>

                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.full_name || "-"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <Badge variant="outline">ไม่มีบทบาท</Badge>
                        ) : (
                          u.roles.map((r) => (
                            <span key={r} className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${roleTone(r)}`}>
                              {roleLabel(r)}
                            </span>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select value={u.roles[0] ?? ""}
                        onValueChange={(v) => {
                          const role = v as Role;
                          const wasSuperAdmin = u.roles.includes("super_admin" as Role);
                          const othersLeft = (rows ?? []).some(
                            (x) => x.id !== u.id && x.roles.includes("super_admin" as Role),
                          );
                          if (wasSuperAdmin && role !== "super_admin" && !othersLeft) {
                            setSuccessorId("");
                            setDemoteTarget({ userId: u.id, role, email: u.email ?? "" });
                            return;
                          }
                          changeRole.mutate({ userId: u.id, role });
                        }}
                        disabled={u.id === user.id}>
                        <SelectTrigger><SelectValue placeholder="เลือกบทบาท" /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {u.roles.includes("platform_owner" as Role) && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          ผู้ดูแลแพลตฟอร์ม — ถอดสิทธิ์ไม่ได้
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select value={u.department_id ?? "none"}
                        onValueChange={(v) => changeDept.mutate({ userId: u.id, deptId: v === "none" ? null : v })}>
                        <SelectTrigger><SelectValue placeholder="เลือกแผนก" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">ไม่ระบุ</SelectItem>
                          {(departments ?? []).map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name_th}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {u.roles.includes("platform_owner" as Role) ? (
                        <div className="space-y-1">
                          <Button size="sm" variant={supportOn ? "outline" : "secondary"}
                            disabled={!supportOrgId || setSupport.isPending || revokeSupport.isPending}
                            onClick={() => {
                              if (!supportOrgId) return;
                              if (supportOn) {
                                revokeSupport.mutate(supportOrgId, {
                                  onSuccess: () => toast.success("ปิดการใช้งานแล้ว — ผู้ดูแลแพลตฟอร์มเข้าองค์กรนี้ไม่ได้"),
                                  onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "ปิดการใช้งานไม่สำเร็จ"),
                                });
                              } else {
                                setSupport.mutate(
                                  { organizationId: supportOrgId, enabled: true, grantedBy: user.id },
                                  {
                                    onSuccess: () => toast.success("เปิดให้ผู้ดูแลแพลตฟอร์มเข้าองค์กรนี้ได้"),
                                    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "เปิดการใช้งานไม่สำเร็จ"),
                                  },
                                );
                              }
                            }}>
                            {supportOn ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                          </Button>
                          <p className="text-xs text-muted-foreground">สิทธิ์เข้าองค์กรนี้ของผู้ดูแลแพลตฟอร์ม</p>
                        </div>
                      ) : (
                        <Button size="sm" variant={u.is_active ? "outline" : "secondary"}
                          onClick={() => toggleActive.mutate({ userId: u.id, active: !u.is_active })}
                          disabled={u.id === user.id}>
                          {u.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline"
                          onClick={() => {
                            setEditTarget({ id: u.id, email: u.email ?? "" });
                            setEditForm({
                              email: u.email ?? "",
                              fullName: u.full_name ?? "",
                              phone: (u as { phone?: string | null }).phone ?? "",
                              position: (u as { position?: string | null }).position ?? "",
                            });
                          }}>
                          <Pencil className="h-3.5 w-3.5 sm:mr-1" />
                          <span className="hidden sm:inline">แก้ไข</span>
                        </Button>
                        <Button size="sm" variant="outline"
                          onClick={() => {
                            setPwTarget({ id: u.id, email: u.email ?? "" });
                            setNewPassword(genPassword());
                            setPwDone(false);
                          }}>
                          <KeyRound className="h-3.5 w-3.5 sm:mr-1" />
                          <span className="hidden sm:inline">รีเซ็ตรหัส</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!demoteTarget} onOpenChange={(v) => { if (!v) { setDemoteTarget(null); setSuccessorId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ต้องแต่งตั้งผู้ดูแลระบบสูงสุดคนใหม่</DialogTitle>
            <DialogDescription>
              {demoteTarget?.email} เป็นผู้ดูแลระบบสูงสุดคนสุดท้ายขององค์กร — องค์กรต้องมีอย่างน้อย 1 คน
              กรุณาเลือกผู้ใช้ในองค์กรมารับสิทธิ์แทนก่อน
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>ผู้ดูแลคนใหม่ *</Label>
            <Select value={successorId} onValueChange={setSuccessorId}>
              <SelectTrigger><SelectValue placeholder="เลือกผู้ใช้ในองค์กร" /></SelectTrigger>
              <SelectContent>
                {(rows ?? [])
                  .filter((x) => x.id !== demoteTarget?.userId && x.is_active)
                  .map((x) => (
                    <SelectItem key={x.id} value={x.id}>{x.full_name || x.email}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDemoteTarget(null)}>ยกเลิก</Button>
            <Button
              disabled={!successorId || promoteThenChange.isPending}
              onClick={() =>
                demoteTarget &&
                promoteThenChange.mutate({ userId: demoteTarget.userId, role: demoteTarget.role, successor: successorId })
              }
            >
              แต่งตั้งและเปลี่ยนบทบาท
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
