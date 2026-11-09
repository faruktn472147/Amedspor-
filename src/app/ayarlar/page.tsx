import { updateProfileAction } from "@/app/actions/profile";
import { requireViewer } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AvatarUpload } from "@/components/settings/avatar-upload";
import { SettingsNav } from "@/components/settings/settings-nav";
import { Card, Input, Label, PageHeader, Textarea } from "@/components/ui";

export const metadata = { title: "Ayarlar" };

export default async function SettingsPage() {
  const v = await requireViewer("/ayarlar");
  const p = v.profile;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Ayarlar" />
      <SettingsNav active="/ayarlar" />
      <Card className="space-y-6 p-5">
        <AvatarUpload userId={v.user.id} current={p?.avatar_url ?? null} name={p?.display_name || p?.username || "A"} />
        <ActionForm action={updateProfileAction}>
          <div><Label htmlFor="display_name">Görünen ad</Label><Input id="display_name" name="display_name" maxLength={50} defaultValue={p?.display_name} /></div>
          <div><Label htmlFor="username">Kullanıcı adı</Label><Input id="username" name="username" pattern="[a-z0-9_.]{3,24}" maxLength={24} defaultValue={p?.username} required /></div>
          <div><Label htmlFor="bio">Biyografi</Label><Textarea id="bio" name="bio" rows={3} maxLength={300} defaultValue={p?.bio} /></div>
          <p className="text-xs text-fg-muted">Kullanıcı adı, görünen ad ve biyografi topluluk kurallarına göre denetlenir.</p>
          <SubmitButton>Kaydet</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
