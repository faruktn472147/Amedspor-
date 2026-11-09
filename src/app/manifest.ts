import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AMEDSPOR Taraftar Platformu",
    short_name: "AMEDSPOR",
    description: "Amedspor taraftarları için haber, maç merkezi, Shorts ve topluluk. Bağımsız taraftar platformu.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0d0b",
    theme_color: "#0a0d0b",
    lang: "tr",
    dir: "ltr",
    categories: ["sports", "social", "news"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Maç Merkezi", url: "/maclar" },
      { name: "Shorts", url: "/shorts" },
      { name: "Haberler", url: "/haberler" },
    ],
  };
}
