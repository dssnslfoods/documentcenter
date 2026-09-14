import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";

const searchSchema = z.object({
  redirect: z.string().optional(),
  /** ถูกพากลับมาจาก auth gate: บัญชีถูกปิด หรือยังไม่ถูกเพิ่มเข้าองค์กร */
  reason: z.enum(["inactive", "pending"]).optional(),
});

const REASON_MESSAGE = {
  inactive: "บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบขององค์กร",
  pending: "บัญชีนี้ยังไม่ได้ถูกเพิ่มเข้าองค์กร กรุณาติดต่อผู้ดูแลระบบขององค์กร",
} as const;

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  ssr: false,
  head: () => ({
    meta: [
      { title: "เข้าสู่ระบบ | Document Hub" },
      { name: "description", content: "เข้าสู่ระบบบริหารเอกสารและสัญญาองค์กร" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [tab, setTab] = useState<"signin" | "forgot">("signin");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileText className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">Document Hub</h1>
          <p className="mt-1 text-sm text-muted-foreground">ระบบบริหารเอกสารและสัญญาองค์กร</p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          {search.reason && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {REASON_MESSAGE[search.reason]}
            </div>
          )}
          <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "forgot")}>
            <TabsContent value="signin" className="mt-0">
              <SignInForm
                onForgot={() => setTab("forgot")}
                onSuccess={() => navigate({ to: search.redirect ?? "/dashboard" })}
              />
            </TabsContent>

            <TabsContent value="forgot" className="mt-0">
              <ForgotForm onBack={() => setTab("signin")} />
            </TabsContent>
          </Tabs>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          บัญชีผู้ใช้สร้างโดยผู้ดูแลระบบขององค์กร
          <br />
          <Link to="/" className="hover:underline">← กลับหน้าหลัก</Link>
        </p>
      </div>
    </div>
  );
}

function SignInForm({ onSuccess, onForgot }: { onSuccess: () => void; onForgot: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error("เข้าสู่ระบบไม่สำเร็จ", { description: error.message });
    toast.success("เข้าสู่ระบบสำเร็จ");
    onSuccess();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">อีเมล</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.co.th" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">รหัสผ่าน</Label>
          <button type="button" onClick={onForgot} className="text-xs text-primary hover:underline">
            ลืมรหัสผ่าน?
          </button>
        </div>
        <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        เข้าสู่ระบบ
      </Button>
    </form>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error("ส่งอีเมลไม่สำเร็จ", { description: error.message });
    toast.success("ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว", { description: "โปรดตรวจสอบอีเมลของคุณ" });
    onBack();
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        กรอกอีเมล ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านให้คุณ
      </p>
      <div className="space-y-2">
        <Label htmlFor="femail">อีเมล</Label>
        <Input id="femail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack}>ย้อนกลับ</Button>
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          ส่งลิงก์รีเซ็ต
        </Button>
      </div>
    </form>
  );
}
