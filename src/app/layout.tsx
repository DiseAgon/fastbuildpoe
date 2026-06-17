import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://fastbuildpoe.xyz"),
  title: "FastBuildPOE — price-check your whole PoE build in one click",
  description:
    "Paste a pobb.in link and instantly get a tunable trade-search link for every item in your Path of Exile (1 & 2) build — mods, pseudo totals, weapon DPS, instant buy-out. Note prices and export back to PoB.",
  keywords: [
    "Path of Exile",
    "PoE",
    "PoE2",
    "price check",
    "trade",
    "pob",
    "Path of Building",
    "pobb.in",
    "build pricing",
    "poe trade",
  ],
  applicationName: "FastBuildPOE",
  openGraph: {
    type: "website",
    siteName: "FastBuildPOE",
    url: "https://fastbuildpoe.xyz",
    title: "FastBuildPOE — price-check your whole PoE build in one click",
    description:
      "Paste a pobb.in link and get a tunable trade-search link for every item. PoE 1 & 2.",
  },
  twitter: {
    card: "summary_large_image",
    title: "FastBuildPOE — price-check your whole PoE build",
    description:
      "Paste a pobb.in link and get a tunable trade-search link for every item. PoE 1 & 2.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
