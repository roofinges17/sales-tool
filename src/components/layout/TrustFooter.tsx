"use client";

export type TrustFooterVariant = "standard" | "dense" | "strip";

interface TrustFooterProps {
  variant?: TrustFooterVariant;
}

const signals = [
  { label: "CCC1331656", sublabel: "State Certified" },
  { label: "BBB A+", sublabel: "Accredited Business" },
  { label: "Miami-Dade NOA", sublabel: "Certified Products" },
  { label: "700+ Permits", sublabel: "Issued Statewide" },
];

export function TrustFooter({ variant = "standard" }: TrustFooterProps) {
  if (variant === "strip") {
    return (
      <footer className="trust-footer-strip sticky bottom-0 z-40 border-t border-trust-border bg-trust-bg">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-6 px-6 py-2">
          {signals.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-xs">
              <svg className="h-3 w-3 shrink-0 text-brand" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1l2.753 8.472H23.5l-7.127 5.18 2.752 8.472L12 18.944l-7.125 5.18 2.752-8.472L.5 10.472h8.748z" />
              </svg>
              <span className="font-semibold text-trust-label">{s.label}</span>
              <span className="text-trust-sublabel hidden sm:inline">{s.sublabel}</span>
            </span>
          ))}
        </div>
      </footer>
    );
  }

  if (variant === "dense") {
    return (
      <footer className="trust-footer-dense border-t border-trust-border bg-trust-bg px-6 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-2">
          <span className="text-xs font-semibold text-trust-heading uppercase tracking-wide">Licensed &amp; Certified</span>
          {signals.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-xs">
              <svg className="h-3 w-3 shrink-0 text-brand" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-.52 3.64 3.745 3.745 0 01-3.64.521A3.745 3.745 0 0112 21a3.745 3.745 0 01-3.248-1.771 3.745 3.745 0 01-3.64-.521 3.745 3.745 0 01-.52-3.64A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 01.52-3.64 3.745 3.745 0 013.64-.521A3.745 3.745 0 0112 3a3.745 3.745 0 013.248 1.771 3.745 3.745 0 013.64.521 3.745 3.745 0 01.52 3.64A3.745 3.745 0 0121 12z" strokeWidth={1.5} stroke="currentColor" fill="none" />
              </svg>
              <span className="font-semibold text-trust-label">{s.label}</span>
              <span className="text-trust-sublabel">· {s.sublabel}</span>
            </span>
          ))}
        </div>
      </footer>
    );
  }

  // standard
  return (
    <footer className="trust-footer border-t border-trust-border bg-trust-bg px-6 py-4">
      <div className="mx-auto max-w-7xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-trust-heading">
          Licensed &amp; Certified
        </p>
        <div className="flex flex-wrap gap-4">
          {signals.map((s) => (
            <div key={s.label} className="flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/5 px-3 py-2">
              <svg className="h-4 w-4 shrink-0 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-.52 3.64 3.745 3.745 0 01-3.64.521A3.745 3.745 0 0112 21a3.745 3.745 0 01-3.248-1.771 3.745 3.745 0 01-3.64-.521 3.745 3.745 0 01-.52-3.64A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 01.52-3.64 3.745 3.745 0 013.64-.521A3.745 3.745 0 0112 3a3.745 3.745 0 013.248 1.771 3.745 3.745 0 013.64.521 3.745 3.745 0 01.52 3.64A3.745 3.745 0 0121 12z" />
              </svg>
              <div>
                <p className="text-xs font-bold text-trust-label leading-tight">{s.label}</p>
                <p className="text-xs text-trust-sublabel leading-tight">{s.sublabel}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
