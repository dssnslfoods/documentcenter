import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, Inbox } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";
import { useAuth } from "@/hooks/use-supabase";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [{ title: "งานรออนุมัติ | Document Hub" }] }),
  component: ApprovalsPage,
});

const MODULE_LABEL: Record<string, string> = {
  contract: "สัญญา",
  quotation: "ใบเสนอราคา",
  procurement: "จัดซื้อ/จัดจ้าง",
  document: "เอกสาร",
  project: "โครงการ",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

type Req = {
  id: string;
  module: string;
  record_id: string;
  status: string;
  current_step: number;
  submitted_by: string | null;
  submitted_at: string;
  completed_at: string | null;
};

function ApprovalsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [actioning, setActioning] = useState<{ req: Req; action: "approve" | "reject" } | null>(null);
  const [comment, setComment] = useState("");

  const { data: requests, isLoading } = useQuery({
    queryKey: ["approvals", tab, user?.id],
    queryFn: async () => {
      const sb = getSupabase();
      let q = sb.from("approval_requests").select("*").order("submitted_at", { ascending: false }).limit(100);
      if (tab === "pending") q = q.eq("status", "pending");
      else if (tab === "mine") q = q.eq("submitted_by", user?.id ?? "");
      else if (tab === "history") q = q.in("status", ["approved", "rejected", "cancelled"]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Req[];
    },
    enabled: !!user,
  });

  const act = useMutation({
    mutationFn: async ({ req, action, comment }: { req: Req; action: "approve" | "reject"; comment: string }) => {
      const sb = getSupabase();
      if (!user) throw new Error("Not authenticated");
      const { error: aErr } = await sb.from("approval_actions").insert({
        request_id: req.id,
        step_order: req.current_step,
        action: action === "approve" ? "approve" : "reject",
        actor_id: user.id,
        comment: comment || null,
      });
      if (aErr) throw aErr;
      const newStatus = action === "approve" ? "approved" : "rejected";
      const { error: uErr } = await sb
        .from("approval_requests")
        .update({ status: newStatus, completed_at: new Date().toISOString() })
        .eq("id", req.id);
      if (uErr) throw uErr;
      // Notify submitter
      if (req.submitted_by && req.submitted_by !== user.id) {
        await sb.from("notifications").insert({
          user_id: req.submitted_by,
          title: `คำขออนุมัติ${action === "approve" ? "ได้รับการอนุมัติ" : "ถูกปฏิเสธ"}`,
          body: `${MODULE_LABEL[req.module] ?? req.module}${comment ? " — " + comment : ""}`,
          type: "approval",
          link: `/approvals`,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("ดำเนินการเรียบร้อย");
      setActioning(null);
      setComment("");
    },
    onError: (e: Error) => toast.error("ไม่สำเร็จ", { description: e.message }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="งานรออนุมัติ" description="รายการคำขออนุมัติจากทุกโมดูล — พิจารณา อนุมัติ หรือปฏิเสธ" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">รออนุมัติ</TabsTrigger>
          <TabsTrigger value="mine">คำขอของฉัน</TabsTrigger>
          <TabsTrigger value="history">ประวัติ</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded bg-muted/60" />
                  ))}
                </div>
              ) : requests && requests.length > 0 ? (
                <ul className="divide-y">
                  {requests.map((r) => (
                    <li key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{MODULE_LABEL[r.module] ?? r.module}</Badge>
                          <Badge className={`${STATUS_STYLE[r.status] ?? ""} border-0`}>{r.status}</Badge>
                          <span className="text-xs text-muted-foreground">ขั้นที่ {r.current_step}</span>
                        </div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">
                          Record: {r.record_id.slice(0, 8)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          ยื่นเมื่อ {fmtDateTime(r.submitted_at)}
                          {r.completed_at && ` · เสร็จ ${fmtDateTime(r.completed_at)}`}
                        </div>
                      </div>
                      {r.status === "pending" && tab !== "mine" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-destructive/40 text-destructive hover:bg-destructive/5"
                            onClick={() => setActioning({ req: r, action: "reject" })}
                          >
                            <XCircle className="mr-1 h-4 w-4" />ปฏิเสธ
                          </Button>
                          <Button size="sm" onClick={() => setActioning({ req: r, action: "approve" })}>
                            <CheckCircle2 className="mr-1 h-4 w-4" />อนุมัติ
                          </Button>
                        </div>
                      )}
                      {r.status === "pending" && tab === "mine" && (
                        <Badge className="bg-warning/20 text-warning-foreground border-0">
                          <Clock className="mr-1 h-3 w-3" />รอผลพิจารณา
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                  <Inbox className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">ไม่มีรายการ</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!actioning} onOpenChange={(o) => !o && setActioning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actioning?.action === "approve" ? "อนุมัติคำขอ" : "ปฏิเสธคำขอ"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">ความเห็น (ไม่บังคับ)</label>
            <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="เหตุผลประกอบการพิจารณา" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActioning(null)}>ยกเลิก</Button>
            <Button
              onClick={() => actioning && act.mutate({ req: actioning.req, action: actioning.action, comment })}
              disabled={act.isPending}
              variant={actioning?.action === "reject" ? "destructive" : "default"}
            >
              ยืนยัน
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader><CardTitle className="text-sm">วิธีสร้างคำขออนุมัติ</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>ระบบสร้างคำขออนุมัติจากการเปลี่ยนสถานะเอกสารเป็น <b>"รออนุมัติ"</b> (contracts / procurements) หรือจากขั้นตอน workflow ที่ตั้งไว้</p>
          <p className="text-xs">ผู้มีสิทธิ์: management / super_admin</p>
        </CardContent>
      </Card>
    </div>
  );
}
