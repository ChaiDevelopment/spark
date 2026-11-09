import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { PwaRegister, NetworkStatus } from "@/components/pwa";
import { publicEnv } from "@/lib/env";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", weight: ["500", "600", "700", "800"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  title: { default: "SPARK — Meet beyond the swipe", template: "%s · SPARK" },
  description: "SPARK is a dating app for adults that matches you on chemistry — personality, values, lifestyle and how you communicate.",
  applicationName: "SPARK",
  appleWebApp: { capable: true, title: "SPARK", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#FFFAF8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} ${inter.variable} antialiased`}>
      <body className="min-h-dvh">
        <NetworkStatus />
        {children}
        <Toaster position="top-center" richColors closeButton toastOptions={{ className: "font-sans" }} />
        <PwaRegister />
      </body>
    </html>
  );
}
