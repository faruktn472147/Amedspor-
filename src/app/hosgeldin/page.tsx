import { requireViewer } from "@/lib/auth";
import { Card, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Hoş geldin" };

export default async function WelcomePage() {
  const v = await requireViewer("/hosgeldin");
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={`Hoş geldin, @${v.profile?.username ?? "taraftar"}!`} description="Hesabın hazır. Birkaç adımda profilini tamamla." />
      <Card className="space-y-3 p-5">
        <LinkButton href="/ayarlar" className="w-full">Profil fotoğrafı ve biyografi ekle</LinkButton>
        <LinkButton href="/akis" variant="secondary" className="w-full">Taraftar akışını keşfet</LinkButton>
        <LinkButton href="/tahminler" variant="secondary" className="w-full">İlk maç tahminini yap</LinkButton>
      </Card>
    </div>
  );
}
