import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { BottomNav, SidebarLinks } from "@/components/layout/nav-links";
import { THEME_SCRIPT } from "@/components/layout/theme-toggle";
import { CookieBanner } from "@/components/consent/cookie-banner";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { siteUrl } from "@/lib/utils";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "AMEDSPOR — Taraftar Platformu", template: "%s · AMEDSPOR" },
  description:
    "Amedspor taraftarları için 7/24 haber, canlı maç merkezi, Shorts, oyuncu istatistikleri, tahmin oyunları ve taraftar topluluğu. Bağımsız taraftar platformu.",
  applicationName: "AMEDSPOR",
  appleWebApp: { capable: true, title: "AMEDSPOR", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0d0b" },
    { media: "(prefers-color-scheme: light)", color: "#f6f7f5" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <a href="#icerik" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-green focus:px-3 focus:py-2 focus:text-white">
          İçeriğe geç
        </a>
        <Header />
        <div className="mx-auto flex max-w-7xl gap-6 px-4">
          <aside className="sticky top-[4.5rem] hidden h-[calc(100dvh-5rem)] w-60 shrink-0 overflow-y-auto py-4 lg:block">
            <SidebarLinks />
          </aside>
          <main id="icerik" className="min-w-0 flex-1 py-4">
            {children}
            <Footer />
          </main>
        </div>
        <BottomNav />
        <CookieBanner />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
