"use client";

import { useEffect, useState } from "react";
import { AccountDetailClient } from "@/components/accounts/AccountDetailClient";

export default function AccountDetailPage() {
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accountId = params.get("id");
    setId(accountId);
  }, []);

  if (!id) {
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

  return <AccountDetailClient id={id} />;
}
