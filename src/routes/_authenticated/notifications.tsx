import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "การแจ้งเตือน | Document Hub" }] }),
  component: Notifications,
});

function Notifications() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [marking, setMarking] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data: userData } = await getSupabase().auth.getUser();
      if (!userData.user) return [];
      const { data } = await getSupabase()
        .from("notifications")
        .select("*")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const unread = (data ?? []).filter((n: any) => !n.is_read);

  const markAllRead = async () => {
    const { data: userData } = await getSupabase().auth.getUser();
    if (!userData.user || unread.length === 0) return;
    setMarking(true);
    await getSupabase()
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userData.user.id)
      .eq("is_read", false);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["notifications-unread", userData.user.id] });
    setMarking(false);
  };

  const markOneRead = async (id: string) => {
    await getSupabase().from("notifications").update({ is_read: true }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
  };

  /** ลิงก์ภายในระบบเท่านั้น (ขึ้นต้นด้วย "/" แต่ไม่ใช่ "//") */
  const internalLink = (link: unknown): string | null =>
    typeof link === "string" && link.startsWith("/") && !link.startsWith("//") ? link : null;

  const openNotification = (n: any) => {
    if (!n.is_read) void markOneRead(n.id);
    const link = internalLink(n.link);
    if (link) navigate({ to: link });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="การแจ้งเตือน"
        description={`${unread.length > 0 ? `ยังไม่อ่าน ${unread.length} รายการ` : "ไม่มีการแจ้งเตือนใหม่"}`}
        actions={
          unread.length > 0 ? (
            <Button variant="outline" size="sm" onClick={markAllRead} disabled={marking}>
              {marking ? "กำลังบันทึก..." : "อ่านทั้งหมด"}
            </Button>
          ) : null
        }
      />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded bg-muted/60" />)}</div>
          ) : data && data.length > 0 ? (
            <ul className="divide-y">
              {data.map((n: any) => (
                <li
                  key={n.id}
                  className={`flex cursor-pointer items-start gap-3 p-4 transition-colors hover:bg-muted/30 ${n.is_read ? "opacity-70" : ""}`}
                  role={internalLink(n.link) ? "link" : undefined}
                  tabIndex={internalLink(n.link) ? 0 : undefined}
                  onClick={() => openNotification(n)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") openNotification(n);
                  }}
                >
                  <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.is_read ? "bg-muted-foreground" : "bg-primary"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{n.title}</span>
                      {!n.is_read && <Badge className="bg-primary/10 text-primary border-0 text-[10px]">ใหม่</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{fmtDateTime(n.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">ยังไม่มีการแจ้งเตือน</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

