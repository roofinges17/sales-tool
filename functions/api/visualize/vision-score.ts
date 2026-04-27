// POST /api/visualize/vision-score
// Gemini Flash vision call: estimates % of roof visible in a Street View image.
// Used as a pre-render gate — if score <30, the caller routes to satellite fallback.
//
// Input:  { photo_base64: string, mime_type?: string }
// Output: { score: number }  (integer 0–100; % of roof clearly visible)
//
// Cost: Gemini 2.5 Flash vision (text response only) — free tier, $0 per call.

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const VISION_MODEL = "gemini-2.5-flash";

interface Env {
  GOOGLE_API_KEY?: string;
  GEMINI_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface RequestBody {
  photo_base64: string;
  mime_type?: string;
}

async function getUserId(request: Request, env: Env): Promise<string | null> {
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    return user.id ?? null;
  } catch {
    return null;
  }
}

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  const googleApiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
  const supabaseUrl = env.SUPABASE_URL;

  if (!googleApiKey) {
    return Response.json({ error: "GOOGLE_API_KEY / GEMINI_API_KEY not configured" }, { status: 500, headers: CORS });
  }
  if (!supabaseUrl) {
    return Response.json({ error: "Server misconfigured: SUPABASE_URL not set" }, { status: 500, headers: CORS });
  }

  const userId = await getUserId(request, env);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  if (!body.photo_base64) {
    return Response.json({ error: "photo_base64 is required" }, { status: 400, headers: CORS });
  }

  const mimeType = body.mime_type ?? "image/jpeg";
  const prompt = "Look at this Street View image of a residential home. Estimate the percentage of the roof that is clearly visible and not blocked by trees, foliage, or strong shadows. Return ONLY an integer between 0 and 100. Just the number.";

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent?key=${googleApiKey}`;

  try {
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: body.photo_base64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
    });

    if (!geminiRes.ok) {
      // Non-fatal — caller falls back to normal path
      return Response.json({ score: 100, error: `Vision API ${geminiRes.status}` }, { headers: CORS });
    }

    const geminiJson = (await geminiRes.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const rawText = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    const score = parseInt(rawText.replace(/[^0-9]/g, ""), 10);

    return Response.json(
      { score: isNaN(score) ? 100 : Math.max(0, Math.min(100, score)) },
      { headers: CORS },
    );
  } catch (err) {
    // Non-fatal — return high score so caller proceeds with normal path
    return Response.json(
      { score: 100, error: `Vision request failed: ${err instanceof Error ? err.message : "unknown"}` },
      { headers: CORS },
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
