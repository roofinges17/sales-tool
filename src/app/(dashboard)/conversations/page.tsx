"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

type Channel = "sms" | "email" | "voice";

interface Message {
  id: string;
  direction: "outbound" | "inbound";
  body: string | null;
  subject: string | null;
  status: string;
  sent_at: string;
  sent_by_id: string | null;
}

interface ConversationThread {
  id: string;
  channel: Channel;
  last_message_at: string | null;
  messages: Message[];
}

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  preferred_language: "en" | "es";
}

const CHANNEL_LABELS: Record<Channel, string> = { sms: "SMS", email: "Email", voice: "Voice" };
const CHANNEL_ICONS: Record<Channel, string> = { sms: "💬", email: "✉️", voice: "📞" };

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return isToday
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatPhone(p: string | null | undefined) {
  if (!p) return "—";
  const d = p.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

export default function ConversationsPage() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactRow | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel>("sms");
  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [search, setSearch] = useState("");
  const [sendBody, setSendBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load contacts that have at least one conversation
  useEffect(() => {
    async function load() {
      setLoadingContacts(true);
      const sb = supabase();
      const { data } = await sb
        .from("conversations")
        .select("contact_id")
        .order("last_message_at", { ascending: false })
        .limit(200);

      const contactIds = [...new Set((data ?? []).map((r: { contact_id: string }) => r.contact_id))];

      if (contactIds.length === 0) {
        setContacts([]);
        setLoadingContacts(false);
        return;
      }

      const { data: contactRows } = await sb
        .from("contacts")
        .select("id, first_name, last_name, email, phone, preferred_language")
        .in("id", contactIds);

      setContacts((contactRows ?? []) as ContactRow[]);
      setLoadingContacts(false);
    }
    load();
  }, []);

  // Load threads when contact changes
  useEffect(() => {
    if (!selectedContact) return;
    async function loadThreads() {
      setLoadingThread(true);
      const { data: { session } } = await supabase().auth.getSession();
      const token = session?.access_token;
      if (!token) { setLoadingThread(false); return; }

      const res = await fetch(`/api/comms/conversations?contact_id=${selectedContact!.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json() as { conversations: ConversationThread[] };
        setThreads(json.conversations ?? []);
      }
      setLoadingThread(false);
    }
    loadThreads();
  }, [selectedContact]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threads, activeChannel]);

  const filteredContacts = contacts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.first_name?.toLowerCase().includes(q) ||
      c.last_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    );
  });

  const activeThread = threads.find((t) => t.channel === activeChannel);
  const messages = [...(activeThread?.messages ?? [])].reverse(); // oldest first for display

  async function handleSend() {
    if (!selectedContact || !sendBody.trim() || sending) return;
    setSending(true);
    setSendError(null);

    const { data: { session } } = await supabase().auth.getSession();
    const token = session?.access_token;
    if (!token) { setSending(false); return; }

    const endpoint = activeChannel === "email" ? "/api/comms/send-email" : "/api/comms/send-sms";
    const body =
      activeChannel === "email"
        ? { contact_id: selectedContact.id, subject_override: "(Direct message)", html_override: `<p>${sendBody}</p>` }
        : { contact_id: selectedContact.id, body: sendBody };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setSendBody("");
      // Reload threads
      const tRes = await fetch(`/api/comms/conversations?contact_id=${selectedContact.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (tRes.ok) {
        const json = await tRes.json() as { conversations: ConversationThread[] };
        setThreads(json.conversations ?? []);
      }
    } else {
      const err = await res.json() as { error?: string };
      setSendError(err.error ?? "Send failed");
    }
    setSending(false);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Contact sidebar */}
      <div className="w-72 flex-shrink-0 border-r border-border-default bg-surface-subtle flex flex-col">
        <div className="p-3 border-b border-border-default">
          <input
            type="text"
            placeholder="Search contacts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-surface-default px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingContacts ? (
            <div className="p-4 text-text-tertiary text-sm">Loading…</div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-4 text-text-tertiary text-sm">No conversations yet</div>
          ) : (
            filteredContacts.map((c) => (
              <button
                key={c.id}
                onClick={() => { setSelectedContact(c); setActiveChannel("sms"); }}
                className={`w-full text-left px-3 py-2.5 border-b border-border-default hover:bg-surface-default transition-colors ${
                  selectedContact?.id === c.id ? "bg-brand/8 border-l-2 border-l-brand" : ""
                }`}
              >
                <div className="font-medium text-sm text-text-primary">
                  {[c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown"}
                </div>
                <div className="text-xs text-text-tertiary mt-0.5">{formatPhone(c.phone)}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Thread panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedContact ? (
          <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
            Select a contact to view conversation
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-border-default bg-surface-default flex items-center gap-3">
              <div>
                <div className="font-semibold text-text-primary">
                  {[selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(" ") || "Unknown"}
                </div>
                <div className="text-xs text-text-tertiary">{formatPhone(selectedContact.phone)} · {selectedContact.email ?? "—"}</div>
              </div>
              <span className={`ml-auto inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                selectedContact.preferred_language === "es" ? "bg-brand/15 text-brand" : "bg-accent/15 text-accent"
              }`}>
                {selectedContact.preferred_language}
              </span>
            </div>

            {/* Channel tabs */}
            <div className="flex border-b border-border-default bg-surface-subtle">
              {(["sms", "email", "voice"] as Channel[]).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setActiveChannel(ch)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeChannel === ch
                      ? "border-b-2 border-brand text-brand"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {CHANNEL_ICONS[ch]} {CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingThread ? (
                <div className="text-text-tertiary text-sm">Loading…</div>
              ) : messages.length === 0 ? (
                <div className="text-text-tertiary text-sm">No {CHANNEL_LABELS[activeChannel]} messages yet</div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${
                        m.direction === "outbound"
                          ? "bg-brand text-white"
                          : "bg-surface-subtle text-text-primary border border-border-default"
                      }`}
                    >
                      {m.subject && (
                        <div className="font-semibold text-xs mb-1 opacity-80">{m.subject}</div>
                      )}
                      <div>{m.body ?? "(empty)"}</div>
                      <div className={`text-[10px] mt-1 ${m.direction === "outbound" ? "text-white/60" : "text-text-tertiary"}`}>
                        {formatTime(m.sent_at)} · {m.status}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Send box (SMS + email only; voice is read-only) */}
            {activeChannel !== "voice" && (
              <div className="border-t border-border-default p-3 bg-surface-default">
                {sendError && (
                  <div className="text-xs text-red-500 mb-2">{sendError}</div>
                )}
                <div className="flex gap-2">
                  <textarea
                    value={sendBody}
                    onChange={(e) => setSendBody(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder={activeChannel === "sms" ? "Type a message… (Enter to send)" : "Type an email… (Enter to send)"}
                    rows={2}
                    className="flex-1 rounded-lg border border-border-default bg-surface-subtle px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !sendBody.trim()}
                    className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-40 hover:bg-brand/90 transition-colors self-end"
                  >
                    {sending ? "…" : "Send"}
                  </button>
                </div>
                {activeChannel === "sms" && (
                  <div className="text-[10px] text-text-tertiary mt-1">
                    SMS delivery requires Twilio configuration (pending)
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
