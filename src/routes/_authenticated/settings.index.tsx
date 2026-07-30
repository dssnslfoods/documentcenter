import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { SettingsNav } from "@/components/settings-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, FolderTree, Settings as SettingsIcon, ClipboardList, Tag, Briefcase , Percent } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({ meta: [{ title: "ตั้งค่าระบบ | Document Hub" }] }),
  component: Settings,
});

const cards = [
  { icon: Users, title: "ผู้ใช้งานและสิทธิ์", desc: "เพิ่ม/เชิญผู้ใช้ กำหนดบทบาทและแผนก", to: "/settings/users" as const },
  { icon: Building2, title: "แผนก", desc: "จัดการแผนกและโครงสร้างองค์กร", to: "/settings/departments" as const },
  { icon: Briefcase, title: "ประเภทงาน", desc: "จัดการประเภทงานสำหรับโครงการ", to: "/settings/work-types" as const },
  { icon: FolderTree, title: "หมวดหมู่เอกสาร", desc: "จัดการหมวดหมู่และรหัสนำหน้าเอกสาร", to: "/settings/categories" as const },
  { icon: Percent, title: "อัตรา VAT", desc: "กำหนดอัตราภาษีมูลค่าเพิ่มสำหรับคำนวณมูลค่าสัญญา", to: "/settings/vat" as const },
  { icon: Tag, title: "Tag และ Keyword", desc: "จัดการ tag สำหรับเอกสารและโครงการ", to: "/settings/tags" as const },
  { icon: ClipboardList, title: "Workflow", desc: "Workflow Templates" },
  { icon: SettingsIcon, title: "การตั้งค่าทั่วไป", desc: "ชื่อองค์กร, รูปแบบเลขเอกสาร, Retention", to: "/settings/general" as const },
];

function Settings() {
  return (
    <div className="space-y-6">
      <PageHeader title="ตั้งค่าระบบ" description="จัดการ Master Data และการตั้งค่าองค์กร (สำหรับ Super Admin)" />
      <SettingsNav />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const inner = (
            <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <c.icon className="h-5 w-5" />
                </div>
                <CardTitle className="mt-3 text-base">{c.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{c.desc}</p>
                {!("to" in c) && <p className="mt-2 text-xs text-warning">เร็ว ๆ นี้</p>}
              </CardContent>
            </Card>
          );
          return "to" in c && c.to ? (
            <Link key={c.title} to={c.to}>{inner}</Link>
          ) : (
            <div key={c.title}>{inner}</div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        <Link to="/audit-log" className="text-primary hover:underline">→ ดู Audit Log</Link>
      </p>
    </div>
  );
}
