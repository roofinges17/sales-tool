"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useQuoteBuilder } from "@/lib/contexts/QuoteBuilderContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PlacesAutocompleteInput, type PlaceResult } from "@/components/ui/PlacesAutocompleteInput";

interface AccountResult {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
}

export default function Step3Customer() {
  const { state, setExistingAccount, setIsNewCustomer, setNewCustomer, setStep, setFolioNumber } = useQuoteBuilder();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AccountResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [folioLooking, setFolioLooking] = useState(false);

  async function lookupFolioFromAddress(address: string, city: string, zip: string) {
    setFolioLooking(true);
    try {
      const res = await fetch("/api/folio-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, city, zip }),
      });
      if (res.ok) {
        const d = (await res.json()) as { folio?: string | null };
        if (d?.folio) setFolioNumber(d.folio);
      }
    } catch {
      // non-blocking
    }
    setFolioLooking(false);
  }

  function handleAddressPlaceSelect(place: PlaceResult) {
    const addr = place.formattedAddress;
    const parts = addr.split(",").map((s) => s.trim());
    const street = parts[0] ?? addr;
    const city = parts[1] ?? "";
    const stateZip = (parts[2] ?? "").trim().split(" ");
    const stateCode = stateZip[0] ?? "";
    const zip = (stateZip[1] ?? "").replace(/\D/g, "").slice(0, 5);
    setNewCustomer({
      billing_address_line1: street,
      billing_city: city,
      billing_state: stateCode,
      billing_zip: zip,
    });
    lookupFolioFromAddress(street, city, zip);
  }

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase()
      .from("accounts")
      .select("id, name, email, phone, billing_city, billing_state")
      .ilike("name", `%${q}%`)
      .limit(10);
    setSearchResults((data as AccountResult[]) ?? []);
    setSearching(false);
  }

  const canProceed = state.existingAccountId || (state.isNewCustomer && state.newCustomer.name.trim());

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Customer</h2>
        <p className="text-sm text-zinc-500 mt-1">Search for an existing customer or add a new one.</p>
      </div>

      {/* Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setIsNewCustomer(false)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            !state.isNewCustomer ? "bg-brand text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          }`}
        >
          Search Existing
        </button>
        <button
          onClick={() => setIsNewCustomer(true)}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            state.isNewCustomer ? "bg-brand text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          }`}
        >
          New Customer
        </button>
      </div>

      {!state.isNewCustomer ? (
        <div className="space-y-4">
          <Input
            placeholder="Search by customer name…"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {searching && (
            <div className="text-sm text-zinc-500">Searching…</div>
          )}
          {searchResults.length > 0 && (
            <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800 bg-zinc-900/60">
              {searchResults.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => { setExistingAccount(acc.id, acc.name); setSearchResults([]); }}
                  className={`w-full text-left px-4 py-3 transition hover:bg-zinc-800/60 ${
                    state.existingAccountId === acc.id ? "bg-brand/10" : ""
                  }`}
                >
                  <p className="font-medium text-zinc-100">{acc.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {[acc.email, acc.phone, acc.billing_city && acc.billing_state ? `${acc.billing_city}, ${acc.billing_state}` : null].filter(Boolean).join(" · ")}
                  </p>
                </button>
              ))}
            </div>
          )}
          {state.existingAccountId && (
            <div className="rounded-xl border border-green-800/50 bg-green-950/30 px-4 py-3 flex items-center gap-3">
              <svg className="h-5 w-5 text-green-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-green-300">{state.existingAccountName}</p>
                <p className="text-xs text-zinc-500">Selected customer</p>
              </div>
              <button
                onClick={() => setExistingAccount("", "")}
                className="ml-auto text-zinc-500 hover:text-zinc-300 text-xs"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h3 className="text-sm font-semibold text-zinc-300">New Customer Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Input
                label="Full Name *"
                value={state.newCustomer.name}
                onChange={(e) => setNewCustomer({ name: e.target.value })}
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={state.newCustomer.email}
              onChange={(e) => setNewCustomer({ email: e.target.value })}
            />
            <Input
              label="Phone"
              type="tel"
              value={state.newCustomer.phone}
              onChange={(e) => setNewCustomer({ phone: e.target.value })}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Property Address</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Street Address</label>
                <PlacesAutocompleteInput
                  value={state.newCustomer.billing_address_line1}
                  onChange={(v) => setNewCustomer({ billing_address_line1: v })}
                  onSelect={handleAddressPlaceSelect}
                  placeholder="123 Main St…"
                  className="w-full"
                />
              </div>
              <Input
                label="City"
                value={state.newCustomer.billing_city}
                onChange={(e) => setNewCustomer({ billing_city: e.target.value })}
              />
              <Input
                label="State"
                value={state.newCustomer.billing_state}
                onChange={(e) => setNewCustomer({ billing_state: e.target.value })}
              />
              <Input
                label="ZIP"
                value={state.newCustomer.billing_zip}
                onChange={(e) => setNewCustomer({ billing_zip: e.target.value })}
              />
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Folio Number</p>
            <div className="flex items-center gap-2">
              <Input
                label=""
                placeholder={folioLooking ? "Looking up…" : "Auto-filled from address or enter manually"}
                value={state.folioNumber}
                onChange={(e) => setFolioNumber(e.target.value)}
              />
              {!state.folioNumber && !folioLooking && state.newCustomer.billing_address_line1 && (
                <button
                  type="button"
                  onClick={() => lookupFolioFromAddress(
                    state.newCustomer.billing_address_line1,
                    state.newCustomer.billing_city,
                    state.newCustomer.billing_zip,
                  )}
                  className="shrink-0 text-xs text-brand hover:underline"
                >
                  Lookup
                </button>
              )}
              {folioLooking && (
                <svg className="h-4 w-4 animate-spin text-zinc-400 shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
          <Button
            className="flex-1"
            disabled={!canProceed}
            onClick={() => setStep(4)}
          >
            Next: Review
          </Button>
        </div>
        {!canProceed && (
          <p className="text-center text-sm text-zinc-500">
            {state.isNewCustomer
              ? "Enter the customer's name to continue."
              : "Search and select an existing customer to continue."}
          </p>
        )}
      </div>
    </div>
  );
}
