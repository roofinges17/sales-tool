// GHL sync helpers — all calls route through /api/ghl-proxy (PIT token stays server-side).
// All functions are fire-and-forget: never throw, never block the caller.

async function ghlPost(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("/api/ghl-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, method: "POST", body }),
  });
  return res.json();
}

async function ghlPut(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("/api/ghl-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, method: "PUT", body }),
  });
  return res.json();
}

async function ghlGet(endpoint: string, queryParams: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch("/api/ghl-proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, method: "GET", queryParams }),
  });
  return res.json();
}

// ── Contact sync ──────────────────────────────────────────────────────────────

export interface GhlContactInput {
  name: string;
  email?: string | null;
  phone?: string | null;
}

interface GhlContactSearchResult {
  contacts?: Array<{ id: string }>;
}

interface GhlContactCreateResult {
  contact?: { id: string };
}

export async function syncGhlContact(input: GhlContactInput): Promise<string | null> {
  try {
    // Dedup by email first, then phone
    if (input.email) {
      const search = (await ghlGet("contacts/search/duplicate", {
        locationId: "DfkEocSccdPsDcgqrJug",
        email: input.email,
      })) as GhlContactSearchResult;
      const existing = search?.contacts?.[0];
      if (existing?.id) return existing.id;
    }

    const [firstName, ...rest] = (input.name ?? "").split(" ");
    const result = (await ghlPost("contacts/", {
      locationId: "DfkEocSccdPsDcgqrJug",
      firstName: firstName ?? input.name,
      lastName: rest.join(" ") || undefined,
      email: input.email ?? undefined,
      phone: input.phone ?? undefined,
    })) as GhlContactCreateResult;

    return result?.contact?.id ?? null;
  } catch (err) {
    console.warn("[GHL] syncGhlContact failed:", err);
    return null;
  }
}

// ── Opportunity sync ──────────────────────────────────────────────────────────

export interface GhlOpportunityInput {
  contactId: string;
  title: string;
  pipelineId: string;
  stageId: string;
  monetaryValue?: number;
}

interface GhlOpportunityResult {
  opportunity?: { id: string };
  id?: string;
}

export async function createGhlOpportunity(input: GhlOpportunityInput): Promise<string | null> {
  try {
    const result = (await ghlPost("opportunities/", {
      locationId: "DfkEocSccdPsDcgqrJug",
      contact_id: input.contactId,
      name: input.title,
      pipelineId: input.pipelineId,
      pipelineStageId: input.stageId,
      monetaryValue: input.monetaryValue,
      status: "open",
    })) as GhlOpportunityResult;

    return result?.opportunity?.id ?? result?.id ?? null;
  } catch (err) {
    console.warn("[GHL] createGhlOpportunity failed:", err);
    return null;
  }
}

export async function moveGhlOpportunityStage(opportunityId: string, stageId: string): Promise<void> {
  try {
    await ghlPut(`opportunities/${opportunityId}`, { pipelineStageId: stageId });
  } catch (err) {
    console.warn("[GHL] moveGhlOpportunityStage failed:", err);
  }
}

// ── Pipeline loader (for settings UI) ────────────────────────────────────────

export interface GhlStage {
  id: string;
  name: string;
}

export interface GhlPipeline {
  id: string;
  name: string;
  stages: GhlStage[];
}

interface GhlPipelinesResult {
  pipelines?: GhlPipeline[];
}

export async function fetchGhlPipelines(): Promise<{ pipelines: GhlPipeline[] | null; error: string | null }> {
  try {
    const result = (await ghlGet("opportunities/pipelines", {
      locationId: "DfkEocSccdPsDcgqrJug",
    })) as GhlPipelinesResult & { statusCode?: number; message?: string };

    if (result?.statusCode === 401 || result?.message?.includes("not authorized")) {
      return {
        pipelines: null,
        error: "GHL token missing required scopes. In GoHighLevel → Settings → Integrations → Private Integrations, update your token to include: contacts.write, contacts.readonly, opportunities.write, opportunities.readonly.",
      };
    }

    return { pipelines: result?.pipelines ?? [], error: null };
  } catch (err) {
    return { pipelines: null, error: String(err) };
  }
}
