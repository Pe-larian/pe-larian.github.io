import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Atkinson_Hyperlegible_Next } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-num",
  display: "swap",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "[NAMA APP] - Perencana Rute, Pacing & Fueling Race",
  description:
    "Simulasi rute GPX, segmen checkpoint, pacing berbasis elevasi (Minetti GAP), prakiraan cuaca ketinggian, dan strategi nutrisi untuk pelari trail maupun road secara lokal di browser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${plusJakarta.variable} ${atkinson.variable}`}>
      <body className="bg-[#F5F5F3] text-[#161E19] antialiased selection:bg-[#1E6B3A]/15 selection:text-[#161E19]">
        {children}
      </body>
    </html>
  );
}
