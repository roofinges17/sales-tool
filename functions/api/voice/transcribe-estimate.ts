// POST /api/voice/transcribe-estimate
// Accepts base64 audio (webm/mp4/m4a from MediaRecorder), transcribes and extracts
// roofing estimate line items via a single Gemini Flash audio call.
// Falls back to mock when GEMINI_API_KEY is not set.
//
// Input:  { audio: string (base64), mimeType: string, fileName?: string }
// Output: { transcript: string, items: VoiceItem[], model: string, mock?: true }

import { guard } from "../_guard";

export interface Env {
  GEMINI_API_KEY?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  FOLIO_CACHE?: KVNamespace;
}

export interface VoiceItem {
  description: string;       // e.g. "Shingle replacement, south slope"
  quantity: number;
  unit: string;              // e.g. "sq ft", "lf", "each"
  suggested_sku: string | null;
  notes: string;
}

interface TranscribeResponse {
  transcript: string;
  items: VoiceItem[];
  model: string;
  mock?: boolean;
}

const GEMINI_MODEL = "gemini-1.5-flash";

const SYSTEM_PROMPT = `You are a roofing estimator assistant. Listen to the audio recording of a roofing contractor describing damage observations and work to be done.

Respond ONLY with valid JSON matching this schema — no prose, no markdown fences:
{
  "transcript": "<verbatim transcription of the audio>",
  "items": [
    {
      "description": string,
      "quantity": number,
      "unit": string,
      "suggested_sku": string | null,
      "notes": string
    }
  ]
}

Rules for suggested_sku — map each item to one of these product codes when applicable:
- METAL — metal roof replacement
- SHINGLE — shingle roof replacement
- TILE — tile roof replacement
- FLAT — flat roof replacement
- FLAT INSULATIONS — flat roof with insulation
- SOFFIT & FASCIA — soffit or fascia work
- METAL FASCIA — metal fascia repair
- GUTTERS — gutter work
- INSULATION — insulation
- null — if no catalog item matches

If quantity is not mentioned, make a reasonable estimate based on context (e.g. "whole roof" → 1500 sq ft). Use common roofing units: sq ft for area, lf for linear footage, each for discrete items.

If the audio is silent or unintelligible, return transcript as empty string and items as empty array.
Return an empty items array if no actionable line items can be extracted.`;

// ── Mock response ─────────────────────────────────────────────────────────────

const MOCK_TRANSCRIPT =
  "Okay so for this property we're looking at a full shingle replacement on the main roof, about eighteen hundred square feet. The east slope has some rotted decking, figure two hundred square feet of decking repair. Gutters on the front and sides need replacing, roughly one hundred linear feet. And the fascia on the west side is shot, maybe sixty linear feet of metal fascia.";

const MOCK_RESPONSE: TranscribeResponse = {
  mock: true,
  model: `${GEMINI_MODEL} (mock)`,
  transcript: MOCK_TRANSCRIPT,
  items: [
    {
      description: "Full shingle replacement — main roof",
      quantity: 1800,
      unit: "sq ft",
      suggested_sku: "SHINGLE",
      notes: "Full roof replacement per rep estimate",
    },
    {
      description: "Rotted decking repair — east slope",
      quantity: 200,
      unit: "sq ft",
      suggested_sku: null,
      notes: "Decking replacement required before shingle install",
    },
    {
      description: "Gutter replacement — front and sides",
      quantity: 100,
      unit: "lf",
      suggested_sku: "GUTTERS",
      notes: "Front + side elevations only",
    },
    {
      description: "Metal fascia replacement — west side",
      quantity: 60,
      unit: "lf",
      suggested_sku: "METAL FASCIA",
      notes: "West elevation only, existing wood fascia deteriorated",
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
    maxBodyBytes: 25 * 1024 * 1024, // 25 MB — audio file limit
    ratePrefix: "voice",
    rateLimit: 20,
  });
  if (guardErr) return guardErr;

  let body: { audio?: string; mimeType?: string; fileName?: string };
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  if (!body.audio) {
    return new Response(JSON.stringify({ error: "audio (base64) is required" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const apiKey = ctx.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: corsHeaders });
  }

  const mimeType = body.mimeType ?? "audio/webm";

  const geminiBody = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{
      parts: [
        { inlineData: { mimeType, data: body.audio } },
        { text: "Transcribe the audio and extract roofing estimate line items." },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 2048,
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
      console.error("[voice] Gemini error:", geminiRes.status, errText);
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
    const parsed = JSON.parse(content) as { transcript?: string; items?: VoiceItem[] };

    const transcript = parsed.transcript?.trim() ?? "";

    if (!transcript) {
      return new Response(
        JSON.stringify({ transcript: "", items: [], model: completion.modelVersion ?? GEMINI_MODEL }),
        { status: 200, headers: corsHeaders },
      );
    }

    const result: TranscribeResponse = {
      transcript,
      items: parsed.items ?? [],
      model: completion.modelVersion ?? GEMINI_MODEL,
    };

    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("[voice] Gemini fetch error:", err);
    return new Response(JSON.stringify({ error: "Transcription failed" }), {
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
