"use client";

import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types";

interface NavBarProps {
  profile?: Profile | null;
}

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/accounts/", label: "Customers" },
  { href: "/quotes/", label: "Estimates" },
  { href: "/sales/", label: "Contracts" },
  { href: "/pipeline/", label: "Pipeline" },
  { href: "/commissions/", label: "Commissions" },
];

export function NavBar({ profile }: NavBarProps) {
  async function handleSignOut() {
    await supabase().auth.signOut();
    window.location.href = "/login/";
  }

  // Determine active link by current pathname
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

  function isActive(href: string) {
    if (href === "/") return currentPath === "/" || currentPath === "";
    return currentPath.startsWith(href.replace(/\/$/, ""));
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        {/* Left: brand + nav */}
        <div className="flex items-center gap-6">
          <a href="/" className="flex items-center gap-2.5 hover:opacity-80">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="currentColor">
                <path d="M12 2L2 9.5V22h7v-6h6v6h7V9.5L12 2z" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-zinc-50">Roofing Experts</span>
            <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-xs font-medium text-zinc-400">
              Sales
            </span>
          </a>
          <div className="hidden items-center gap-0.5 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  isActive(link.href)
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                }`}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* Right: user + sign out */}
        <div className="flex items-center gap-3">
          {profile && (
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-xs font-medium text-zinc-300">{profile.name}</span>
              <span className="text-xs text-zinc-500">{profile.email}</span>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
