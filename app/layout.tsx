import type { Metadata, Viewport } from "next";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: {
    default: "IPO OS — Indian IPO Operating System & Research Platform",
    template: "%s | IPO OS",
  },
  description:
    "Discover, research, apply for, and manage Indian IPOs. Real-time GMP tracker, subscription status, financial analytics, family applicant management, and portfolio ledger.",
  keywords: [
    "Indian IPO",
    "IPO GMP",
    "IPO Subscription Status",
    "IPO Allotment Tracker",
    "SME IPO",
    "Mainboard IPO",
    "IPO Grey Market Premium",
    "IPO Portfolio",
  ],
  authors: [{ name: "IPO OS Team" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="antialiased transition-theme min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)]">
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
