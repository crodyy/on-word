import type { Metadata } from "next";
import { DM_Mono, Outfit } from "next/font/google";
import "./globals.css";

const sans = Outfit({ subsets: ["latin"], variable: "--font-sans" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Human-Only Forum",
  description: "One verified human, one locked wallet. Posts live on limited lifetimes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">{children}</div>
        <footer className="mx-auto w-full max-w-3xl px-5 sm:px-8 pb-10 pt-6 text-sm text-[var(--color-muted)]">
          <p>Human-Only Forum. Prototype on the Rabdi testnet.</p>
        </footer>
      </body>
    </html>
  );
}
