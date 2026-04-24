// POST /api/voice/transcribe-estimate
// Accepts base64 audio (webm/mp4/m4a from MediaRecorder), transcribes via Whisper,
// then extracts roofing estimate line items via GPT-4o.
// Falls back to mock when OPENAI_API_KEY is not set.
//
// Input:  { audio: string (base64), mimeType: string, fileName?: string }
// Output: { transcript: string, items: VoiceItem[], model: string, mock?: true }

export interface Env {
  OPENAI_API_KEY?: string;
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

const EXTRACTION_SYSTEM_PROMPT = `You are a roofing estimator assistant. Extract structured line items from this roofing contractor's voice memo.

Return ONLY valid JSON matching this schema — no prose, no fences:
{
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

Return an empty items array if no actionable line items can be extracted.`;

// ── Mock response ─────────────────────────────────────────────────────────────

const MOCK_TRANSCRIPT =
  "Okay so for this property we're looking at a full shingle replacement on the main roof, about eighteen hundred square feet. The east slope has some rotted decking, figure two hundred square feet of decking repair. Gutters on the front and sides need replacing, roughly one hundred linear feet. And the fascia on the west side is shot, maybe sixty linear feet of metal fascia.";

const MOCK_RESPONSE: TranscribeResponse = {
  mock: true,
  model: "whisper-1 + gpt-4o (mock)",
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

  const apiKey = ctx.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify(MOCK_RESPONSE), { status: 200, headers: corsHeaders });
  }

  // ── Step 1: Whisper transcription ────────────────────────────────────────────

  const mimeType = body.mimeType ?? "audio/webm";
  // Derive file extension — Whisper requires a filename with valid extension
  const extMap: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp4": "mp4",
    "audio/m4a": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
  };
  const ext = extMap[mimeType] ?? "webm";
  const fileName = body.fileName ?? `recording.${ext}`;

  let transcript = "";
  try {
    // Decode base64 → binary
    const binaryStr = atob(body.audio);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const audioBlob = new Blob([bytes], { type: mimeType });

    const formData = new FormData();
    formData.append("file", audioBlob, fileName);
    formData.append("model", "whisper-1");
    formData.append("language", "en");

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error("[voice] Whisper error:", whisperRes.status, errText);
      return new Response(
        JSON.stringify({ error: `Whisper API error ${whisperRes.status}` }),
        { status: 502, headers: corsHeaders },
      );
    }

    const whisperData = (await whisperRes.json()) as { text?: string };
    transcript = whisperData.text?.trim() ?? "";
  } catch (err) {
    console.error("[voice] Whisper fetch error:", err);
    return new Response(JSON.stringify({ error: "Transcription failed" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  if (!transcript) {
    return new Response(
      JSON.stringify({ transcript: "", items: [], model: "whisper-1", mock: false }),
      { status: 200, headers: corsHeaders },
    );
  }

  // ── Step 2: GPT-4o extraction ─────────────────────────────────────────────────

  try {
    const gptRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: transcript },
        ],
      }),
    });

    if (!gptRes.ok) {
      const errText = await gptRes.text();
      console.error("[voice] GPT-4o error:", gptRes.status, errText);
      // Return transcript with empty items rather than failing entirely
      return new Response(
        JSON.stringify({ transcript, items: [], model: "whisper-1", mock: false }),
        { status: 200, headers: corsHeaders },
      );
    }

    const completion = (await gptRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };
    const content = completion?.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { items?: VoiceItem[] };

    const result: TranscribeResponse = {
      transcript,
      items: parsed.items ?? [],
      model: completion.model ?? "gpt-4o",
    };

    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("[voice] GPT-4o fetch error:", err);
    return new Response(
      JSON.stringify({ transcript, items: [], model: "whisper-1", mock: false }),
      { status: 200, headers: corsHeaders },
    );
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
