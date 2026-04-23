export const PUBLIC_ENV = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

export function assertPublicEnv(): void {
  const missing = Object.entries(PUBLIC_ENV)
    .filter(([, v]) => !v)
    .map(([k]) => `NEXT_PUBLIC_${k}`);
  if (missing.length) {
    throw new Error(
      `Sales Tool is missing required env: ${missing.join(", ")}. ` +
        `Set these in .env.local (dev) or pass them to 'npm run build'.`,
    );
  }
}
