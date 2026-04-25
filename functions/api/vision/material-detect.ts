// POST /api/vision/material-detect
// Analyzes exterior house photos for soffit, fascia, gutter condition, color, and linear footage.
// Uses Gemini Flash Vision. Falls back to mock when GEMINI_API_KEY is not set.
//
// Input:  { photos: Array<{ base64: string; mediaType: string }>, material_type?: "soffit" | "fascia" | "gutter" | "all" }
// Output: { items: MaterialItem[], totalLinearFt: number, model: string, mock?: true }

import { guard } from "../_guard";

export interface Env {
  GEMINI_API_KEY?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  FOLIO_CACHE?: KVNamespace;
}

export interface MaterialItem {
  material_type: "soffit" | "fascia" | "gutter";
  linear_feet: number;
  damage_severity: "none" | "minor" | "moderate" | "severe";
  color_hex: string;           // dominant color as #RRGGBB
  recommended_action: string;
  suggested_sku: string | null;
  notes: string;
  confidence: "low" | "medium" | "high";
}

interface DetectResponse {
  items: MaterialItem[];
  totalLinearFt: number;
  model: string;
  mock?: boolean;
}

const GEMINI_MODEL = "gemini-1.5-flash";

const SYSTEM_PROMPT = `You are a professional roofing contractor and materials estimator. Analyze exterior house photos to assess soffit, fascia, and gutter condition, color, and linear footage.

For each visible component, return:
- material_type: "soffit" | "fascia" | "gutter"
- linear_feet: estimated linear footage (single-story home perimeter ~120–160 lf typical)
- damage_severity: "none" | "minor" | "moderate" | "severe"
- color_hex: dominant color as #RRGGBB (e.g. "#F5F5DC" for beige, "#FFFFFF" for white)
- recommended_action: concise repair/replace recommendation
- suggested_sku: one of "SOFFIT & FASCIA" | "METAL FASCIA" | "GUTTERS" | null
- notes: brief observation (material, condition, visible damage)
- confidence: "low" | "medium" | "high"

Respond ONLY with valid JSON, no prose:
{
  "items": [MaterialItem, ...],
  "totalLinearFt": number
}

Guidelines:
- Only include components that are clearly visible in the photos
- For color_hex, identify the most dominant color of each material
- Estimate linear footage from visible roofline; a typical single-story is 120–160 lf perimeter
- If a component appears undamaged, damage_severity should be "none"
- suggested_sku maps to the product catalog: soffit damage → "SOFFIT & FASCIA", metal fascia → "METAL FASCIA", gutters → "GUTTERS"`;

const USER_PROMPT = `Analyze the exterior photo(s) of this house. Identify and estimate the soffit, fascia, and gutter components: their linear footage, current color, damage severity, and recommended action. Use what is visible — do not guess about areas not shown.`;

// ── Mock response ─────────────────────────────────────────────────────────────

const MOCK_RESPONSE: DetectResponse = {
  mock: true,
  model: `${GEMINI_MODEL} (mock)`,
  totalLinearFt: 148,
  items: [
    {
      material_type: "soffit",
      linear_feet: 148,
      damage_severity: "minor",
      color_hex: "#F5F5DC",
      recommended_action: "Clean and repaint; replace 2–3 damaged panels on east elevation",
      suggested_sku: "SOFFIT & FASCIA",
      notes: "Vinyl soffit, beige/cream. Minor cracking and one visibly sagging panel on east eave.",
      confidence: "medium",
    },
    {
      material_type: "fascia",
      linear_feet: 148,
      damage_severity: "moderate",
      color_hex: "#FFFFFF",
      recommended_action: "Replace wood fascia with aluminum wrap; significant weathering on west face",
      suggested_sku: "METAL FASCIA",
      notes: "Painted wood fascia, white. Peeling paint and wood rot visible at west corner.",
      confidence: "medium",
    },
    {
      material_type: "gutter",
      linear_feet: 80,
      damage_severity: "minor",
      color_hex: "#D3D3D3",
      recommended_action: "Clean gutters and resecure two loose hangers; rear not visible in photo",
      suggested_sku: "GUTTERS",
      notes: "Aluminum K-style gutters, light gray. Debris visible in front section; rear elevation not photographed.",
      confidence: "low",
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
    maxBodyBytes: 8 * 1024 * 1024, // 8 MB — up to 4 photos
    ratePrefix: "vision",
    rateLimit: 20,
  });
  if (guardErr) return guardErr;

  let body: { photos?: Array<{ base64: string; mediaType: string }>; material_type?: string };
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

  const apiKey = ctx.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: corsHeaders });
  }

  const materialHint = body.material_type
    ? `\n\nFocus especially on: ${body.material_type}. Still report any other visible components.`
    : "";

  const imageParts = photos.slice(0, 4).map((photo) => ({
    inlineData: {
      mimeType: photo.mediaType,
      data: photo.base64,
    },
  }));

  const geminiBody = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{
      parts: [...imageParts, { text: USER_PROMPT + materialHint }],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 1024,
    },
  };

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      },
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("[material-detect] Gemini error:", geminiRes.status, errText);
      return new Response(
        JSON.stringify({ error: `Gemini API error ${geminiRes.status}` }),
        { status: 502, headers: corsHeaders },
      );
    }

    const completion = (await geminiRes.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      modelVersion?: string;
    };

    const content = completion?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(content) as {
      items?: MaterialItem[];
      totalLinearFt?: number;
    };

    const result: DetectResponse = {
      items: parsed.items ?? [],
      totalLinearFt: parsed.totalLinearFt ?? 0,
      model: completion.modelVersion ?? GEMINI_MODEL,
    };

    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("[material-detect] fetch error:", err);
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
