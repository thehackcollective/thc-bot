import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Shell from "@/components/Shell";
import ConsoleProvider from "@/components/ConsoleProvider";
import ToastProvider from "@/components/ToastProvider";

// Free, high-quality stand-in for Anthropic's proprietary "Styrene" UI sans. globals.css
// lists Styrene first (loads only where licensed), then this, then system sans.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-ui" });

export const metadata: Metadata = {
  title: "THC Bot · Lead Review",
  description: "Curate WhatsApp event leads for The Hack Collective's Luma calendar.",
  icons: {
    icon: [{ url: "/thc-logo.png", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png" }],
    shortcut: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <ToastProvider>
          <ConsoleProvider>
            <Shell>{children}</Shell>
          </ConsoleProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
