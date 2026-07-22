import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-supabase";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { ShieldAlert, Users as UsersIcon, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/users")({
  head: () => ({ meta: [{ title: "ผู้ใช้งานและสิทธิ์ | Document Hub" }] }),
  component: UsersPage,
});

type Role = "super_admin" | "management" | "dept_manager" | "staff" | "viewer";
const ROLES: { value: Role; label: string; tone: string }[] = [
  { value: "super_admin", label: "ผู้ดูแลระบบสูงสุด", tone: "bg-destructive/10 text-destructive" },
  { value: "management", label: "ผู้บริหาร", tone: "bg-primary/10 text-primary" },
  { value: "dept_manager", label: "หัวหน้าแผนก", tone: "bg-warning/10 text-warning" },
  { value: "staff", label: "เจ้าหน้าที่", tone: "bg-muted text-foreground" },
  { value: "viewer", label: "ผู้อ่านอย่างเดียว", tone: "bg-muted text-muted-foreground" },
];
const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)?.label ?? r;
const roleTone = (r: Role) => ROLES.find((x) => x.value === r)?.tone ?? "bg-muted";

function UsersPage() {
  const sb = getSupabase();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Check if current user is super_admin
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
      const { data } = await sb.from("departments").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["users-list"],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { data: profiles, error } = await sb
        .from("profiles")
        .select("id, email, full_name, department_id, is_active, created_at, departments(name)")
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
        department_name: (p as any).departments?.name ?? null,
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
      // Replace roles: delete existing then insert
      await sb.from("user_roles").delete().eq("user_id", userId);
      const { error } = await sb.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("อัปเดตบทบาทเรียบร้อย");
      qc.invalidateQueries({ queryKey: ["users-list"] });
    },
    onError: (e: any) => toast.error(e.message ?? "เกิดข้อผิดพลาด"),
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
    onError: (e: any) => toast.error(e.message ?? "เกิดข้อผิดพลาด"),
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
    onError: (e: any) => toast.error(e.message ?? "เกิดข้อผิดพลาด"),
  });

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
      <PageHeader
        title="ผู้ใช้งานและสิทธิ์"
        description="จัดการบทบาทและแผนกของผู้ใช้งานในระบบ"
      />

      <Alert>
        <UsersIcon className="h-4 w-4" />
        <AlertTitle>วิธีเพิ่มผู้ใช้ใหม่</AlertTitle>
        <AlertDescription>
          ให้ผู้ใช้ใหม่ Sign up ที่หน้า <code>/auth</code> จากนั้นกลับมาที่หน้านี้เพื่อกำหนดบทบาทและแผนกให้ผู้ใช้ที่สร้างขึ้น
          (ผู้ใช้ใหม่จะถูกกำหนดเป็นบทบาท <b>staff</b> โดยอัตโนมัติ)
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px_200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาชื่อหรืออีเมล..."
                className="pl-9"
              />
            </div>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger><SelectValue placeholder="ทุกแผนก" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกแผนก</SelectItem>
                {(departments ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
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
            <EmptyState title="ไม่พบผู้ใช้งาน" description="ลองปรับตัวกรอง หรือเชิญผู้ใช้ใหม่ให้สมัครสมาชิก" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ผู้ใช้งาน</TableHead>
                  <TableHead>บทบาทปัจจุบัน</TableHead>
                  <TableHead className="w-[200px]">เปลี่ยนบทบาท</TableHead>
                  <TableHead className="w-[200px]">แผนก</TableHead>
                  <TableHead className="w-[120px]">สถานะ</TableHead>
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
                      <Select
                        value={u.roles[0] ?? ""}
                        onValueChange={(v) => changeRole.mutate({ userId: u.id, role: v as Role })}
                        disabled={u.id === user.id}
                      >
                        <SelectTrigger><SelectValue placeholder="เลือกบทบาท" /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.department_id ?? "none"}
                        onValueChange={(v) =>
                          changeDept.mutate({ userId: u.id, deptId: v === "none" ? null : v })
                        }
                      >
                        <SelectTrigger><SelectValue placeholder="เลือกแผนก" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">ไม่ระบุ</SelectItem>
                          {(departments ?? []).map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={u.is_active ? "outline" : "secondary"}
                        onClick={() => toggleActive.mutate({ userId: u.id, active: !u.is_active })}
                        disabled={u.id === user.id}
                      >
                        {u.is_active ? "ใช้งานอยู่" : "ปิดใช้งาน"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
