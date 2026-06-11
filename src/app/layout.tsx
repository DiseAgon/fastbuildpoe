import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FastBuildPOE — trade links for your whole build",
  description:
    "Import a Path of Exile build from pobb.in and get a tunable trade-search link for every item.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
