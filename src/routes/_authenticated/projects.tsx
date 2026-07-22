import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

const routes = [
  ["/_authenticated/projects", "โครงการ", "จัดการโครงการและเอกสารที่เชื่อมโยง"],
  ["/_authenticated/calendar", "ปฏิทินและกำหนดการ", "ปฏิทินรวมทุกกำหนดการสำคัญ"],
  ["/_authenticated/approvals", "งานรออนุมัติ", "รายการที่ต้องพิจารณาอนุมัติ"],
  ["/_authenticated/notifications", "การแจ้งเตือน", "การแจ้งเตือนทั้งหมดของคุณ"],
  ["/_authenticated/reports", "รายงาน", "รายงานและการส่งออกข้อมูล"],
  ["/_authenticated/audit-log", "Audit Log", "บันทึกกิจกรรมทั้งหมดในระบบ"],
  ["/_authenticated/settings", "ตั้งค่าระบบ", "จัดการผู้ใช้ แผนก และ Master Data"],
] as const;

// This file is a template; individual route files are exported below.
export const _routes = routes;

// Actual export required by TanStack Router — one file per route:
export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: "โครงการ | Document Hub" }] }),
  component: () => (
    <div className="space-y-6">
      <PageHeader title="โครงการ" description="จัดการโครงการและเอกสารที่เชื่อมโยง" />
      <Card><CardContent className="flex flex-col items-center py-16 text-center">
        <Construction className="h-8 w-8 text-warning" />
        <p className="mt-3 text-sm text-muted-foreground">โมดูลนี้อยู่ใน Phase 3</p>
      </CardContent></Card>
    </div>
  ),
});
