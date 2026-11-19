import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LLM Benchmark Studio — OpenRouter",
  description:
    "Execute, record and compare multiple language models via OpenRouter. File-based persistence, incremental results, and rich comparison dashboards.",
  keywords: [
    "LLM benchmark",
    "OpenRouter",
    "model evaluation",
    "AI comparison",
    "language models",
  ],
  authors: [{ name: "LLM Benchmark Studio" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      {/*
        suppressHydrationWarning on <body> too: browser extensions inject
        attributes here before React hydrates (e.g. ColorZilla's
        `cz-shortcut-listen`), which React reports as a mismatch even though
        the app's own markup is identical on both sides.
      */}
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <Toaster />
          <SonnerToaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
