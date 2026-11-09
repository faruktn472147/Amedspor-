import { requireRole } from "@/lib/auth";
import { broadcastNotificationAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Input, Label, Textarea } from "@/components/ui";

export const metadata = { title: "Bildirim gönder" };

export default async function BroadcastPage() {
  await requireRole("admin", "/admin/bildirim");
  return (
    <Card className="max-w-xl p-5">
      <h2 className="mb-1 font-bold">Tüm kullanıcılara bildirim</h2>
      <p className="mb-4 text-sm text-fg-muted">Bildirimleri reklam amacıyla kullanma. Günde en fazla 3 toplu bildirim gönderilebilir.</p>
      <ActionForm action={broadcastNotificationAction} resetOnSuccess>
        <div><Label htmlFor="message">Mesaj</Label><Textarea id="message" name="message" rows={3} maxLength={300} required /></div>
        <div><Label htmlFor="link">Site içi bağlantı (isteğe bağlı)</Label><Input id="link" name="link" placeholder="/maclar/..." /></div>
        <SubmitButton>Gönder</SubmitButton>
      </ActionForm>
    </Card>
  );
}
