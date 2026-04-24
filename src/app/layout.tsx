import type { Metadata } from "next";
import { Work_Sans, Public_Sans } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Roofing Experts CRM · Sales",
  description: "Sales tool for Roofing Experts field team",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${workSans.variable} ${publicSans.variable}`}>
      <body
        className="min-h-screen antialiased"
        style={{ background: "var(--bg)", color: "var(--text-primary)", fontFamily: "var(--font-body, sans-serif)" }}
      >
        {children}
        <Toaster position="bottom-right" theme="dark" richColors />
      </body>
    </html>
  );
}
