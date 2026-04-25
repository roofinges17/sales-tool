"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) window.location.href = "/";
      })
      .catch(() => { /* network error — stay on login page */ });
  }, []);

  const emailInvalid = emailTouched && !email.includes("@");
  const passwordInvalid = passwordTouched && password.length < 6;

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setEmailTouched(true);
    setPasswordTouched(true);
    if (!email.includes("@") || password.length < 6) return;

    setLoading(true);
    setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Invalid email or password. Please try again.");
    } else {
      window.location.href = "/";
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/15 ring-1 ring-brand/20">
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-brand" fill="currentColor">
              <path d="M12 2L2 9.5V22h7v-6h6v6h7V9.5L12 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">Roofing Experts</h1>
          <p className="mt-1.5 text-sm text-zinc-500">CRM · Sales</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-2xl shadow-black/40">
          <form onSubmit={handleSignIn} className="space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-zinc-300">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                placeholder="your@email.com"
                className={`w-full rounded-xl border bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:ring-2 focus:ring-brand/30 ${
                  emailInvalid
                    ? "border-red-700 focus:border-red-600"
                    : "border-zinc-700 focus:border-brand"
                }`}
              />
              {emailInvalid && (
                <p className="mt-1.5 text-xs text-red-400">Enter a valid email address.</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-zinc-300">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setPasswordTouched(true)}
                placeholder="••••••••"
                className={`w-full rounded-xl border bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:ring-2 focus:ring-brand/30 ${
                  passwordInvalid
                    ? "border-red-700 focus:border-red-600"
                    : "border-zinc-700 focus:border-brand"
                }`}
              />
              {passwordInvalid && (
                <p className="mt-1.5 text-xs text-red-400">Password must be at least 6 characters.</p>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/20 transition hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Field team access only · Contact your administrator
        </p>
      </div>
    </main>
  );
}
