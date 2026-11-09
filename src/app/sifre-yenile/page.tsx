import { resetPasswordAction } from "@/app/actions/auth";
import { getSessionUser } from "@/lib/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Input, Label } from "@/components/ui";

export const metadata = { title: "Yeni şifre" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = "" } = await searchParams;
  const user = await getSessionUser();
  return (
    <AuthShell title="Yeni şifre belirle" subtitle={user ? "Yeni şifreni gir." : "Hesap varsa e-postana bir kod gönderildi. Kodu ve yeni şifreni gir."}>
      <ActionForm action={resetPasswordAction}>
        {!user && (
          <>
            <div><Label htmlFor="email">E-posta</Label><Input id="email" name="email" type="email" defaultValue={email} required /></div>
            <div><Label htmlFor="token">E-postadaki kod</Label><Input id="token" name="token" inputMode="numeric" autoComplete="one-time-code" maxLength={10} required /></div>
          </>
        )}
        <div><Label htmlFor="password">Yeni şifre</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required /></div>
        <div><Label htmlFor="password2">Yeni şifre (tekrar)</Label><Input id="password2" name="password2" type="password" autoComplete="new-password" minLength={8} required /></div>
        <SubmitButton className="w-full">Şifreyi güncelle</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
