import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "รายงาน | Document Hub" }] }),
  component: () => (
    <div className="space-y-6">
      <PageHeader title="รายงาน" description="รายงานและการส่งออกข้อมูล" />
      <Card><CardContent className="flex flex-col items-center py-16 text-center">
        <Construction className="h-8 w-8 text-warning" />
        <p className="mt-3 text-sm text-muted-foreground">รายงานต่างๆ อยู่ใน Phase 5 (Management & Compliance)</p>
      </CardContent></Card>
    </div>
  ),
});
