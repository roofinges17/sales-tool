// POST /api/vision/perimeter-detect
// Estimates linear footage of soffit, fascia, and gutters from exterior house photos.
// Uses GPT-4o vision. Falls back to mock when OPENAI_API_KEY is not set.
//
// Input:  { photos: Array<{ base64: string; mediaType: string }> }
// Output: { items: PerimeterItem[], totalPerimeterFt: number, houseStories: number, model: string, mock?: true }

import { guard } from "../_guard";

export interface Env {
  OPENAI_API_KEY?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export interface PerimeterItem {
  item_type: "soffit" | "fascia" | "gutters" | "metal_fascia";
  estimated_lf: number;         // linear feet
  confidence: "low" | "medium" | "high";
  notes: string;
  suggested_sku: string;        // product code for catalog matching
}

interface DetectResponse {
  items: PerimeterItem[];
  totalPerimeterFt: number;
  houseStories: number;
  model: string;
  mock?: boolean;
}

const SYSTEM_PROMPT = `You are a professional roofing contractor estimating linear footage for a residential property from photos.

Analyze the exterior photo(s) to estimate:
1. Soffit (horizontal surface under eaves)
2. Fascia (vertical trim board at eave/rake)
3. Gutters (if visible or recommended)
4. Metal fascia (if existing or needed)

Use architectural knowledge: a typical single-story house perimeter is 120–160 linear feet; a two-story adds fascia/soffit on both levels.

Respond ONLY with valid JSON, no prose:
{
  "items": [
    {
      "item_type": "soffit" | "fascia" | "gutters" | "metal_fascia",
      "estimated_lf": number,
      "confidence": "low" | "medium" | "high",
      "notes": string,
      "suggested_sku": "SOFFIT & FASCIA" | "METAL FASCIA" | "GUTTERS"
    }
  ],
  "totalPerimeterFt": number,
  "houseStories": number
}

Only include item types that are visible, damaged, or clearly needed. If gutters are not visible, omit them unless there are clear signs of water damage from absent gutters.`;

const USER_PROMPT = `Estimate the linear footage of soffit, fascia, and gutters for this property. Base your estimates on the visible roofline length, the number of stories, and any damaged or missing components you can see.`;

// ── Mock response ─────────────────────────────────────────────────────────────

const MOCK_RESPONSE: DetectResponse = {
  mock: true,
  model: "gpt-4o (mock)",
  houseStories: 1,
  totalPerimeterFt: 148,
  items: [
    {
      item_type: "soffit",
      estimated_lf: 148,
      confidence: "medium",
      notes: "Single-story home, full perimeter soffit visible on south and west elevations. Estimated based on visible roofline.",
      suggested_sku: "SOFFIT & FASCIA",
    },
    {
      item_type: "fascia",
      estimated_lf: 148,
      confidence: "medium",
      notes: "Fascia boards present along all visible eave lines. Some weathering on western face.",
      suggested_sku: "METAL FASCIA",
    },
    {
      item_type: "gutters",
      estimated_lf: 80,
      confidence: "low",
      notes: "Gutters visible on front and east elevations only. Rear not visible in photo.",
      suggested_sku: "GUTTERS",
    },
  ],
};

// ── Main handler ──────────────────────────────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  const { error: guardErr } = await guard(ctx.request, ctx.env, {
    maxBodyBytes: 0,
    ratePrefix: "perimeter-detect",
    rateLimit: 0,
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
    return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: corsHeaders });
  }

  const imageContent = photos.slice(0, 4).map((photo) => ({
    type: "image_url",
    image_url: {
      url: `data:${photo.mediaType};base64,${photo.base64}`,
      detail: "high",
    },
  }));

  const openaiBody = {
    model: "gpt-4o",
    max_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [...imageContent, { type: "text", text: USER_PROMPT }],
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
      console.error("[perimeter-detect] OpenAI error:", openaiRes.status, errText);
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
    const parsed = JSON.parse(content) as {
      items?: PerimeterItem[];
      totalPerimeterFt?: number;
      houseStories?: number;
    };

    const result: DetectResponse = {
      items: parsed.items ?? [],
      totalPerimeterFt: parsed.totalPerimeterFt ?? 0,
      houseStories: parsed.houseStories ?? 1,
      model: completion.model ?? "gpt-4o",
    };

    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("[perimeter-detect] fetch error:", err);
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
