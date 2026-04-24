"use client";

import { useAuth } from "@/lib/hooks/useAuth";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_GROUPS_FULL = [
  {
    label: "General",
    items: [
      { href: "/admin/settings/", label: "Company", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
      { href: "/admin/settings/departments/", label: "Departments", icon: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" },
      { href: "/admin/settings/users/", label: "Users & Roles", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/admin/settings/products/", label: "Product Catalog", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
      { href: "/admin/settings/commissions/", label: "Commission Plans", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
      { href: "/admin/settings/workflows/", label: "Workflows", icon: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" },
      { href: "/admin/settings/lead-sources/", label: "Lead Sources", icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" },
      { href: "/admin/settings/financing/", label: "Financing", icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" },
    ],
  },
  {
    label: "Integrations",
    items: [
      { href: "/admin/settings/quickbooks/",   label: "QuickBooks",      icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" },
      { href: "/admin/settings/gohighlevel/",  label: "GoHighLevel",     icon: "M13 10V3L4 14h7v7l9-11h-7z" },
      { href: "/admin/settings/google-maps/",  label: "Google Maps",     icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" },
      { href: "/admin/settings/openai/",       label: "OpenAI Vision",   icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.75 3.75 0 00-.864 3.5A2.75 2.75 0 0112 21.75a2.75 2.75 0 01-2.743-2.563 3.75 3.75 0 00-.864-3.5l-.347-.347z" },
      { href: "/admin/settings/resend/",       label: "Resend Email",    icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
    ],
  },
];

// Managers see only the Sales section (no user/company/department management)
const NAV_GROUPS_MANAGER = [
  {
    label: "Sales",
    items: NAV_GROUPS_FULL[1].items,
  },
];

export default function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && profile) {
      if (profile.role === "seller") {
        router.replace("/");
      }
    }
  }, [profile, loading, router]);

  if (loading) {
    return (
      <div className="flex gap-8">
        <aside className="w-52 shrink-0">
          <div className="sticky top-24 space-y-5 animate-pulse">
            {[0, 1].map((g) => (
              <div key={g}>
                <div className="mb-1.5 px-3 h-3 w-20 rounded bg-zinc-800" />
                <div className="space-y-0.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                      <div className="h-4 w-4 rounded bg-zinc-800" />
                      <div className="h-3 w-24 rounded bg-zinc-800" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>
        <div className="min-w-0 flex-1" />
      </div>
    );
  }
  if (profile?.role === "seller") return null;

  const navGroups = profile?.role === "owner" || profile?.role === "admin"
    ? NAV_GROUPS_FULL
    : NAV_GROUPS_MANAGER;

  const isActive = (href: string) =>
    href === "/admin/settings/"
      ? pathname === href
      : pathname?.startsWith(href) ?? false;

  const NavLinks = ({ onNav }: { onNav?: () => void }) => (
    <>
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={onNav}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                }`}
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {item.label}
              </a>
            ))}
          </div>
        </div>
      ))}
    </>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
      {/* Mobile menu toggle */}
      <div className="lg:hidden flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
          aria-label="Toggle settings menu"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Settings Menu
        </button>
        {/* Current page breadcrumb */}
        <span className="text-sm text-zinc-500">
          {navGroups.flatMap((g) => g.items).find((i) => isActive(i.href))?.label ?? "Settings"}
        </span>
      </div>

      {/* Mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="lg:hidden rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 space-y-5">
          <NavLinks onNav={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-52 shrink-0">
        <div className="sticky top-24 space-y-5">
          <NavLinks />
        </div>
      </aside>

      {/* Content */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
