import { deleteAccountAction } from "@/app/actions/profile";
import { requireViewer } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { SettingsNav } from "@/components/settings/settings-nav";
import { Card, Input, Label, PageHeader } from "@/components/ui";

export const metadata = { title: "Hesap ve veriler" };

export default async function AccountPage() {
  const v = await requireViewer("/ayarlar/hesap");
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Hesap ve veriler" />
      <SettingsNav active="/ayarlar/hesap" />
      <Card className="p-5">
        <h2 className="font-bold">Verilerimi indir</h2>
        <p className="mt-1 text-sm text-fg-muted">KVKK kapsamında hakkında tuttuğumuz verilerin bir kopyasını JSON dosyası olarak indirebilirsin (günde en fazla 3 kez).</p>
        <a href="/api/me/export" className="mt-3 inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted">Verilerimi indir</a>
      </Card>
      <Card className="border-red/40 p-5">
        <h2 className="font-bold text-red">Hesabı kalıcı olarak sil</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Profilin, gönderilerin, yorumların, beğenilerin, fotoğraf ve videoların kalıcı olarak silinir. Bu işlem geri alınamaz. Yasal
          zorunluluk nedeniyle ödeme kayıtları kişisel bağlantısı kaldırılarak (anonim) saklanabilir.
        </p>
        <ActionForm action={deleteAccountAction} className="mt-4 space-y-3">
          <div>
            <Label htmlFor="confirm">Onaylamak için kullanıcı adını yaz: <b>{v.profile?.username}</b></Label>
            <Input id="confirm" name="confirm" autoComplete="off" required />
          </div>
          <SubmitButton variant="danger" pendingText="Siliniyor…">Hesabımı kalıcı olarak sil</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
