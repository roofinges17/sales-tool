"use client";

import { useEffect, useState } from "react";
import { AccountDetailClient } from "@/components/accounts/AccountDetailClient";
import { isUuid } from "@/lib/uuid";

type IdState = { status: "loading" } | { status: "valid"; id: string } | { status: "invalid" };

export default function AccountDetailPage() {
  const [state, setState] = useState<IdState>({ status: "loading" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accountId = params.get("id");
    if (!accountId) {
      setState({ status: "loading" });
      return;
    }
    setState(isUuid(accountId) ? { status: "valid", id: accountId } : { status: "invalid" });
  }, []);

  if (state.status === "invalid") {
    return (
      <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-6 py-8 text-center">
        <p className="text-amber-300 font-medium">Invalid account ID</p>
        <p className="text-sm text-zinc-400 mt-1">The link you followed doesn&apos;t point to a valid account.</p>
        <a href="/accounts/" className="text-brand text-sm hover:underline mt-3 inline-block">Back to Accounts</a>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center py-32 text-zinc-500">
        <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading…
      </div>
    );
  }

  return <AccountDetailClient id={state.id} />;
}
