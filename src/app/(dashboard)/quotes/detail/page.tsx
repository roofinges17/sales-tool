"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";

interface QuoteLineItem {
  id: string;
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
  account?: { id: string; name: string; email?: string | null } | null;
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

type TabKey = "overview" | "notes";

async function getNextContractNumber(prefix: string): Promise<string> {
  const { data } = await supabase()
    .from("sales")
    .select("contract_number")
    .ilike("contract_number", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(1);

  let nextNum = 1;
  if (data && data.length > 0) {
    const last = (data[0] as { contract_number?: string | null }).contract_number ?? "";
    const numPart = parseInt(last.replace(prefix, "")) || 0;
    nextNum = numPart + 1;
  }
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

function QuoteDetailContent() {
  const searchParams = useSearchParams();
  const quoteId = searchParams.get("id");
  const { user } = useAuth();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [converting, setConverting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [notes, setNotes] = useState<Array<{ id: string; content: string; author_name?: string; created_at: string }>>([]);
  const [copied, setCopied] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);

  useEffect(() => {
    if (!quoteId) return;
    loadQuote();
    loadNotes();
  }, [quoteId]);

  async function loadQuote() {
    setLoading(true);
    const { data } = await supabase()
      .from("quotes")
      .select("*, accept_token, accepted_at, account:account_id(id, name, email), assigned_to:assigned_to_id(id, name), department:department_id(id, name), quote_line_items(*)")
      .eq("id", quoteId!)
      .single();
    setQuote(data as QuoteDetail | null);
    setLoading(false);
  }

  async function downloadPdf() {
    if (!quote) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF("p", "mm", "a4");
    const margin = 20;
    let y = 20;

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("ESTIMATE", margin, y);
    y += 10;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Roofing Experts", margin, y); y += 5;
    doc.text("roofingex.com · info@roofingex.com", margin, y); y += 12;

    doc.setFontSize(9);
    doc.text(`Estimate: ${quote.name}`, margin, y);
    doc.text(`Date: ${formatDate(quote.created_at)}`, margin + 70, y);
    doc.text(`Valid: ${formatDate(quote.valid_until)}`, margin + 140, y);
    y += 12;

    const acct = quote.account as { name?: string; email?: string | null } | null;
    doc.setFont("helvetica", "bold");
    doc.text("Customer", margin, y); y += 5;
    doc.setFont("helvetica", "normal");
    doc.text(acct?.name ?? "—", margin, y); y += 5;
    if (acct?.email) { doc.text(acct.email, margin, y); y += 5; }
    y += 6;

    // Line items
    doc.setFont("helvetica", "bold");
    doc.text("Scope of Work", margin, y); y += 6;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Item", margin, y);
    doc.text("Qty", 130, y, { align: "right" });
    doc.text("Unit", 155, y, { align: "right" });
    doc.text("Total", 190, y, { align: "right" });
    y += 4;
    doc.setDrawColor(80, 80, 80);
    doc.line(margin, y, 190, y); y += 5;

    for (const item of quote.quote_line_items ?? []) {
      doc.text(item.product_name, margin, y);
      doc.text(String(item.quantity), 130, y, { align: "right" });
      doc.text(formatCurrency(item.unit_price), 155, y, { align: "right" });
      doc.text(formatCurrency(item.line_total), 190, y, { align: "right" });
      y += 6;
    }

    y += 4;
    doc.line(margin, y, 190, y); y += 6;
    const rows: [string, string][] = [
      ["Subtotal", formatCurrency(quote.subtotal)],
    ];
    if ((quote.discount_amount ?? 0) > 0) rows.push(["Discount", `−${formatCurrency(quote.discount_amount)}`]);
    if ((quote.tax_amount ?? 0) > 0) rows.push([`Tax (${((quote.tax_rate ?? 0) * 100).toFixed(1)}%)`, formatCurrency(quote.tax_amount)]);
    for (const [label, val] of rows) {
      doc.text(label, margin, y);
      doc.text(val, 190, y, { align: "right" });
      y += 5;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Total", margin, y);
    doc.setTextColor(249, 115, 22);
    doc.text(formatCurrency(quote.total), 190, y, { align: "right" });
    doc.setTextColor(0, 0, 0);

    doc.save(`${quote.name}.pdf`);
  }

  async function getOrCreateAcceptLink(): Promise<string> {
    if (!quote) return "";
    let token = quote.accept_token;
    if (!token) {
      setGeneratingLink(true);
      token = crypto.randomUUID();
      await supabase().from("quotes").update({ accept_token: token }).eq("id", quote.id);
      setQuote((q) => q ? { ...q, accept_token: token! } : q);
      setGeneratingLink(false);
    }
    const base = window.location.origin;
    return `${base}/accept/?token=${token}`;
  }

  async function copyAcceptLink() {
    const link = await getOrCreateAcceptLink();
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function loadNotes() {
    const { data } = await supabase()
      .from("quote_notes")
      .select("*")
      .eq("quote_id", quoteId!)
      .order("created_at", { ascending: false });
    setNotes((data as Array<{ id: string; content: string; author_name?: string; created_at: string }>) ?? []);
  }

  async function updateStatus(status: string) {
    setUpdating(true);
    await supabase()
      .from("quotes")
      .update({ status, ...(status === "SENT" ? { sent_at: new Date().toISOString() } : {}), ...(status === "ACCEPTED" ? { accepted_at: new Date().toISOString() } : {}) })
      .eq("id", quoteId!);
    await loadQuote();
    setUpdating(false);
  }

  async function convertToContract() {
    if (!quote) return;
    setConverting(true);

    try {
      const { data: settings } = await supabase()
        .from("company_settings")
        .select("contract_prefix")
        .limit(1)
        .maybeSingle();
      const prefix = (settings as { contract_prefix?: string } | null)?.contract_prefix ?? "RE-";
      const contractNumber = await getNextContractNumber(prefix);

      // Calculate commission values
      const lineItems = quote.quote_line_items ?? [];
      const sellerMarkup = lineItems
        .reduce((sum, item) => sum + item.unit_price * item.quantity - (item.unit_cost ?? 0) * item.quantity, 0);
      const baseProfit = lineItems
        .reduce((sum, item) => sum + (item.unit_cost ?? 0) * item.quantity, 0);

      // Insert sale
      const { data: sale, error: saleErr } = await supabase()
        .from("sales")
        .insert({
          name: contractNumber,
          contract_number: contractNumber,
          status: "PENDING",
          contract_value: quote.total ?? 0,
          subtotal: quote.subtotal,
          discount_type: quote.discount_type,
          discount_value: quote.discount_value,
          discount_total: quote.discount_amount,
          tax_rate: quote.tax_rate,
          tax_amount: quote.tax_amount,
          financing_provider: quote.financing_provider,
          financing_term: quote.financing_term,
          financing_rate: quote.financing_rate,
          monthly_payment: quote.monthly_payment,
          contract_date: new Date().toISOString().split("T")[0],
          quote_id: quoteId,
          account_id: (quote.account as { id: string } | null)?.id,
          primary_seller_id: (quote.assigned_to as { id: string } | null)?.id ?? user?.id,
          department_id: (quote.department as { id: string } | null)?.id,
          cost_of_goods: baseProfit,
          gross_profit: (quote.total ?? 0) - baseProfit,
        })
        .select()
        .single();
      if (saleErr) throw new Error(saleErr.message);

      const saleId = (sale as { id: string }).id;

      // Insert sale line items
      if (lineItems.length > 0) {
        await supabase().from("sale_line_items").insert(
          lineItems.map((item, i) => ({
            sale_id: saleId,
            product_id: null,
            product_name: item.product_name,
            product_sku: item.product_sku ?? null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            unit_cost: item.unit_cost ?? null,
            line_total: item.line_total,
            sort_order: i,
          }))
        );
      }

      // Insert commission entries
      const sellerId = (quote.assigned_to as { id: string } | null)?.id ?? user?.id;
      if (sellerId) {
        await supabase().from("commission_entries").insert([
          {
            sale_id: saleId,
            recipient_id: sellerId,
            amount: sellerMarkup,
            type: "UPFRONT",
            status: "PENDING",
            role: "PRIMARY_SELLER",
            created_by_id: user?.id,
          },
          {
            sale_id: saleId,
            recipient_id: sellerId,
            amount: baseProfit * 0.18,
            type: "UPFRONT",
            status: "PENDING",
            role: "MANAGER",
            created_by_id: user?.id,
          },
        ]);
      }

      // Update quote status
      await supabase()
        .from("quotes")
        .update({ status: "ACCEPTED", accepted_at: new Date().toISOString() })
        .eq("id", quoteId!);

      window.location.href = `/sales/detail/?id=${saleId}`;
    } catch (err) {
      console.error(err);
      setConverting(false);
    }
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
    { key: "notes", label: "Notes" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <a href="/quotes/" className="text-zinc-500 hover:text-zinc-300 text-sm">Estimates</a>
            <span className="text-zinc-700">/</span>
            <h1 className="text-2xl font-bold text-zinc-50">{quote.name}</h1>
            <Badge variant={statusVariant[quote.status] ?? "gray"}>{quote.status}</Badge>
          </div>
          <div className="mt-1 flex items-center gap-4 text-sm text-zinc-500">
            <span>Customer: <span className="text-zinc-300">{(quote.account as { name?: string } | null)?.name ?? "—"}</span></span>
            <span>Valid until: <span className="text-zinc-300">{formatDate(quote.valid_until)}</span></span>
            <span>Total: <span className="text-zinc-100 font-semibold">{formatCurrency(quote.total)}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* PDF download */}
          <Button variant="secondary" onClick={downloadPdf} title="Download PDF">
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            PDF
          </Button>
          {/* Accept link */}
          {(quote.status === "SENT" || quote.status === "DRAFT") && (
            <Button variant="secondary" loading={generatingLink} onClick={copyAcceptLink}>
              <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              {copied ? "Copied!" : "Copy Accept Link"}
            </Button>
          )}
          {quote.status === "DRAFT" && (
            <Button variant="secondary" loading={updating} onClick={() => updateStatus("SENT")}>
              Mark Sent
            </Button>
          )}
          {(quote.status === "SENT" || quote.status === "DRAFT") && (
            <Button variant="secondary" loading={updating} onClick={() => updateStatus("ACCEPTED")}>
              Mark Accepted
            </Button>
          )}
          {quote.status !== "ACCEPTED" && (
            <Button
              loading={converting}
              onClick={convertToContract}
            >
              Convert to Contract
            </Button>
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
              <div className="rounded-xl border border-zinc-800 overflow-hidden">
                <table className="w-full text-sm">
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
                <span className="text-zinc-400">Tax ({((quote.tax_rate ?? 0) * 100).toFixed(1)}%)</span>
                <span>{formatCurrency(quote.tax_amount)}</span>
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
      </Card>
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
