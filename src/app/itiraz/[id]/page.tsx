import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppealForm } from "@/components/social/appeal-form";
import { Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Karara itiraz" };

export default async function AppealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await requireViewer(`/itiraz/${id}`);
  const supabase = await createSupabaseServerClient();
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: action } = await supabase.from("moderation_actions").select("id, target_type, action, reason, created_at, target_owner_id").eq("id", id).maybeSingle();
  if (!action || action.target_owner_id !== v.user.id) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Moderasyon kararına itiraz" description="Otomatik ve insan denetimi hata yapabilir. Haklı olduğunu düşünüyorsan itiraz et; bir moderatör inceleyecek." />
      <Card className="mb-4 p-4 text-sm">
        <p><b>Karar:</b> {action.action} ({action.target_type})</p>
        {action.reason && <p><b>Gerekçe:</b> {action.reason}</p>}
        <p className="text-fg-muted">{formatDateTime(action.created_at)}</p>
      </Card>
      <Card className="p-4"><AppealForm actionId={action.id} /></Card>
    </div>
  );
}
