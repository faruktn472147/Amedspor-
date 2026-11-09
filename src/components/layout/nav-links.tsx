"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MOBILE_NAV, NAV_ITEMS } from "./nav-items";
import { NavIcon } from "./nav-icon";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Ana menü" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors",
              active ? "bg-green/12 text-green" : "text-fg hover:bg-muted",
            )}
          >
            <NavIcon name={item.icon} className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Alt menü"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-elevated/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {MOBILE_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const isCreate = item.href === "/paylas";
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
                  active ? "text-green" : "text-fg-muted",
                )}
              >
                {isCreate ? (
                  <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white shadow">
                    <NavIcon name={item.icon} className="h-5 w-5" />
                  </span>
                ) : (
                  <NavIcon name={item.icon} className="h-[22px] w-[22px]" />
                )}
                <span className={isCreate ? "sr-only" : undefined}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
