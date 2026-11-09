import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewer, hasRole } from "@/lib/auth";

const NAV: { href: string; label: string; role: "moderator" | "editor" | "admin" | "owner" }[] = [
  { href: "/admin", label: "Genel bakış", role: "moderator" },
  { href: "/admin/moderasyon", label: "Moderasyon", role: "moderator" },
  { href: "/admin/kullanicilar", label: "Kullanıcılar", role: "moderator" },
  { href: "/admin/haberler", label: "Haberler", role: "editor" },
  { href: "/admin/kaynaklar", label: "Haber kaynakları", role: "admin" },
  { href: "/admin/maclar", label: "Maçlar", role: "editor" },
  { href: "/admin/oyuncular", label: "Oyuncular", role: "editor" },
  { href: "/admin/icerik", label: "İçerik & Yarışma", role: "editor" },
  { href: "/admin/bildirim", label: "Bildirim gönder", role: "admin" },
  { href: "/admin/reklamlar", label: "Reklam yönetimi", role: "owner" },
  { href: "/admin/gelir", label: "Gelir yönetimi", role: "owner" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const v = await requireViewer("/admin");
  const staff = hasRole(v.roles, "moderator") || hasRole(v.roles, "editor");
  if (!staff) redirect("/?yetki=yok");
  const allowed = NAV.filter((n) => (n.role === "owner" ? v.roles.includes("owner") : hasRole(v.roles, n.role)));
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Yönetim paneli</h1>
        <p className="text-xs text-fg-muted">Rol: {v.roles.join(", ")} · Oturum: {v.user.aal === "aal2" ? "2FA doğrulandı" : "tek aşamalı"}</p>
      </div>
      <nav className="no-scrollbar mb-5 flex gap-2 overflow-x-auto" aria-label="Yönetim menüsü">
        {allowed.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0 rounded-full bg-muted px-4 py-2 text-sm font-semibold hover:bg-border">{n.label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
