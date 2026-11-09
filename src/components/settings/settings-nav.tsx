import Link from "next/link";
const ITEMS = [
  ["/ayarlar", "Profil"],
  ["/ayarlar/gizlilik", "Gizlilik ve tercihler"],
  ["/ayarlar/guvenlik", "Güvenlik"],
  ["/ayarlar/hesap", "Hesap ve veriler"],
  ["/premium", "Premium üyelik"],
] as const;
export function SettingsNav({ active }: { active: string }) {
  return (
    <nav aria-label="Ayarlar" className="no-scrollbar mb-5 flex gap-2 overflow-x-auto">
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={active === href ? "page" : undefined} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${active === href ? "bg-fg text-bg" : "bg-muted"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
