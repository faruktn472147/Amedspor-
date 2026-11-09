import { resendOtpAction, verifyEmailOtpAction } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Input, Label } from "@/components/ui";

export const metadata = { title: "E-postanı doğrula" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = "" } = await searchParams;
  return (
    <AuthShell title="E-postanı doğrula" subtitle={<>Doğrulama kodunu <b>{email || "e-posta adresine"}</b> gönderdik. Gelen kutunu ve spam klasörünü kontrol et.</>}>
      <ActionForm action={verifyEmailOtpAction}>
        <div><Label htmlFor="email">E-posta</Label><Input id="email" name="email" type="email" defaultValue={email} required /></div>
        <div><Label htmlFor="token">6 haneli kod</Label><Input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" maxLength={10} required /></div>
        <SubmitButton className="w-full">Doğrula</SubmitButton>
      </ActionForm>
      <div className="mt-4 border-t border-border pt-4">
        <ActionForm action={resendOtpAction}>
          <input type="hidden" name="email" value={email} />
          <SubmitButton variant="outline" className="w-full">Kodu yeniden gönder</SubmitButton>
        </ActionForm>
      </div>
    </AuthShell>
  );
}
