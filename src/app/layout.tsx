import type { Metadata, Viewport } from "next";
import { Prompt } from "next/font/google";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav/BottomNav";
import { FinanceProvider } from "@/context/FinanceContext";

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-prompt",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "MyFam - ติดตามการเงินครอบครัว",
  description: "ติดตามรายรับรายจ่ายครอบครัว",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={`${prompt.variable} ${inter.variable}`}>
        <FinanceProvider>
          <main>
            {children}
            <BottomNav />
          </main>
        </FinanceProvider>
      </body>
    </html>
  );
}