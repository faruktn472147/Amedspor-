import { resetPasswordAction, signOutAction } from "@/app/actions/auth";
import { requireViewer } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { MfaSetup } from "@/components/settings/mfa-setup";
import { SettingsNav } from "@/components/settings/settings-nav";
import { Alert, Button, Card, Input, Label, PageHeader } from "@/components/ui";

export const metadata = { title: "Güvenlik" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ gerekli?: string; cikis?: string }> }) {
  const v = await requireViewer("/ayarlar/guvenlik");
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Güvenlik" />
      <SettingsNav active="/ayarlar/guvenlik" />
      {sp.gerekli === "2fa" && (
        <Alert tone="warning">Gelir yönetimine erişmek için iki aşamalı doğrulama gerekli. Açtıysan çıkış yapıp yeniden giriş yaparak kodu gir.</Alert>
      )}
      {sp.cikis === "diger" && <Alert tone="success">Diğer tüm cihazlardaki oturumlar kapatıldı.</Alert>}
      <Card className="p-5">
        <h2 className="mb-1 font-bold">İki aşamalı doğrulama (2FA)</h2>
        <p className="mb-3 text-sm text-fg-muted">Oturum seviyesi: <b>{v.user.aal === "aal2" ? "2FA doğrulandı" : "Tek aşamalı"}</b></p>
        <MfaSetup />
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-bold">Şifre değiştir</h2>
        <ActionForm action={resetPasswordAction}>
          <div><Label htmlFor="password">Yeni şifre</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
          <div><Label htmlFor="password2">Yeni şifre (tekrar)</Label><Input id="password2" name="password2" type="password" autoComplete="new-password" minLength={8} required /></div>
          <SubmitButton>Şifreyi güncelle</SubmitButton>
        </ActionForm>
      </Card>
      <Card className="p-5">
        <h2 className="mb-1 font-bold">Oturumlar</h2>
        <p className="mb-3 text-sm text-fg-muted">Kaybolan bir telefonda veya ortak bilgisayarda açık kalan oturumları kapatabilirsin.</p>
        <div className="flex flex-wrap gap-2">
          <form action={signOutAction}><input type="hidden" name="scope" value="others" /><Button variant="outline" type="submit">Diğer cihazlardan çıkış yap</Button></form>
          <form action={signOutAction}><input type="hidden" name="scope" value="global" /><Button variant="outline" type="submit">Tüm cihazlardan çıkış yap</Button></form>
          <form action={signOutAction}><input type="hidden" name="scope" value="local" /><Button variant="secondary" type="submit">Bu cihazdan çıkış yap</Button></form>
        </div>
      </Card>
    </div>
  );
}
