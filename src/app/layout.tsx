import type { Metadata, Viewport } from "next";
import { Sarabun } from "next/font/google";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav/BottomNav";
import TopBar from "@/components/TopBar/TopBar";
import { FinanceProvider } from "@/context/FinanceContext";
import { LiffProvider } from "@/context/LiffContext";

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sarabun",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "MyFam - ติดตามการเงินครอบครัว",
  description: "ติดตามรายรับรายจ่ายครอบครัวผ่าน LINE",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={`${sarabun.variable} ${inter.variable}`}>
        <LiffProvider>
          <FinanceProvider>
            <main>
              <TopBar />
              {children}
              <BottomNav />
            </main>
          </FinanceProvider>
        </LiffProvider>
      </body>
    </html>
  );
}
