import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/procurements")({
  head: () => ({ meta: [{ title: "จัดซื้อและจัดจ้าง | Document Hub" }] }),
  component: () => (
    <div className="space-y-6">
      <PageHeader title="จัดซื้อและจัดจ้าง" description="ติดตามการจัดซื้อ จัดจ้าง และ Vendor Comparison" />
      <Card><CardContent className="flex flex-col items-center py-16 text-center">
        <Construction className="h-8 w-8 text-warning" />
        <p className="mt-3 text-sm text-muted-foreground">โมดูลนี้อยู่ใน Phase 3</p>
      </CardContent></Card>
    </div>
  ),
});
