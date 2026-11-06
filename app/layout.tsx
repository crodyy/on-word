import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Human-Only Forum",
  description: "A forum where one verified human equals one locked wallet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
