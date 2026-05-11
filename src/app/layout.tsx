import type { Metadata } from "next";
import { Syne, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Syne: geometric sans for brand name and button labels (interactive controls)
const syne = Syne({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "600", "700", "800"],
});

// JetBrains Mono: for all data, labels, inputs (informational/code content)
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Codebase Explorer",
  description: "Explore a GitHub repo with an import-based dependency graph.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${syne.variable} ${mono.variable} font-sans`}>{children}</body>
    </html>
  );
}
