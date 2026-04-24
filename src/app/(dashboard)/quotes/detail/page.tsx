"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/hooks/useAuth";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { toast } from "sonner";
import PhotoUpload from "@/components/quotes/PhotoUpload";
import PhotoGallery, { type ProjectPhoto } from "@/components/quotes/PhotoGallery";
import { isUuid } from "@/lib/uuid";

interface QuoteLineItem {
  id: string;
  product_id?: string | null;
  product_name: string;
  product_sku?: string | null;
  quantity: number;
  unit_price: number;
  unit_cost?: number | null;
  line_total: number;
}

interface QuoteDetail {
  id: string;
  name: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  subtotal?: number | null;
  discount_type?: string | null;
  discount_value?: number | null;
  discount_amount?: number | null;
  tax_rate?: number | null;
  tax_exempt?: boolean | null;
  tax_amount?: number | null;
  total?: number | null;
  monthly_payment?: number | null;
  financing_provider?: string | null;
  financing_term?: number | null;
  financing_rate?: number | null;
  valid_until?: string | null;
  notes?: string | null;
  created_at: string;
  accept_token?: string | null;
  accepted_at?: string | null;
  signed_at?: string | null;
  customer_signature_data_url?: string | null;
  visualization_color_id?: string | null;
  visualization_image?: string | null;
  roof_color?: string | null;
  visualizer_image_url?: string | null;
  folio_number?: string | null;
  account?: {
    id: string;
    name: string;
    email?: string | null;
    billing_address_line1?: string | null;
    billing_city?: string | null;
    billing_state?: string | null;
    billing_zip?: string | null;
  } | null;
  assigned_to?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  quote_line_items?: QuoteLineItem[];
}

function formatCurrency(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const statusVariant: Record<string, "gray" | "orange" | "blue" | "green" | "red"> = {
  DRAFT: "gray",
  SENT: "blue",
  ACCEPTED: "green",
  REJECTED: "red",
  EXPIRED: "orange",
};

type TabKey = "overview" | "photos" | "notes" | "visualize";


function QuoteDetailContent() {
  const searchParams = useSearchParams();
  const rawId = searchParams.get("id");
  const quoteId = isUuid(rawId) ? rawId : null;
  const invalidId = rawId !== null && quoteId === null;
  const { user } = useAuth();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [newNote, setNewNote] = useState("");
  const [notes, setNotes] = useState<Array<{ id: string; content: string; author_name?: string; created_at: string }>>([]);
  const [photos, setPhotos] = useState<ProjectPhoto[]>([]);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [emailLinkModal, setEmailLinkModal] = useState(false);
  const [emailLinkAddress, setEmailLinkAddress] = useState("");
  const [emailLinkSending, setEmailLinkSending] = useState(false);

  useEffect(() => {
    if (!quoteId) return;
    loadQuote();
    loadNotes();
    loadPhotos();
  }, [quoteId]);

  async function loadQuote() {
    setLoading(true);
    const { data, error } = await supabase()
      .from("quotes")
      .select("*, accept_token, accepted_at, signed_at, customer_signature_data_url, visualization_color_id, visualization_image, roof_color, visualizer_image_url, account:account_id(id, name, email, billing_address_line1, billing_city, billing_state, billing_zip), assigned_to:assigned_to_id(id, name), department:department_id(id, name), quote_line_items(*)")
      .eq("id", quoteId!)
      .single();
    if (error && error.code !== "PGRST116") toast.error("Failed to load estimate: " + error.message);
    setQuote(data as QuoteDetail | null);
    setLoading(false);
  }

  async function downloadPdf() {
    if (!quote) return;
    const { downloadEstimatePdf } = await import("@/lib/estimate-pdf");
    const acct = quote.account;

    // Build property address string from billing fields
    const propertyAddress = [
      acct?.billing_address_line1,
      acct?.billing_city,
      acct?.billing_state,
      acct?.billing_zip,
    ]
      .filter(Boolean)
      .join(", ") || acct?.name || "Property Address";

    // Prefer stored folio; fall back to live lookup when not saved on the quote
    let folioNumber: string | undefined = quote.folio_number ?? undefined;
    if (!folioNumber && acct?.billing_address_line1) {
      try {
        const folioRes = await fetch("/api/folio-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: acct.billing_address_line1,
            city: acct.billing_city ?? undefined,
            zip: acct.billing_zip ?? undefined,
          }),
        });
        if (folioRes.ok) {
          const folioData = (await folioRes.json()) as { folio?: string | null };
          folioNumber = folioData.folio ?? undefined;
        }
      } catch (folioErr) {
        // non-blocking — PDF still generates without folio
        console.warn("[quotes/detail] folio lookup failed for PDF:", folioErr);
      }
    }

    // Fetch company settings for PDF header
    const { data: companySettings } = await supabase()
      .from("company_settings")
      .select("company_name, license_number, address, phone, email")
      .limit(1)
      .maybeSingle();
    const cs = companySettings as {
      company_name?: string | null;
      license_number?: string | null;
      address?: string | null;
      phone?: string | null;
      email?: string | null;
    } | null;

    // Convert line items to PdfSection[]
    const ROOF_SKU_CODES = ["METAL", "FLAT", "FLAT INSULATIONS", "ALUMINUM", "SHINGLE", "TILE"];
    const sections = (quote.quote_line_items ?? [])
      .filter((item) => ROOF_SKU_CODES.some((c) => (item.product_sku ?? "").toUpperCase().startsWith(c)))
      .map((item) => {
        const sku = (item.product_sku ?? "").toUpperCase();
        const isFlat = sku.startsWith("FLAT");
        const areaMatch = item.product_name.match(/\((\d+)\s*sf\)/i);
        const areaSqft = areaMatch ? parseInt(areaMatch[1]) : item.quantity;
        return {
          sectionType: (isFlat ? "FLAT" : "SLOPED") as "FLAT" | "SLOPED",
          productCode: sku.split(" ")[0],
          areaSqft,
          unitPrice: item.unit_price / Math.max(areaSqft, 1),
          lineTotal: item.line_total,
        };
      });

    if (sections.length === 0 && (quote.quote_line_items ?? []).length > 0) {
      sections.push({
        sectionType: "SLOPED",
        productCode: "METAL",
        areaSqft: 1,
        unitPrice: quote.subtotal ?? 0,
        lineTotal: quote.subtotal ?? 0,
      });
    }

    // Roof color — prefer new roof_color field, fall back to legacy visualization_color_id
    const { findEnglertColor } = await import("@/lib/visualizer-config");
    const roofColorName = quote.roof_color ?? undefined;
    const roofColorHex = roofColorName ? findEnglertColor(roofColorName)?.hex : undefined;

    // Fetch Gemini render as base64 JPEG for PDF embedding (prefer new over legacy)
    let visualizerImageDataUrl: string | undefined;
    if (quote.visualizer_image_url) {
      try {
        const renderRes = await fetch(quote.visualizer_image_url);
        const renderBlob = await renderRes.blob();
        visualizerImageDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(renderBlob);
        });
      } catch {
        // non-blocking — PDF still generates without render image
      }
    }
    // Legacy inline data URL (old canvas render)
    const legacyImageDataUrl = !visualizerImageDataUrl ? (quote.visualization_image ?? undefined) : undefined;
    // Legacy color name from metal-colors (only needed if no new roof_color)
    let legacyColorName: string | undefined;
    if (!roofColorName && quote.visualization_color_id) {
      try {
        const { findColor } = await import("@/lib/metal-colors");
        legacyColorName = findColor(quote.visualization_color_id)?.name;
      } catch {
        // ignore
      }
    }

    // Collect up to 6 BEFORE photos, fetched as base64 data URLs for PDF embedding
    const beforePhotoUrls: string[] = [];
    const beforeCandidates = photos.filter((p) => p.stage === "BEFORE").slice(0, 6);
    for (const ph of beforeCandidates) {
      try {
        const res = await fetch(ph.photo_url);
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        beforePhotoUrls.push(dataUrl);
      } catch {
        // skip photos that fail to load
      }
    }

    await downloadEstimatePdf({
      estimateNumber: quote.name,
      date: quote.created_at,
      customerName: acct?.name ?? "Customer",
      propertyAddress,
      folioNumber,
      subtotal: quote.subtotal ?? 0,
      taxAmount: quote.tax_amount ?? 0,
      taxExempt: quote.tax_exempt ?? false,
      sections,
      roofColor: roofColorName,
      roofColorHex,
      visualizerImageDataUrl: visualizerImageDataUrl,
      visualizationImageDataUrl: legacyImageDataUrl,
      visualizationColorName: roofColorName ?? legacyColorName,
      beforePhotos: beforePhotoUrls.length > 0 ? beforePhotoUrls : undefined,
      companyName: cs?.company_name ?? undefined,
      companyLicenseNumber: cs?.license_number ?? undefined,
      companyAddress: cs?.address ?? undefined,
      companyPhone: cs?.phone ?? undefined,
      companyEmail: cs?.email ?? undefined,
    });
  }

  async function getAuthToken(): Promise<string | null> {
    const { data } = await supabase().auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function handleEmailLink() {
    if (!quote) return;
    setEmailLinkSending(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/email/send-quote-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ quoteId: quote.id, recipientEmail: emailLinkAddress || undefined }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; recipient?: string };
      if (!res.ok || !data.ok) { toast.error(data.error ?? "Failed to send email"); return; }
      toast.success(`Sent to ${data.recipient}`);
      setEmailLinkModal(false);
      loadQuote();
    } catch {
      toast.error("Failed to send email");
    } finally {
      setEmailLinkSending(false);
    }
  }


  async function loadNotes() {
    const { data, error } = await supabase()
      .from("quote_notes")
      .select("*")
      .eq("quote_id", quoteId!)
      .order("created_at", { ascending: false });
    if (error) toast.error("Failed to load notes: " + error.message);
    setNotes((data as Array<{ id: string; content: string; author_name?: string; created_at: string }>) ?? []);
  }

  async function loadPhotos() {
    const { data, error } = await supabase()
      .from("project_photos")
      .select("*")
      .eq("quote_id", quoteId!)
      .order("uploaded_at", { ascending: true });
    if (error) toast.error("Failed to load photos: " + error.message);
    setPhotos((data as ProjectPhoto[]) ?? []);
  }


  async function addNote() {
    if (!newNote.trim()) return;
    await supabase().from("quote_notes").insert({
      quote_id: quoteId,
      author_id: user?.id,
      author_name: "You",
      content: newNote.trim(),
    });
    setNewNote("");
    loadNotes();
  }


  async function handleDelete() {
    if (!quote) return;
    if (quote.status === "ACCEPTED") {
      toast.error("Cannot delete an accepted estimate — it has already been signed and accepted by the customer.");
      setDeleteModal(false);
      return;
    }
    setDeleting(true);
    const { error } = await supabase().from("quotes").delete().eq("id", quote.id);
    if (error) {
      toast.error(error.message ?? "Delete failed");
      setDeleting(false);
      return;
    }
    window.location.href = "/quotes/";
  }

  async function handleClone() {
    if (!quote) return;
    setCloning(true);
    try {
      // Get next estimate number
      const { data: settings } = await supabase()
        .from("company_settings")
        .select("estimate_prefix")
        .limit(1)
        .maybeSingle();
      const prefix = (settings as { estimate_prefix?: string } | null)?.estimate_prefix ?? "EST-";

      // Get next number
      const { data: existing } = await supabase()
        .from("quotes")
        .select("name")
        .ilike("name", `${prefix}%`)
        .order("created_at", { ascending: false })
        .limit(1);
      let nextNum = 1;
      if (existing && existing.length > 0) {
        const last = (existing[0] as { name: string }).name;
        nextNum = (parseInt(last.replace(prefix, "")) || 0) + 1;
      }
      const newName = `${prefix}${String(nextNum).padStart(4, "0")}`;

      // Insert cloned quote
      const { data: newQuote, error: insertErr } = await supabase()
        .from("quotes")
        .insert({
          name: newName,
          status: "DRAFT",
          subtotal: quote.subtotal ?? 0,
          discount_type: quote.discount_type ?? null,
          discount_value: quote.discount_value ?? null,
          discount_amount: quote.discount_amount ?? null,
          tax_rate: quote.tax_rate ?? 0.07,
          tax_exempt: quote.tax_exempt ?? false,
          tax_amount: quote.tax_amount ?? null,
          total: quote.total ?? 0,
          financing_provider: quote.financing_provider ?? null,
          financing_term: quote.financing_term ?? null,
          financing_rate: quote.financing_rate ?? null,
          monthly_payment: quote.monthly_payment ?? null,
          valid_until: quote.valid_until ?? null,
          notes: quote.notes ?? null,
          account_id: (quote.account as { id: string } | null)?.id ?? null,
          department_id: (quote.department as { id: string } | null)?.id ?? null,
          assigned_to_id: (quote.assigned_to as { id: string } | null)?.id ?? null,
          visualization_color_id: quote.visualization_color_id ?? null,
          folio_number: quote.folio_number ?? null,
        })
        .select()
        .single();
      if (insertErr) throw new Error(insertErr.message);

      const newId = (newQuote as { id: string }).id;

      // Clone line items
      if (quote.quote_line_items && quote.quote_line_items.length > 0) {
        const { error: liErr } = await supabase()
          .from("quote_line_items")
          .insert(quote.quote_line_items.map((li, i) => ({
            quote_id: newId,
            product_id: li.product_id ?? null,
            product_name: li.product_name,
            product_sku: li.product_sku ?? null,
            quantity: li.quantity,
            unit_price: li.unit_price,
            unit_cost: li.unit_cost ?? null,
            line_total: li.line_total,
            sort_order: i,
          })));
        if (liErr) throw new Error(liErr.message);
      }

      toast.success("Estimate duplicated");
      window.location.href = `/quotes/detail/?id=${newId}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clone failed");
      setCloning(false);
    }
  }


  if (invalidId) {
    return (
      <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 px-6 py-8 text-center">
        <p className="text-amber-300 font-medium">Invalid estimate ID</p>
        <p className="text-sm text-zinc-400 mt-1">The link you followed doesn&apos;t point to a valid estimate.</p>
        <a href="/quotes/" className="text-brand text-sm hover:underline mt-3 inline-block">Back to Estimates</a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading…
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="text-center py-16">
        <p className="text-zinc-400">Estimate not found.</p>
        <a href="/quotes/" className="text-brand text-sm hover:underline mt-2 block">Back to Estimates</a>
      </div>
    );
  }

  const tabList: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "photos", label: `Photos${photos.length > 0 ? ` (${photos.length})` : ""}` },
    { key: "notes", label: "Notes" },
    { key: "visualize", label: (quote.visualizer_image_url || quote.visualization_image) ? "Visualize ✓" : "Visualize" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/quotes/" className="text-zinc-500 hover:text-zinc-300 text-sm">Estimates</a>
            <span className="text-zinc-700">/</span>
            <h1 className="text-2xl font-bold text-zinc-50">{quote.name}</h1>
            <Badge variant={statusVariant[quote.status] ?? "gray"}>{quote.status}</Badge>
          </div>
          <div className="mt-1 flex flex-col gap-0.5 text-xs text-zinc-500 sm:flex-row sm:items-center sm:gap-4 sm:text-sm">
            <span>Customer: <span className="text-zinc-300">{(quote.account as { name?: string } | null)?.name ?? "—"}</span></span>
            <span>Valid until: <span className="text-zinc-300">{formatDate(quote.valid_until)}</span></span>
            <span>Total: <span className="text-zinc-100 font-semibold">{formatCurrency(quote.total)}</span></span>
            {quote.tax_exempt && <Badge variant="gray">Tax Exempt</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Edit — opens full builder (hidden on ACCEPTED) */}
          {quote.status !== "ACCEPTED" && (
            <a
              href={`/quotes/builder/?id=${quote.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
              aria-label="Edit estimate in builder"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </a>
          )}
          {/* Duplicate */}
          <Button variant="secondary" loading={cloning} onClick={handleClone} aria-label="Duplicate estimate">
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Duplicate
          </Button>
          {/* PDF — opens preview modal with Download CTA inside */}
          <Button variant="secondary" onClick={() => setPdfPreviewOpen(true)} aria-label="Preview and download PDF">
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            PDF
          </Button>
          {/* Email — sends accept link to customer (DRAFT/SENT only) */}
          {(quote.status === "DRAFT" || quote.status === "SENT") && (
            <Button
              onClick={() => { setEmailLinkAddress(quote.account?.email ?? ""); setEmailLinkModal(true); }}
              aria-label="Email accept link to customer"
            >
              <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Email
            </Button>
          )}
          {/* Delete — DRAFT only, muted style */}
          {quote.status === "DRAFT" && (
            <button
              onClick={() => setDeleteModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 px-3 py-2 text-sm font-medium text-zinc-500 hover:border-red-800/60 hover:text-red-400 transition-colors"
              aria-label="Delete estimate"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Card>
        <div className="px-6 pt-4">
          <Tabs
            tabs={tabList}
            activeTab={activeTab}
            onChange={(k) => setActiveTab(k as TabKey)}
          />
        </div>

        {activeTab === "overview" && (
          <div className="p-6 space-y-6">
            {/* Line items */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Line Items</h3>
              <div className="rounded-xl border border-zinc-800 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className="border-b border-zinc-800 bg-zinc-900/60">
                    <tr className="text-xs uppercase tracking-wider text-zinc-500">
                      <th className="px-4 py-3 text-left">Item</th>
                      <th className="px-4 py-3 text-center w-16">Qty</th>
                      <th className="px-4 py-3 text-right w-28">Unit Price</th>
                      <th className="px-4 py-3 text-right w-28">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {(quote.quote_line_items ?? []).map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-zinc-100">{item.product_name}</p>
                          {item.product_sku && <p className="text-xs text-zinc-500">{item.product_sku}</p>}
                        </td>
                        <td className="px-4 py-3 text-center text-zinc-400">{item.quantity}</td>
                        <td className="px-4 py-3 text-right text-zinc-300">{formatCurrency(item.unit_price)}</td>
                        <td className="px-4 py-3 text-right font-medium text-zinc-100">{formatCurrency(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="ml-auto w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Subtotal</span>
                <span>{formatCurrency(quote.subtotal)}</span>
              </div>
              {(quote.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Discount</span>
                  <span className="text-green-400">−{formatCurrency(quote.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                {quote.tax_exempt ? (
                  <>
                    <span className="text-zinc-500">Tax (exempt)</span>
                    <span className="text-zinc-500">$0.00</span>
                  </>
                ) : (
                  <>
                    <span className="text-zinc-400">Tax ({((quote.tax_rate ?? 0) * 100).toFixed(1)}%)</span>
                    <span>{formatCurrency(quote.tax_amount)}</span>
                  </>
                )}
              </div>
              <div className="border-t border-zinc-800 pt-2 flex justify-between font-semibold">
                <span className="text-zinc-100">Total</span>
                <span className="text-xl font-bold text-zinc-50">{formatCurrency(quote.total)}</span>
              </div>
            </div>

            {/* Financing */}
            {quote.financing_provider && (
              <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
                <p className="text-sm font-semibold text-brand mb-1">Financing</p>
                <p className="text-sm text-zinc-300">{quote.financing_provider} · {quote.financing_term} months · {quote.financing_rate}% APR</p>
                <p className="text-sm font-bold text-brand mt-1">{formatCurrency(quote.monthly_payment)}/month</p>
              </div>
            )}

            {/* Electronic signature */}
            {quote.customer_signature_data_url && (
              <div className="rounded-xl border border-emerald-800/30 bg-emerald-950/10 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-semibold text-emerald-300">Signed Electronically</p>
                  {quote.signed_at && (
                    <span className="text-xs text-zinc-500">{new Date(quote.signed_at).toLocaleString()}</span>
                  )}
                </div>
                <div className="rounded-lg bg-zinc-900 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={quote.customer_signature_data_url}
                    alt="Customer signature"
                    className="mx-auto max-h-24 object-contain"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "photos" && (
          <div className="p-6 space-y-5">
            <PhotoUpload quoteId={quoteId!} onUploaded={loadPhotos} />
            <PhotoGallery
              photos={photos}
              onDelete={(id) => setPhotos((prev) => prev.filter((p) => p.id !== id))}
            />
          </div>
        )}

        {activeTab === "notes" && (
          <div className="p-6 space-y-4">
            <div className="flex gap-3">
              <textarea
                rows={2}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brand focus:ring-2 focus:ring-brand/30"
                placeholder="Add a note…"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <Button onClick={addNote} disabled={!newNote.trim()}>Add</Button>
            </div>
            {notes.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">No notes yet.</p>
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div key={note.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                    <p className="text-sm text-zinc-100">{note.content}</p>
                    <p className="text-xs text-zinc-500 mt-1">{note.author_name ?? "Unknown"} · {formatDate(note.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "visualize" && (
          <div className="p-6 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-1">Roof Visualization</h3>
              <p className="text-xs text-zinc-500">
                AI-generated render and selected roof color for this estimate.
                To regenerate or change the color, open the estimate in the builder.
              </p>
            </div>

            {/* Roof color swatch */}
            {quote.roof_color && (
              <div className="flex items-center gap-3">
                {(() => {
                  // Inline hex lookup to avoid async import in render
                  const COLOR_MAP: Record<string, string> = {
                    "Matte Black": "#1C1C1C",
                    "Charcoal Gray": "#3F3F3F",
                    "Mansard Brown": "#5C4033",
                    "Dark Bronze": "#3D2B1F",
                    "Dove Gray": "#8A8785",
                    "Slate Gray": "#6A7280",
                    "Bone White": "#E8E3D7",
                    "Terracotta": "#C87941",
                    "Classic White": "#F0EBE3",
                    "Patina Green": "#4A7C6B",
                    "Colonial Red": "#8B2020",
                    "Forest Green": "#2D5016",
                    "Royal Blue": "#1A3A6B",
                    "Burnished Slate": "#5A6472",
                    "Weathered Zinc": "#7A8490",
                    "Copper Patina": "#6B8E7A",
                    "Aged Bronze": "#5C4A2A",
                  };
                  const hex = COLOR_MAP[quote.roof_color!] ?? "#888888";
                  return (
                    <>
                      <div
                        className="h-8 w-8 rounded-lg border border-zinc-700 flex-shrink-0"
                        style={{ backgroundColor: hex }}
                      />
                      <div>
                        <p className="text-sm font-medium text-zinc-100">{quote.roof_color}</p>
                        <p className="text-xs text-zinc-500">Selected roof color</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Gemini AI render */}
            {quote.visualizer_image_url && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">AI-generated render:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={quote.visualizer_image_url}
                  alt="AI roof visualization"
                  className="rounded-xl border border-zinc-800 max-w-full"
                />
              </div>
            )}

            {/* Legacy canvas render (backward compat) */}
            {!quote.visualizer_image_url && quote.visualization_image && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500">Saved visualization:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={quote.visualization_image}
                  alt="Saved visualization"
                  className="rounded-xl border border-zinc-800 max-w-full"
                />
              </div>
            )}

            {!quote.visualizer_image_url && !quote.visualization_image && !quote.roof_color && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
                <svg className="w-10 h-10 text-zinc-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-zinc-500">No visualization yet.</p>
                {quote.status !== "ACCEPTED" && (
                  <a href={`/quotes/builder/?id=${quote.id}`} className="text-xs text-brand hover:underline mt-2 inline-block">
                    Open in builder to generate one
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Delete confirmation modal */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Delete estimate?" maxWidth="sm">
        <div className="space-y-4">
          <p className="text-sm text-zinc-300">
            Delete <span className="font-semibold text-zinc-100">{quote.name}</span> permanently? This cannot be undone.
            All photos, line items, and notes for this estimate will also be deleted.
          </p>
          {quote.status === "ACCEPTED" && (
            <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-300">
              This estimate has been accepted — it cannot be deleted.
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDeleteModal(false)}>Cancel</Button>
            <Button variant="danger" loading={deleting} onClick={handleDelete} disabled={quote.status === "ACCEPTED"}>
              Delete permanently
            </Button>
          </div>
        </div>
      </Modal>

      {/* Email Link modal */}
      <Modal open={emailLinkModal} onClose={() => setEmailLinkModal(false)} title="Email Accept Link to Customer" maxWidth="max-w-sm">
        {quote && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">Send the accept & sign link to the customer. They&apos;ll receive an email with a button to review and sign the estimate.</p>
            <div>
              <label htmlFor="email-link-addr" className="block text-xs font-medium text-zinc-400 mb-1.5">Recipient email</label>
              <input
                id="email-link-addr"
                type="email"
                value={emailLinkAddress}
                onChange={(e) => setEmailLinkAddress(e.target.value)}
                placeholder="customer@example.com"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand/50 focus:outline-none focus:ring-1 focus:ring-brand/30"
              />
              {!quote.account?.email && (
                <p className="mt-1 text-xs text-amber-400">No email on customer record — enter one above or <a href={`/accounts/detail/?id=${(quote.account as { id?: string } | null)?.id}`} className="underline">add to account</a>.</p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setEmailLinkModal(false)}>Cancel</Button>
              <Button loading={emailLinkSending} onClick={handleEmailLink} disabled={!emailLinkAddress.trim()}>Send Email</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* PDF Preview modal — includes Download CTA */}
      <Modal open={pdfPreviewOpen} onClose={() => setPdfPreviewOpen(false)} title="PDF Preview" maxWidth="max-w-4xl">
        {quote && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-xs text-zinc-400 flex-1 min-w-0 truncate">
                Customer view: <code className="text-zinc-300">/accept/{quote.accept_token ?? "<token>"}</code>
              </div>
              <Button onClick={downloadPdf} aria-label="Download PDF">
                <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </Button>
            </div>
            <div className="relative rounded-xl overflow-hidden border border-zinc-800" style={{ height: "70vh" }}>
              <iframe
                src={`/api/quotes/${quote.id}/pdf?v=${encodeURIComponent(quote.created_at)}`}
                className="h-full w-full"
                title="PDF preview"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function QuoteDetailPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading…
      </div>
    }>
      <QuoteDetailContent />
    </Suspense>
  );
}
