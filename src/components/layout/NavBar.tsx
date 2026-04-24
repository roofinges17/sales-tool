"use client";

import { useState, useEffect, useRef } from "react";
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
  { href: "/measure/", label: "Measure" },
];

function getInitials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function roleLabel(role?: string | null) {
  const map: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    manager: "Manager",
    seller: "Seller",
    sales_manager: "Sales Manager",
  };
  return map[role ?? ""] ?? role ?? "—";
}

export function NavBar({ profile }: NavBarProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

  function isActive(href: string) {
    if (href === "/") return currentPath === "/" || currentPath === "";
    return currentPath.startsWith(href.replace(/\/$/, ""));
  }

  const showAdmin = profile?.role === "owner" || profile?.role === "admin" || profile?.role === "manager";

  async function handleSignOut() {
    await supabase().auth.signOut();
    window.location.href = "/login/";
  }

  // Close user menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const allLinks = showAdmin
    ? [...navLinks, { href: "/admin/settings/", label: "Admin" }]
    : navLinks;

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        {/* Left: brand + desktop nav */}
        <div className="flex items-center gap-6">
          <a href="/" className="flex items-center gap-2.5 hover:opacity-80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo.png" alt="Roofing Experts" className="h-7 w-auto" />
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
            {showAdmin && (
              <a
                href="/admin/settings/"
                className={`rounded-lg px-3 py-1.5 text-sm transition flex items-center gap-1.5 ${
                  isActive("/admin/settings")
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                }`}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Admin
              </a>
            )}
          </div>
        </div>

        {/* Right: user dropdown + mobile hamburger */}
        <div className="flex items-center gap-2">
          {/* User dropdown */}
          {profile && (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition hover:bg-zinc-800"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand">
                  {getInitials(profile.name)}
                </span>
                <span className="hidden text-sm font-medium text-zinc-300 sm:block max-w-[120px] truncate">
                  {profile.name}
                </span>
                <svg
                  className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl z-50">
                  {/* Identity */}
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <p className="text-sm font-medium text-zinc-100 truncate">{profile.name}</p>
                    <p className="text-xs text-zinc-500 truncate mt-0.5">{profile.email}</p>
                    <span className="mt-1.5 inline-flex items-center rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-400">
                      {roleLabel(profile.role)}
                    </span>
                  </div>
                  {/* Actions */}
                  <div className="p-1">
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mobile hamburger */}
          <button
            className="md:hidden rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950 px-4 py-3 space-y-1">
          {allLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`block rounded-lg px-3 py-2.5 text-sm transition ${
                isActive(link.href)
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
              }`}
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
