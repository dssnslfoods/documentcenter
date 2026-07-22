import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "รีเซ็ตรหัสผ่าน | Document Hub" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return toast.error("รหัสผ่านไม่ตรงกัน");
    if (pw.length < 8) return toast.error("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
    setLoading(true);
    const { error } = await getSupabase().auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return toast.error("รีเซ็ตไม่สำเร็จ", { description: error.message });
    toast.success("รีเซ็ตรหัสผ่านสำเร็จ");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6">
        <h1 className="text-xl font-semibold">ตั้งรหัสผ่านใหม่</h1>
        <div className="space-y-2">
          <Label>รหัสผ่านใหม่</Label>
          <Input type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>ยืนยันรหัสผ่านใหม่</Label>
          <Input type="password" required minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          บันทึกรหัสผ่านใหม่
        </Button>
      </form>
    </div>
  );
}
