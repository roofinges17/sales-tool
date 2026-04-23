import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roofing Experts CRM · Sales",
  description: "Sales tool for Roofing Experts field team",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased" style={{ background: "var(--bg)", color: "var(--text-primary)" }}>
        {children}
      </body>
    </html>
  );
}
