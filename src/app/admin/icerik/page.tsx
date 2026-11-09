import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveContentPageAction, saveQuizAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms";
import { todayIstanbul } from "@/lib/utils";
import { Card, EmptyState, Input, Label, SectionHeader, Select, Textarea } from "@/components/ui";

export const metadata = { title: "İçerik ve yarışma" };

export default async function AdminContentPage() {
  await requireRole("editor", "/admin/icerik");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <EmptyState title="Veritabanı yapılandırılmadı" />;
  const { data: page } = await supabase.from("content_pages").select("*").eq("slug", "tarihce").maybeSingle();
  const today = todayIstanbul();
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <SectionHeader title="Amedspor tarihi sayfası" />
        <ActionForm action={saveContentPageAction}>
          <input type="hidden" name="slug" value="tarihce" />
          <div><Label>Başlık</Label><Input name="title" defaultValue={page?.title ?? "Amedspor Tarihi"} required /></div>
          <div><Label>Metin</Label><Textarea name="body" rows={12} defaultValue={page?.body ?? ""} /></div>
          <div><Label>Kaynaklar (her satıra: Başlık | https://...)</Label><Textarea name="sources" rows={4} defaultValue={((page?.sources ?? []) as { title: string; url: string }[]).map((s) => `${s.title} | ${s.url}`).join("\n")} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_published" defaultChecked={page?.is_published} /> Yayında (en az bir kaynak gerekir)</label>
          <SubmitButton>Kaydet</SubmitButton>
        </ActionForm>
      </Card>
      <Card className="p-5">
        <SectionHeader title="Günlük bilgi yarışması sorusu" />
        <ActionForm action={saveQuizAction} resetOnSuccess>
          <div><Label>Tarih</Label><Input name="quiz_date" type="date" defaultValue={today} required /></div>
          <div><Label>Soru</Label><Input name="question" minLength={5} maxLength={300} required /></div>
          {[1, 2, 3, 4].map((i) => <div key={i}><Label>Seçenek {i}{i > 2 ? " (isteğe bağlı)" : ""}</Label><Input name={`option${i}`} required={i <= 2} /></div>)}
          <div><Label>Doğru seçenek</Label><Select name="correct">{[1, 2, 3, 4].map((i) => <option key={i} value={i}>{i}</option>)}</Select></div>
          <div><Label>Açıklama</Label><Input name="explanation" /></div>
          <div><Label>Kaynak bağlantısı (zorunlu)</Label><Input name="source_url" type="url" required /></div>
          <SubmitButton>Soruyu ekle</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
