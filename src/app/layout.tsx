import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Google Maps for Codebases",
  description: "Explore a GitHub repo with an import-based dependency graph."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

