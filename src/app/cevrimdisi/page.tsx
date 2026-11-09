import { WifiOff } from "lucide-react";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Çevrimdışı" };

export default function OfflinePage() {
  return (
    <EmptyState
      icon={<WifiOff className="h-10 w-10" />}
      title="İnternet bağlantısı yok"
      description="Bağlantın geri geldiğinde sayfayı yenile. Canlı skorlar ve haberler yalnızca çevrimiçiyken güncellenir."
    />
  );
}
