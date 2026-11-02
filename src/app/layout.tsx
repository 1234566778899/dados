import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

const title = "Lanzar dados online: dado virtual 3D gratis y sin anuncios | Tirada";
const description =
  "Lanza de 1 a 6 dados online con física 3D real. Dado virtual gratis, justo y sin anuncios ni registro. Funciona en el móvil y sin conexión.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  applicationName: "Tirada",
  verification: { google: "2OG0s1XAsC_7JK8VTryb3GLyxZzB9IsKYSFMwsOsqWo" },
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    url: "/",
    type: "website",
    locale: "es",
    siteName: "Tirada",
  },
  twitter: { card: "summary_large_image", title, description },
  appleWebApp: { capable: true, title: "Tirada", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3efe7" },
    { media: "(prefers-color-scheme: dark)", color: "#13110f" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
