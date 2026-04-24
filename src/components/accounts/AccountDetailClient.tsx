"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/lib/hooks/useAuth";
import { toast } from "sonner";
import type { Account, Contact, Property, Quote, Sale } from "@/types";

type TabKey = "overview" | "contacts" | "properties" | "estimates" | "contracts";

const tabs = [
  { key: "overview", label: "Overview" },
  { key: "contacts", label: "Contacts" },
  { key: "properties", label: "Properties" },
  { key: "estimates", label: "Estimates" },
  { key: "contracts", label: "Contracts" },
];

function typeBadge(type: string | null | undefined) {
  const map: Record<string, "blue" | "purple" | "teal"> = {
    RESIDENTIAL: "blue",
    COMMERCIAL: "purple",
    MULTIFAMILY: "teal",
  };
  return <Badge variant={map[type ?? ""] ?? "default"}>{type ?? "—"}</Badge>;
}

function statusBadge(status: string | null | undefined) {
  const map: Record<string, "green" | "red" | "orange"> = {
    ACTIVE: "green",
    INACTIVE: "red",
    PROSPECT: "orange",
  };
  return <Badge variant={map[status ?? ""] ?? "default"}>{status ?? "—"}</Badge>;
}

function quoteStatusBadge(status: string) {
  const map: Record<string, "blue" | "orange" | "green" | "red" | "gray"> = {
    DRAFT: "gray",
    SENT: "blue",
    ACCEPTED: "green",
    REJECTED: "red",
    EXPIRED: "red",
  };
  return <Badge variant={map[status] ?? "gray"}>{status}</Badge>;
}

function saleStatusBadge(status: string) {
  const map: Record<string, "orange" | "green" | "red" | "blue"> = {
    PENDING: "orange",
    ACTIVE: "green",
    CANCELLED: "red",
    COMPLETED: "blue",
  };
  return <Badge variant={map[status] ?? "gray"}>{status}</Badge>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

interface ContactFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  title: string;
  role: string;
  is_primary: boolean;
  notes: string;
}

interface PropertyFormData {
  name: string;
  street: string;
  city: string;
  state: string;
  zip_code: string;
  property_type: string;
  square_footage: string;
  year_built: string;
  notes: string;
  is_primary: boolean;
}

interface AccountEditForm {
  name: string;
  type: string;
  status: string;
  email: string;
  phone: string;
  lead_source: string;
  billing_address_line1: string;
  billing_address_line2: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  notes: string;
}

interface LeadSourceOption {
  value: string;
  name: string;
}

const initialContact: ContactFormData = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  title: "",
  role: "HOMEOWNER",
  is_primary: false,
  notes: "",
};

const initialProperty: PropertyFormData = {
  name: "",
  street: "",
  city: "",
  state: "",
  zip_code: "",
  property_type: "SINGLE_FAMILY",
  square_footage: "",
  year_built: "",
  notes: "",
  is_primary: false,
};

export function AccountDetailClient({ id }: { id: string }) {
  const { profile } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [leadSources, setLeadSources] = useState<LeadSourceOption[]>([]);

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<AccountEditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Contact modal
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactForm, setContactForm] = useState<ContactFormData>(initialContact);
  const [savingContact, setSavingContact] = useState(false);

  // Property modal
  const [propertyModalOpen, setPropertyModalOpen] = useState(false);
  const [propertyForm, setPropertyForm] = useState<PropertyFormData>(initialProperty);
  const [savingProperty, setSavingProperty] = useState(false);

  useEffect(() => {
    if (id) loadAll();
  }, [id]);

  async function loadAll() {
    setLoading(true);
    const db = supabase();
    const [
      { data: acct },
      { data: ctcts },
      { data: props },
      { data: qts },
      { data: sls },
      { data: ls },
    ] = await Promise.all([
      db.from("accounts").select("*, assigned_to:assigned_to_id(id, name, email)").eq("id", id).single(),
      db.from("contacts").select("*").eq("account_id", id).order("is_primary", { ascending: false }),
      db.from("properties").select("*").eq("account_id", id).order("is_primary", { ascending: false }),
      db.from("quotes").select("*").eq("account_id", id).order("created_at", { ascending: false }),
      db.from("sales").select("*").eq("account_id", id).order("created_at", { ascending: false }),
      db.from("lead_sources").select("name, value").eq("is_active", true).order("name"),
    ]);
    setAccount(acct as Account | null);
    setContacts((ctcts as Contact[]) ?? []);
    setProperties((props as Property[]) ?? []);
    setQuotes((qts as Quote[]) ?? []);
    setSales((sls as Sale[]) ?? []);
    setLeadSources((ls as LeadSourceOption[]) ?? []);
    setLoading(false);
  }

  function openEditModal() {
    if (!account) return;
    setEditForm({
      name: account.name ?? "",
      type: account.type ?? "",
      status: account.status ?? "",
      email: account.email ?? "",
      phone: account.phone ?? "",
      lead_source: account.lead_source ?? "",
      billing_address_line1: account.billing_address_line1 ?? "",
      billing_address_line2: account.billing_address_line2 ?? "",
      billing_city: account.billing_city ?? "",
      billing_state: account.billing_state ?? "",
      billing_zip: account.billing_zip ?? "",
      notes: account.notes ?? "",
    });
    setDeleteConfirm(false);
    setEditModalOpen(true);
  }

  async function handleSaveEdit() {
    if (!editForm || !account) return;
    if (!editForm.name.trim()) { toast.error("Name is required"); return; }
    setSavingEdit(true);
    const { error } = await supabase().from("accounts").update({
      name: editForm.name.trim(),
      type: editForm.type || null,
      status: editForm.status || null,
      email: editForm.email.trim() || null,
      phone: editForm.phone.trim() || null,
      lead_source: editForm.lead_source || null,
      billing_address_line1: editForm.billing_address_line1.trim() || null,
      billing_address_line2: editForm.billing_address_line2.trim() || null,
      billing_city: editForm.billing_city.trim() || null,
      billing_state: editForm.billing_state.trim() || null,
      billing_zip: editForm.billing_zip.trim() || null,
      notes: editForm.notes.trim() || null,
    }).eq("id", account.id);
    setSavingEdit(false);
    if (error) { toast.error("Save failed: " + error.message); return; }
    toast.success("Customer updated");
    setEditModalOpen(false);
    loadAll();
  }

  async function handleDeleteAccount() {
    if (!account) return;
    setDeleting(true);
    const { count } = await supabase()
      .from("quotes")
      .select("*", { count: "exact", head: true })
      .eq("account_id", account.id);
    if (count && count > 0) {
      toast.error(`Cannot delete: this customer has ${count} estimate${count !== 1 ? "s" : ""}. Remove them first.`);
      setDeleting(false);
      setDeleteConfirm(false);
      return;
    }
    const { error } = await supabase().from("accounts").delete().eq("id", account.id);
    setDeleting(false);
    if (error) { toast.error("Delete failed: " + error.message); return; }
    toast.success("Customer deleted");
    window.location.href = "/accounts/";
  }

  async function saveContact(e: React.FormEvent) {
    e.preventDefault();
    if (!contactForm.first_name.trim() || !contactForm.last_name.trim()) return;
    setSavingContact(true);
    await supabase().from("contacts").insert({
      account_id: id,
      first_name: contactForm.first_name.trim(),
      last_name: contactForm.last_name.trim(),
      email: contactForm.email.trim() || null,
      phone: contactForm.phone.trim() || null,
      title: contactForm.title.trim() || null,
      role: contactForm.role || null,
      is_primary: contactForm.is_primary,
      notes: contactForm.notes.trim() || null,
    });
    setSavingContact(false);
    setContactModalOpen(false);
    setContactForm(initialContact);
    const { data, error: cErr } = await supabase().from("contacts").select("*").eq("account_id", id).order("is_primary", { ascending: false });
    if (cErr) toast.error("Failed to reload contacts: " + cErr.message);
    setContacts((data as Contact[]) ?? []);
  }

  async function saveProperty(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyForm.street.trim() || !propertyForm.city.trim() || !propertyForm.state.trim() || !propertyForm.zip_code.trim()) return;
    setSavingProperty(true);
    await supabase().from("properties").insert({
      account_id: id,
      name: propertyForm.name.trim() || null,
      street: propertyForm.street.trim(),
      city: propertyForm.city.trim(),
      state: propertyForm.state.trim(),
      zip_code: propertyForm.zip_code.trim(),
      property_type: propertyForm.property_type || null,
      square_footage: propertyForm.square_footage ? parseInt(propertyForm.square_footage) : null,
      year_built: propertyForm.year_built ? parseInt(propertyForm.year_built) : null,
      notes: propertyForm.notes.trim() || null,
      is_primary: propertyForm.is_primary,
    });
    setSavingProperty(false);
    setPropertyModalOpen(false);
    setPropertyForm(initialProperty);
    const { data, error: pErr } = await supabase().from("properties").select("*").eq("account_id", id).order("is_primary", { ascending: false });
    if (pErr) toast.error("Failed to reload properties: " + pErr.message);
    setProperties((data as Property[]) ?? []);
  }

  if (loading) {
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

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <p className="text-zinc-400">Customer not found.</p>
        <a href="/accounts/" className="mt-4 text-sm text-brand hover:underline">
          Back to Customers
        </a>
      </div>
    );
  }

  const tabsWithCounts = tabs.map((t) => {
    const countMap: Partial<Record<TabKey, number>> = {
      contacts: contacts.length,
      properties: properties.length,
      estimates: quotes.length,
      contracts: sales.length,
    };
    return { ...t, count: countMap[t.key as TabKey] };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => window.history.back()}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-zinc-50">{account.name}</h1>
              {typeBadge(account.type)}
              {statusBadge(account.status)}
            </div>
            {(account.assigned_to as { name?: string } | null)?.name && (
              <p className="mt-1 text-sm text-zinc-500">
                Assigned to{" "}
                <span className="text-zinc-300">
                  {(account.assigned_to as { name?: string } | null)?.name}
                </span>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(profile?.role === "owner" || profile?.role === "admin") && (
            deleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-400">Delete this customer?</span>
                <Button variant="danger" loading={deleting} onClick={handleDeleteAccount}>Confirm</Button>
                <Button variant="secondary" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="danger" onClick={() => setDeleteConfirm(true)}>Delete</Button>
            )
          )}
          <Button variant="secondary" onClick={openEditModal}>Edit</Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={tabsWithCounts}
        activeTab={activeTab}
        onChange={(k) => setActiveTab(k as TabKey)}
      />

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4">
              <h2 className="text-sm font-semibold text-zinc-200">Contact Information</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500">Email</dt>
                  <dd className="text-zinc-200">{account.email ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500">Phone</dt>
                  <dd className="text-zinc-200">{account.phone ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500">Lead Source</dt>
                  <dd className="capitalize text-zinc-200">{account.lead_source ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500">Type</dt>
                  <dd>{typeBadge(account.type)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-zinc-500">Status</dt>
                  <dd>{statusBadge(account.status)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4">
              <h2 className="text-sm font-semibold text-zinc-200">Billing Address</h2>
              {account.billing_address_line1 ? (
                <address className="not-italic text-sm text-zinc-300 space-y-1">
                  <p>{account.billing_address_line1}</p>
                  {account.billing_address_line2 && <p>{account.billing_address_line2}</p>}
                  <p>
                    {[account.billing_city, account.billing_state, account.billing_zip]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </address>
              ) : (
                <p className="text-sm text-zinc-500">No billing address on file.</p>
              )}
              {account.notes && (
                <div className="mt-4 border-t border-zinc-800 pt-4">
                  <p className="text-xs font-medium text-zinc-500 mb-2">Notes</p>
                  <p className="text-sm text-zinc-300">{account.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "contacts" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">{contacts.length} contact{contacts.length !== 1 ? "s" : ""}</p>
            <Button
              variant="secondary"
              onClick={() => setContactModalOpen(true)}
              leftIcon={
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Add Contact
            </Button>
          </div>
          {contacts.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  title="No contacts yet"
                  description="Add contacts associated with this account."
                  action={{ label: "Add Contact", onClick: () => setContactModalOpen(true) }}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {contacts.map((c) => (
                <Card key={c.id}>
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-zinc-100">
                          {c.first_name} {c.last_name}
                          {c.is_primary && (
                            <Badge variant="blue" className="ml-2">Primary</Badge>
                          )}
                        </p>
                        {c.title && <p className="text-xs text-zinc-500">{c.title}</p>}
                      </div>
                      {c.role && <Badge variant="default">{c.role.replace("_", " ")}</Badge>}
                    </div>
                    <dl className="space-y-1 text-sm">
                      {c.email && (
                        <div className="flex items-center gap-2">
                          <dt className="text-zinc-500">Email</dt>
                          <dd className="text-zinc-300">{c.email}</dd>
                        </div>
                      )}
                      {c.phone && (
                        <div className="flex items-center gap-2">
                          <dt className="text-zinc-500">Phone</dt>
                          <dd className="text-zinc-300">{c.phone}</dd>
                        </div>
                      )}
                    </dl>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "properties" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">{properties.length} propert{properties.length !== 1 ? "ies" : "y"}</p>
            <Button
              variant="secondary"
              onClick={() => setPropertyModalOpen(true)}
              leftIcon={
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Add Property
            </Button>
          </div>
          {properties.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  title="No properties yet"
                  description="Add job site properties for this account."
                  action={{ label: "Add Property", onClick: () => setPropertyModalOpen(true) }}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {properties.map((p) => (
                <Card key={p.id}>
                  <CardContent className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-zinc-100">
                          {p.name ?? `${p.street}`}
                          {p.is_primary && (
                            <Badge variant="green" className="ml-2">Primary</Badge>
                          )}
                        </p>
                        <address className="not-italic text-sm text-zinc-400">
                          {p.street}, {p.city}, {p.state} {p.zip_code}
                        </address>
                      </div>
                      {p.property_type && (
                        <Badge variant="default">{p.property_type.replace("_", " ")}</Badge>
                      )}
                    </div>
                    {(p.square_footage || p.year_built) && (
                      <div className="flex gap-4 text-xs text-zinc-500">
                        {p.square_footage && <span>{p.square_footage.toLocaleString()} sq ft</span>}
                        {p.year_built && <span>Built {p.year_built}</span>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "estimates" && (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-200">Estimates</h2>
              <a href="/quotes/" className="text-xs text-brand hover:underline">
                New Estimate
              </a>
            </div>
            {quotes.length === 0 ? (
              <EmptyState
                title="No estimates yet"
                description="Create an estimate for this customer."
              />
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {quotes.map((q) => (
                  <div key={q.id} className="flex items-center justify-between py-3">
                    <div>
                      <a
                        href={`/quotes/${q.id}/`}
                        className="font-medium text-zinc-200 hover:text-brand"
                      >
                        {q.name}
                      </a>
                      <p className="text-xs text-zinc-500">{formatDate(q.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {quoteStatusBadge(q.status)}
                      <span className="text-sm font-medium text-zinc-200">
                        {formatCurrency(q.total ?? undefined)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "contracts" && (
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-200">Contracts</h2>
            {sales.length === 0 ? (
              <EmptyState
                title="No contracts yet"
                description="Convert an accepted estimate to a contract."
              />
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {sales.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-3">
                    <div>
                      <a
                        href={`/sales/${s.id}/`}
                        className="font-medium text-zinc-200 hover:text-brand"
                      >
                        {s.contract_number ?? s.name}
                      </a>
                      <p className="text-xs text-zinc-500">{formatDate(s.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {saleStatusBadge(s.status)}
                      <span className="text-sm font-medium text-zinc-200">
                        {formatCurrency(s.contract_value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Account Modal */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Customer"
        maxWidth="max-w-2xl"
      >
        {editForm && (
          <div className="space-y-4">
            <Input
              label="Name *"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f!, name: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Type"
                value={editForm.type}
                onChange={(e) => setEditForm((f) => ({ ...f!, type: e.target.value }))}
                placeholder="Select type"
                options={[
                  { value: "RESIDENTIAL", label: "Residential" },
                  { value: "COMMERCIAL", label: "Commercial" },
                  { value: "MULTIFAMILY", label: "Multifamily" },
                ]}
              />
              <Select
                label="Status"
                value={editForm.status}
                onChange={(e) => setEditForm((f) => ({ ...f!, status: e.target.value }))}
                placeholder="Select status"
                options={[
                  { value: "ACTIVE", label: "Active" },
                  { value: "INACTIVE", label: "Inactive" },
                  { value: "PROSPECT", label: "Prospect" },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f!, email: e.target.value }))}
              />
              <Input
                label="Phone"
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f!, phone: e.target.value }))}
              />
            </div>
            <Select
              label="Lead Source"
              value={editForm.lead_source}
              onChange={(e) => setEditForm((f) => ({ ...f!, lead_source: e.target.value }))}
              placeholder="No lead source"
              options={leadSources.map((s) => ({ value: s.value, label: s.name }))}
            />
            <Input
              label="Billing Address Line 1"
              value={editForm.billing_address_line1}
              onChange={(e) => setEditForm((f) => ({ ...f!, billing_address_line1: e.target.value }))}
              placeholder="123 Main St"
            />
            <Input
              label="Billing Address Line 2"
              value={editForm.billing_address_line2}
              onChange={(e) => setEditForm((f) => ({ ...f!, billing_address_line2: e.target.value }))}
              placeholder="Apt 4B"
            />
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="City"
                value={editForm.billing_city}
                onChange={(e) => setEditForm((f) => ({ ...f!, billing_city: e.target.value }))}
              />
              <Input
                label="State"
                value={editForm.billing_state}
                onChange={(e) => setEditForm((f) => ({ ...f!, billing_state: e.target.value }))}
                maxLength={2}
              />
              <Input
                label="ZIP"
                value={editForm.billing_zip}
                onChange={(e) => setEditForm((f) => ({ ...f!, billing_zip: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-300">Notes</label>
              <textarea
                rows={3}
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f!, notes: e.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
              <Button type="button" variant="secondary" onClick={() => setEditModalOpen(false)}>Cancel</Button>
              <Button loading={savingEdit} onClick={handleSaveEdit}>Save Changes</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Contact Modal */}
      <Modal
        open={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        title="Add Contact"
      >
        <form onSubmit={saveContact} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="First Name *"
              value={contactForm.first_name}
              onChange={(e) => setContactForm((p) => ({ ...p, first_name: e.target.value }))}
              required
            />
            <Input
              label="Last Name *"
              value={contactForm.last_name}
              onChange={(e) => setContactForm((p) => ({ ...p, last_name: e.target.value }))}
              required
            />
          </div>
          <Input
            label="Email"
            type="email"
            value={contactForm.email}
            onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))}
          />
          <Input
            label="Phone"
            type="tel"
            value={contactForm.phone}
            onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))}
          />
          <Input
            label="Title"
            value={contactForm.title}
            onChange={(e) => setContactForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Homeowner"
          />
          <Select
            label="Role"
            value={contactForm.role}
            onChange={(e) => setContactForm((p) => ({ ...p, role: e.target.value }))}
            options={[
              { value: "HOMEOWNER", label: "Homeowner" },
              { value: "SPOUSE", label: "Spouse" },
              { value: "TENANT", label: "Tenant" },
              { value: "PROPERTY_MANAGER", label: "Property Manager" },
              { value: "REALTOR", label: "Realtor" },
              { value: "OTHER", label: "Other" },
            ]}
          />
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={contactForm.is_primary}
              onChange={(e) => setContactForm((p) => ({ ...p, is_primary: e.target.checked }))}
              className="rounded border-zinc-700 bg-zinc-900 text-brand focus:ring-brand/30"
            />
            Primary contact
          </label>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setContactModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={savingContact}>
              Add Contact
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Property Modal */}
      <Modal
        open={propertyModalOpen}
        onClose={() => setPropertyModalOpen(false)}
        title="Add Property"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={saveProperty} className="space-y-4">
          <Input
            label="Property Name (optional)"
            value={propertyForm.name}
            onChange={(e) => setPropertyForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Main Residence"
          />
          <Input
            label="Street Address *"
            value={propertyForm.street}
            onChange={(e) => setPropertyForm((p) => ({ ...p, street: e.target.value }))}
            placeholder="123 Main St"
            required
          />
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="City *"
              value={propertyForm.city}
              onChange={(e) => setPropertyForm((p) => ({ ...p, city: e.target.value }))}
              required
            />
            <Input
              label="State *"
              value={propertyForm.state}
              onChange={(e) => setPropertyForm((p) => ({ ...p, state: e.target.value }))}
              maxLength={2}
              required
            />
            <Input
              label="ZIP *"
              value={propertyForm.zip_code}
              onChange={(e) => setPropertyForm((p) => ({ ...p, zip_code: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Property Type"
              value={propertyForm.property_type}
              onChange={(e) => setPropertyForm((p) => ({ ...p, property_type: e.target.value }))}
              options={[
                { value: "SINGLE_FAMILY", label: "Single Family" },
                { value: "MULTI_FAMILY", label: "Multi Family" },
                { value: "COMMERCIAL", label: "Commercial" },
                { value: "INDUSTRIAL", label: "Industrial" },
                { value: "OTHER", label: "Other" },
              ]}
            />
            <Input
              label="Square Footage"
              type="number"
              value={propertyForm.square_footage}
              onChange={(e) => setPropertyForm((p) => ({ ...p, square_footage: e.target.value }))}
              placeholder="2000"
            />
          </div>
          <Input
            label="Year Built"
            type="number"
            value={propertyForm.year_built}
            onChange={(e) => setPropertyForm((p) => ({ ...p, year_built: e.target.value }))}
            placeholder="2005"
          />
          <textarea
            value={propertyForm.notes}
            onChange={(e) => setPropertyForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Notes about this property…"
            rows={3}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={propertyForm.is_primary}
              onChange={(e) => setPropertyForm((p) => ({ ...p, is_primary: e.target.checked }))}
              className="rounded border-zinc-700 bg-zinc-900 text-brand focus:ring-brand/30"
            />
            Primary property
          </label>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setPropertyModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={savingProperty}>
              Add Property
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
