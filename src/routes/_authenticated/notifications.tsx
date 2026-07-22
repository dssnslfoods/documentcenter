import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSupabase } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "การแจ้งเตือน | Document Hub" }] }),
  component: Notifications,
});

function Notifications() {
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

  return (
    <div className="space-y-6">
      <PageHeader title="การแจ้งเตือน" description="การแจ้งเตือนทั้งหมดของคุณ" />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded bg-muted/60" />)}</div>
          ) : data && data.length > 0 ? (
            <ul className="divide-y">
              {data.map((n: any) => (
                <li key={n.id} className="flex items-start gap-3 p-4">
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
