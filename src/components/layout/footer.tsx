import Link from "next/link";

const LINKS = [
  ["/yasal/gizlilik", "Gizlilik Politikası"],
  ["/yasal/kvkk", "KVKK Aydınlatma Metni"],
  ["/yasal/kullanim-sartlari", "Kullanım Şartları"],
  ["/yasal/cerezler", "Çerez Politikası"],
  ["/yasal/abonelik", "Abonelik ve İptal Koşulları"],
  ["/yasal/topluluk-kurallari", "Topluluk Kuralları"],
  ["/yasal/telif", "Telif Hakkı Başvurusu"],
] as const;

export function Footer() {
  return (
    <footer className="mt-10 border-t border-border pb-24 pt-6 text-sm text-fg-muted lg:pb-8">
      <p className="mb-3 rounded-xl bg-muted px-3 py-2 text-xs leading-relaxed">
        <strong className="text-fg">Bağımsız taraftar platformudur.</strong> Bu platformun Amed Sportif Faaliyetler Kulübü ile resmî
        bir bağlantısı yoktur ve kulübün resmî uygulaması değildir. Kulüp logosu, forması ve maç görüntüleri izin alınmadan kullanılmaz.
      </p>
      <nav aria-label="Yasal bağlantılar" className="flex flex-wrap gap-x-4 gap-y-2">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="hover:text-fg hover:underline">
            {label}
          </Link>
        ))}
      </nav>
      <p className="mt-3 text-xs">© {new Date().getFullYear()} AMEDSPOR Taraftar Platformu</p>
    </footer>
  );
}
