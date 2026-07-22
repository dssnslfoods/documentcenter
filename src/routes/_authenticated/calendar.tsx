import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "ปฏิทินและกำหนดการ | Document Hub" }] }),
  component: () => (
    <div className="space-y-6">
      <PageHeader title="ปฏิทินและกำหนดการ" description="ปฏิทินรวมทุกกำหนดการสำคัญขององค์กร" />
      <Card><CardContent className="flex flex-col items-center py-16 text-center">
        <Construction className="h-8 w-8 text-warning" />
        <p className="mt-3 text-sm text-muted-foreground">โมดูลนี้อยู่ใน Phase 4 (Workflow & Reminders)</p>
      </CardContent></Card>
    </div>
  ),
});
