import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const metadata: Metadata = {
  metadataBase: new URL(productionHost ? `https://${productionHost}` : "http://localhost:3000"),
  title: "Tirada: lanza dados online, sin anuncios",
  description:
    "Lanzador de dados 3D con física real. De 1 a 6 dados, resultados justos y sin anuncios ni registro. Funciona en el móvil y sin conexión.",
  applicationName: "Tirada",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Tirada: lanza dados online, sin anuncios",
    description: "Dados 3D con física real. Justos, rápidos y sin anuncios.",
    type: "website",
    locale: "es",
    siteName: "Tirada",
  },
  twitter: { card: "summary_large_image" },
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
