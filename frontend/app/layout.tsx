import type { Metadata } from "next";
import { Nunito, Press_Start_2P } from "next/font/google";
import { Toaster } from "sonner";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
});

const pressStart = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start",
});

export const metadata: Metadata = {
  title: "Cube — Confidential prize savings",
  description: "PoolTogether-style prize savings with encrypted balances on Sepolia",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${nunito.variable} ${pressStart.variable}`}>
        <Providers>
          <div className="app-frame">
            <SiteHeader />
            {children}
            <SiteFooter />
          </div>
          <Toaster theme="light" position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
