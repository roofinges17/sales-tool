// POST /api/vision/damage-detect
// Analyzes roof photos for damage using GPT-4o vision.
// Falls back to a realistic mock when OPENAI_API_KEY is not configured.
//
// Input:  { photos: Array<{ base64: string; mediaType: "image/jpeg"|"image/png" }> }
// Output: { items: DamageItem[], model: string, mock?: true }

import { guard } from "../_guard";

export interface Env {
  OPENAI_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  FOLIO_CACHE?: KVNamespace;
}

export interface DamageItem {
  damage_type: string;        // e.g. "Missing shingles", "Flashing damage"
  severity: "minor" | "moderate" | "severe";
  location: string;           // e.g. "Northeast slope", "Ridge line", "Valley"
  recommended_action: string; // e.g. "Full slope replacement"
  estimated_quantity: number;
  unit: string;               // e.g. "sq ft", "ln ft", "each"
  suggested_sku: string | null; // best-guess product SKU to map to catalog
}

interface AnalysisResponse {
  items: DamageItem[];
  model: string;
  mock?: boolean;
}

const SYSTEM_PROMPT = `You are a certified professional roof inspector. Analyze the provided roof photo(s) and return a structured JSON damage assessment.

You MUST respond with ONLY a valid JSON object matching this schema — no prose, no markdown fences:
{
  "items": [
    {
      "damage_type": string,
      "severity": "minor" | "moderate" | "severe",
      "location": string,
      "recommended_action": string,
      "estimated_quantity": number,
      "unit": string,
      "suggested_sku": string | null
    }
  ]
}

Rules for suggested_sku: Map each damage item to one of these product codes when applicable:
- METAL — metal roof replacement
- SHINGLE — shingle roof replacement
- TILE — tile roof replacement
- FLAT — flat roof replacement
- FLAT INSULATIONS — flat roof with insulation
- SOFFIT & FASCIA — soffit or fascia damage
- METAL FASCIA — metal fascia repair
- GUTTERS — gutter damage
- INSULATION — insulation damage
- null — if no catalog item matches

Return an empty items array if no damage is visible. Be conservative and precise.`;

const USER_PROMPT = `Analyze the roof in the image(s) above. Identify every distinct damage type, its severity, approximate location on the roof, and an estimated quantity. Use realistic square footage estimates from what is visible. If multiple slopes or areas are visible, describe them separately.`;

// ── Mock response for when OPENAI_API_KEY is not configured ──────────────────

const MOCK_RESPONSE: AnalysisResponse = {
  mock: true,
  model: "gpt-4o (mock)",
  items: [
    {
      damage_type: "Missing and lifted shingles",
      severity: "moderate",
      location: "South-facing slope, upper third",
      recommended_action: "Full slope shingle replacement",
      estimated_quantity: 800,
      unit: "sq ft",
      suggested_sku: "SHINGLE",
    },
    {
      damage_type: "Deteriorated flashing",
      severity: "severe",
      location: "Chimney base and roof penetrations",
      recommended_action: "Full flashing replacement",
      estimated_quantity: 24,
      unit: "ln ft",
      suggested_sku: "METAL FASCIA",
    },
    {
      damage_type: "Damaged soffit panels",
      severity: "minor",
      location: "East eave line",
      recommended_action: "Soffit panel replacement",
      estimated_quantity: 40,
      unit: "ln ft",
      suggested_sku: "SOFFIT & FASCIA",
    },
    {
      damage_type: "Clogged and bent gutters",
      severity: "minor",
      location: "Full perimeter",
      recommended_action: "Gutter replacement",
      estimated_quantity: 120,
      unit: "ln ft",
      suggested_sku: "GUTTERS",
    },
  ],
};

// ── Main handler ─────────────────────────────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const { error: guardErr } = await guard(ctx.request, ctx.env, {
    maxBodyBytes: 8 * 1024 * 1024, // 8 MB — up to 4 photos
    ratePrefix: "vision",
    rateLimit: 20,
  });
  if (guardErr) return guardErr;

  let body: { photos?: Array<{ base64: string; mediaType: string }> };
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  const photos = body.photos ?? [];
  if (photos.length === 0) {
    return new Response(JSON.stringify({ error: "At least one photo is required" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const apiKey = ctx.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Return mock response for development / unconfigured environments
    return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: corsHeaders });
  }

  // Build vision message content — interleave images + final text prompt
  const imageContent = photos.slice(0, 4).map((photo) => ({
    type: "image_url",
    image_url: {
      url: `data:${photo.mediaType};base64,${photo.base64}`,
      detail: "high",
    },
  }));

  const openaiBody = {
    model: "gpt-4o",
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          ...imageContent,
          { type: "text", text: USER_PROMPT },
        ],
      },
    ],
  };

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openaiBody),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("[vision-damage] OpenAI error:", openaiRes.status, errText);
      return new Response(
        JSON.stringify({ error: `OpenAI API error ${openaiRes.status}` }),
        { status: 502, headers: corsHeaders },
      );
    }

    const completion = (await openaiRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };

    const content = completion?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { items?: DamageItem[] };

    const result: AnalysisResponse = {
      items: parsed.items ?? [],
      model: completion.model ?? "gpt-4o",
    };

    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("[vision-damage] fetch error:", err);
    return new Response(JSON.stringify({ error: "Failed to analyze image" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};
