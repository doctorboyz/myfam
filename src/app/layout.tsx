import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav/BottomNav";
import TopBar from "@/components/TopBar/TopBar";
import { FinanceProvider } from "@/context/FinanceContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "My Fam - Finance Tracker",
  description: "Simple family expense tracker",
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
    <html lang="en">
      <body className={inter.className}>
        <FinanceProvider>
          <main>
            <TopBar />
            {children}
            <BottomNav />
          </main>
        </FinanceProvider>
      </body>
    </html>
  );
}
