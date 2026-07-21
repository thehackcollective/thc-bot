import type { Metadata } from "next";
import "./globals.css";
import Shell from "@/components/Shell";
import ConsoleProvider from "@/components/ConsoleProvider";
import ToastProvider from "@/components/ToastProvider";

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
  // Fonts are declared in globals.css :root as the Claude font stacks. "copernicus" is
  // Anthropic's licensed typeface (not bundled — unavailable clients fall back to the serif
  // stack, exactly as claude.ai does for non-Anthropic browsers).
  return (
    <html lang="en">
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
