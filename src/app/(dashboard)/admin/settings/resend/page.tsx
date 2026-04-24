"use client";

import IntegrationStatusCard from "@/components/settings/IntegrationStatusCard";

// Resend is not yet live — GoDaddy DNS records for roofingex.com need to be
// added before the domain can be verified. This page is a stub until then.

export default function ResendPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Resend Email</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Transactional email — quote PDFs, accept links, and customer notifications.
        </p>
      </div>

      <IntegrationStatusCard
        name="Resend"
        description="Email delivery for quotes and customer communications"
        status="unconfigured"
        statusLabel="Not connected"
        lastChecked={null}
        onRecheck={() => {}}
        checking={false}
      >
        <div className="space-y-4 text-sm text-zinc-400">
          <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-300">
            <strong>Pending DNS setup</strong> — Resend requires TXT + MX records on roofingex.com to
            verify the domain before email delivery goes live. Add the records in GoDaddy DNS, then
            verify in the Resend dashboard.
          </div>

          <div className="space-y-1">
            <h3 className="text-sm font-medium text-zinc-300">Setup checklist</h3>
            <ol className="space-y-1.5 pl-4 text-xs text-zinc-500 list-decimal">
              <li>Log in to Resend dashboard → Domains → Add domain <code className="text-zinc-400">roofingex.com</code></li>
              <li>Copy the TXT record (SPF) and DKIM CNAME records Resend provides</li>
              <li>Add those records in GoDaddy DNS for roofingex.com</li>
              <li>Click "Verify" in Resend — DNS propagation is usually 5–30 min</li>
              <li>Add <code className="text-zinc-400">RESEND_API_KEY</code> to Cloudflare Pages env and redeploy</li>
            </ol>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="https://resend.com/domains"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
            >
              Resend Domains dashboard →
            </a>
            <a
              href="https://dcc.godaddy.com/manage/roofingex.com/dns"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
            >
              GoDaddy DNS for roofingex.com →
            </a>
          </div>
        </div>
      </IntegrationStatusCard>
    </div>
  );
}
