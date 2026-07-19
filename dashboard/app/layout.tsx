import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import Shell from "@/components/Shell";
import ConsoleProvider from "@/components/ConsoleProvider";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  axes: ["opsz", "SOFT", "WONK"],
});
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-body" });

export const metadata: Metadata = {
  title: "THC Bot · Lead Review",
  description: "Curate WhatsApp event leads for The Hack Collective's Luma calendar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <ConsoleProvider>
          <Shell>{children}</Shell>
        </ConsoleProvider>
      </body>
    </html>
  );
}
