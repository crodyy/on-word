import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import SiteHeader from "./components/SiteHeader";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Human-Only Forum",
  description: "One verified human, one locked wallet. Posts live on limited lifetimes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>
        <SiteHeader />
        <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">{children}</div>
        <footer className="mx-auto w-full max-w-3xl px-5 sm:px-8 pb-10 pt-6 text-xs font-bold text-[var(--color-ink)]">
          <p>Human-Only Forum. Prototype on the Rabdi testnet.</p>
        </footer>
      </body>
    </html>
  );
}
