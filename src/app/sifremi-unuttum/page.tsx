import { requestPasswordResetAction } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Input, Label } from "@/components/ui";

export const metadata = { title: "Şifremi unuttum" };

export default function ForgotPage() {
  return (
    <AuthShell title="Şifreni sıfırla" subtitle="Hesabına kayıtlı e-postayı gir; sana bir sıfırlama kodu gönderelim.">
      <ActionForm action={requestPasswordResetAction}>
        <div><Label htmlFor="email">E-posta</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
        <SubmitButton className="w-full">Sıfırlama kodu gönder</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
