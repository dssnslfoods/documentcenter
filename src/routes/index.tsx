import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { FileText, ShieldCheck, Bell, Search, Users, Calendar } from "lucide-react";
import { getSupabase } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const sb = getSupabase();
      const { data } = await sb.auth.getSession();
      if (data.session) throw redirect({ to: "/dashboard" });
    } catch (e) {
      if ((e as { isRedirect?: boolean })?.isRedirect) throw e;
    }
  },
  head: () => ({
    meta: [
      { title: "Corporate Document & Contract Hub" },
      { name: "description", content: "ศูนย์กลางบริหารเอกสารและสัญญาองค์กร ค้นหาไว ควบคุมสิทธิ์แม่นยำ แจ้งเตือนอัตโนมัติ" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">Document Hub</div>
              <div className="text-xs text-muted-foreground">ระบบบริหารเอกสารและสัญญา</div>
            </div>
          </div>
          <Link
            to="/auth"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-16">
        <section className="text-center">
          <div className="inline-flex items-center rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="mr-1 h-3 w-3 text-accent" />
            ปลอดภัยระดับองค์กร · RBAC + Audit Trail
          </div>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            บริหารเอกสารและสัญญาองค์กร<br />
            <span className="text-primary">อย่างเป็นระบบและปลอดภัย</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            รวมสัญญา ใบเสนอราคา งานจัดจ้าง และเอกสารสำคัญไว้ในที่เดียว
            ค้นหาไว ควบคุมสิทธิ์แม่นยำ แจ้งเตือนก่อนหมดอายุอัตโนมัติ
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/auth" className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">
              เริ่มใช้งาน
            </Link>
          </div>
        </section>

        <section className="mt-20 grid gap-6 md:grid-cols-3">
          {[
            { icon: Search, title: "ค้นหาอัจฉริยะ", desc: "ค้นหาจากเลขที่ ชื่อ คู่ค้า Tag หรือเนื้อหา รองรับ Full-text Search" },
            { icon: Bell, title: "แจ้งเตือนอัตโนมัติ", desc: "เตือนก่อนสัญญาหมดอายุ ใบเสนอราคาใกล้ครบกำหนด งานเกินเวลา" },
            { icon: ShieldCheck, title: "ควบคุมสิทธิ์ระดับแถว", desc: "RLS ระดับ Database พร้อม Audit Trail ครบทุกกิจกรรมสำคัญ" },
            { icon: FileText, title: "Version Control", desc: "เก็บทุก Version ของเอกสาร ไม่มีทับไฟล์ ตรวจสอบย้อนหลังได้" },
            { icon: Users, title: "Workflow อนุมัติ", desc: "รองรับอนุมัติหลายระดับ พร้อม Delegate และประวัติการอนุมัติ" },
            { icon: Calendar, title: "ปฏิทินรวมศูนย์", desc: "รวมทุกกำหนดการสำคัญของทุกแผนกไว้ในปฏิทินเดียว" },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t bg-card">
        <div className="mx-auto max-w-7xl px-6 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Corporate Document & Contract Hub
        </div>
      </footer>
    </div>
  );
}
