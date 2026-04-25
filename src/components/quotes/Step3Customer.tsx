"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/api";
import { toast } from "sonner";
import { useQuoteBuilder } from "@/lib/contexts/QuoteBuilderContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PlacesAutocompleteInput, type PlaceResult } from "@/components/ui/PlacesAutocompleteInput";
import { AddressIntelCard, type AddressIntelResult } from "@/components/AddressIntelCard";

const LEAD_SOURCES = ["D2D", "Digital", "Door Knock", "GHL / CRM", "Insurance Claim", "Referral", "Social Media", "Website"];

const ROOF_SKUS = ["ALUMINUM", "FLAT", "FLAT INSULATIONS", "METAL", "SHINGLE", "TILE"];
const FLAT_SKUS = ["FLAT", "FLAT INSULATIONS"];

interface AccountResult {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
}

export default function Step3Customer() {
  const { state, setExistingAccount, setIsNewCustomer, setNewCustomer, setStep, setFolioNumber, updateCartQty } = useQuoteBuilder();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AccountResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intel, setIntel] = useState<AddressIntelResult | null>(null);
  const [intelError, setIntelError] = useState<string | null>(null);

  async function fetchAddressIntel(address: string, city: string, zip: string, lat: number, lng: number) {
    setIntelLoading(true);
    setIntelError(null);
    setIntel(null);
    try {
      const res = await authedFetch("/api/address-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: `${address}, ${city}`, lat, lng, zip }),
      });
      if (res.ok) {
        const d = (await res.json()) as AddressIntelResult;
        setIntel(d);
        if (d.folio) setFolioNumber(d.folio);
      } else {
        setIntelError("Address intelligence unavailable — folio entry may be manual.");
      }
    } catch {
      setIntelError("Address intelligence unavailable — folio entry may be manual.");
    }
    setIntelLoading(false);
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
    if (place.lat && place.lng) {
      fetchAddressIntel(street, city, zip, place.lat, place.lng);
    }
  }

  function handleApplyMeasurements({ slopedSqft, flatSqft }: { slopedSqft: number; flatSqft: number }) {
    for (const item of state.cart) {
      const sku = (item.product_sku ?? "").toUpperCase();
      if (!ROOF_SKUS.some((c) => sku.startsWith(c))) continue;
      const isFlat = FLAT_SKUS.some((c) => sku.startsWith(c));
      const qty = isFlat ? flatSqft : slopedSqft;
      if (qty > 0) updateCartQty(item.product_id, qty);
    }
  }

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data, error } = await supabase()
      .from("accounts")
      .select("id, name, email, phone, billing_city, billing_state")
      .ilike("name", `%${q}%`)
      .limit(10);
    if (error) toast.error("Customer search failed: " + error.message);
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
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
            <div className="sm:col-span-2">
              <Select
                label="Lead Source"
                value={state.newCustomer.lead_source}
                onChange={(e) => setNewCustomer({ lead_source: e.target.value })}
                placeholder="How did they hear about us?"
                options={LEAD_SOURCES.map((s) => ({ value: s, label: s }))}
              />
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Property Address</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          {/* Address Intelligence — auto-fires on address select */}
          {(intelLoading || intel || intelError) && (
            <div>
              {intelError && !intelLoading && (
                <p className="text-xs text-amber-400">{intelError}</p>
              )}
              {(intelLoading || intel) && (
                <AddressIntelCard
                  data={intel ?? {}}
                  loading={intelLoading}
                  onApplyMeasurements={state.cart.length > 0 ? handleApplyMeasurements : undefined}
                />
              )}
            </div>
          )}

          {/* Folio override — shown after intel loads or always if intel unavailable */}
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Folio Number</p>
            <Input
              label=""
              placeholder="Auto-filled from address or enter manually"
              value={state.folioNumber}
              onChange={(e) => setFolioNumber(e.target.value)}
            />
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
