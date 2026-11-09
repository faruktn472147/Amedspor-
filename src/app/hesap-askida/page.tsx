import { EmptyState } from "@/components/ui";

export const metadata = { title: "Hesap askıda" };

export default function SuspendedPage() {
  return (
    <EmptyState
      title="Hesabın askıya alındı"
      description="Topluluk kurallarının ihlali nedeniyle hesabın geçici olarak kısıtlandı. Bildirimlerindeki karar için itiraz edebilir veya yasal sayfalardaki iletişim adresine yazabilirsin."
    />
  );
}
