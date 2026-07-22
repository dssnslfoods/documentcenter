import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/contracts")({
  head: () => ({ meta: [{ title: "สัญญา | Document Hub" }] }),
  component: () => <Placeholder title="สัญญา" desc="บริหารและติดตามสัญญาทั้งหมดขององค์กร" />,
});

function Placeholder({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={desc} />
      <Card>
        <CardContent className="flex flex-col items-center py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/20 text-warning-foreground">
            <Construction className="h-6 w-6" />
          </div>
          <h3 className="mt-4 font-semibold">โมดูลนี้อยู่ในแผน Phase 3</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Database schema พร้อมใช้งานแล้ว UI จะสร้างเสร็จใน Phase ถัดไป
            สามารถดูข้อมูลสัญญาผ่าน Dashboard และคลังเอกสารได้ในระหว่างนี้
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
