import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tirada",
    short_name: "Tirada",
    description: "Lanzador de dados 3D, justo y sin anuncios.",
    lang: "es",
    start_url: "/",
    display: "standalone",
    background_color: "#2b211b",
    theme_color: "#2b211b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
