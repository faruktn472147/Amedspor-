import Link from "next/link";
import { Bell, Crown, Search } from "lucide-react";
import { getViewer, hasRole } from "@/lib/auth";
import { getUnreadCount } from "@/lib/data/content";
import { Avatar, LinkButton } from "@/components/ui";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

export async function Header() {
  const viewer = await getViewer();
  const unread = viewer ? await getUnreadCount() : 0;
  const isStaff = viewer ? hasRole(viewer.roles, "moderator") || hasRole(viewer.roles, "editor") : false;
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-elevated/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="brand-stripe h-[3px] w-full" aria-hidden />
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Link href="/" aria-label="AMEDSPOR ana sayfa" className="mr-auto">
          <Logo />
        </Link>
        <Link href="/ara" aria-label="Ara" className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted">
          <Search className="h-5 w-5" />
        </Link>
        <ThemeToggle />
        {viewer ? (
          <>
            {!viewer.isPremium && (
              <Link
                href="/premium"
                className="hidden h-9 items-center gap-1.5 rounded-full bg-amber-500/15 px-3 text-sm font-bold text-amber-600 hover:bg-amber-500/25 dark:text-amber-400 sm:inline-flex"
              >
                <Crown className="h-4 w-4" /> Premium
              </Link>
            )}
            {isStaff && (
              <Link href="/admin" className="hidden h-9 items-center rounded-full px-3 text-sm font-semibold hover:bg-muted sm:inline-flex">
                Yönetim
              </Link>
            )}
            <Link
              href="/bildirimler"
              aria-label={unread ? `Bildirimler (${unread} okunmamış)` : "Bildirimler"}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-red px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <Link href={viewer.profile ? `/u/${viewer.profile.username}` : "/ayarlar"} aria-label="Profilim" className="ml-1">
              <Avatar src={viewer.profile?.avatar_url} name={viewer.profile?.display_name || viewer.profile?.username || "A"} size={34} className={viewer.isPremium ? "ring-2 ring-amber-400" : undefined} />
            </Link>
          </>
        ) : (
          <LinkButton href="/giris" size="sm" className="ml-1">
            Giriş yap
          </LinkButton>
        )}
      </div>
    </header>
  );
}
