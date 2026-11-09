import Link from "next/link";
import { updatePreferencesAction } from "@/app/actions/profile";
import { requireViewer } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/forms";
import { OpenConsentButton } from "@/components/consent/cookie-banner";
import { SettingsNav } from "@/components/settings/settings-nav";
import { Avatar, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Gizlilik ve tercihler" };

function Toggle({ name, label, desc, checked }: { name: string; label: string; desc: string; checked: boolean }) {
  return (
    <label className="flex items-start justify-between gap-4 py-3">
      <span><span className="block font-semibold">{label}</span><span className="text-sm text-fg-muted">{desc}</span></span>
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand-green)]" />
    </label>
  );
}

export default async function PrivacyPage() {
  const v = await requireViewer("/ayarlar/gizlilik");
  const supabase = await createSupabaseServerClient();
  const [blocks, mutes] = supabase
    ? await Promise.all([
        supabase.from("blocks").select("blocked_id, user:profiles!blocks_blocked_id_fkey(username, display_name, avatar_url)").eq("blocker_id", v.user.id),
        supabase.from("mutes").select("muted_id, user:profiles!mutes_muted_id_fkey(username, display_name, avatar_url)").eq("muter_id", v.user.id),
      ])
    : [{ data: [] }, { data: [] }];
  type Row = { user: { username: string; display_name: string; avatar_url: string | null } | null };
  const list = (rows: unknown[] | null) => ((rows ?? []) as Row[]).filter((r) => r.user);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Gizlilik ve tercihler" />
      <SettingsNav active="/ayarlar/gizlilik" />
      <Card className="p-5">
        <ActionForm action={updatePreferencesAction}>
          <div className="divide-y divide-border">
            <Toggle name="is_private" label="Özel hesap" desc="Paylaşımlarını yalnızca onayladığın takipçiler görür. Yeni takipler istek olarak gelir." checked={v.profile?.is_private ?? false} />
            <Toggle name="data_saver" label="Veri tasarrufu" desc="Videolar ve kapak görselleri otomatik yüklenmez; dokununca oynar." checked={v.profile?.data_saver ?? false} />
            <Toggle name="personalized_ads" label="Kişiselleştirilmiş reklam" desc="Kapalıyken yalnızca bağlama dayalı (kişiselleştirilmemiş) reklam gösterilir. Premium üyelikte hiç reklam yoktur." checked={v.profile?.personalized_ads ?? false} />
          </div>
          <SubmitButton>Tercihleri kaydet</SubmitButton>
        </ActionForm>
        <div className="mt-4 border-t border-border pt-4 text-sm">
          <OpenConsentButton className="font-semibold text-green" />
          <p className="mt-1 text-fg-muted">Bu cihazdaki çerez/reklam izinlerini değiştirir. Ayrıntılar: <Link href="/yasal/cerezler" className="underline">Çerez Politikası</Link>.</p>
        </div>
      </Card>
      <Card className="mt-4 p-5">
        <h2 className="font-bold">Engellenenler</h2>
        {list(blocks.data).length ? list(blocks.data).map((r) => (
          <Link key={r.user!.username} href={`/u/${r.user!.username}`} className="mt-3 flex items-center gap-3"><Avatar src={r.user!.avatar_url} name={r.user!.username} size={32} /> @{r.user!.username}</Link>
        )) : <p className="mt-2 text-sm text-fg-muted">Engellediğin kimse yok.</p>}
        <h2 className="mt-5 font-bold">Sessize alınanlar</h2>
        {list(mutes.data).length ? list(mutes.data).map((r) => (
          <Link key={r.user!.username} href={`/u/${r.user!.username}`} className="mt-3 flex items-center gap-3"><Avatar src={r.user!.avatar_url} name={r.user!.username} size={32} /> @{r.user!.username}</Link>
        )) : <p className="mt-2 text-sm text-fg-muted">Sessize aldığın kimse yok.</p>}
      </Card>
    </div>
  );
}
