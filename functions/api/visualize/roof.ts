// POST /api/visualize/roof
// Gemini 2.5 Flash Image AI roof visualizer — generates a photoreal render of the
// customer's home with the selected metal roof color applied.
//
// Input:  { photo_base64: string, mime_type?: string, color: string, finish?: string, quote_id?: string }
// Output: { render_url: string }
//
// Rate limit: VISUALIZER_DAILY_CAP (default 20) renders per user per day, tracked
// in visualizer_render_log. Service role writes the log; authenticated JWT required.

import { createClient } from "@supabase/supabase-js";

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const MODEL_ID = "gemini-2.5-flash-preview-04-17";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GOOGLE_API_KEY?: string;
  GEMINI_API_KEY?: string;
  VISUALIZER_DAILY_CAP?: string;
}

interface RequestBody {
  photo_base64?: string;
  photo_url?: string;
  mime_type?: string;
  color: string;
  finish?: string;
  quote_id?: string;
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

async function checkRateLimit(
  sb: ReturnType<typeof createClient>,
  userId: string,
  dailyCap: number,
): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await sb
    .from("visualizer_render_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", `${today}T00:00:00Z`);
  return (count ?? 0) < dailyCap;
}

async function fetchPhotoBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch photo: ${res.status}`);
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  const buffer = await res.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return { data: base64, mimeType };
}

export async function onRequestPost(ctx: { request: Request; env: Env }) {
  const { request, env } = ctx;

  const supabaseUrl = env.SUPABASE_URL ?? "https://hlmmwtehabwywajuhghi.supabase.co";
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const googleApiKey = env.GOOGLE_API_KEY ?? env.GEMINI_API_KEY;
  const dailyCap = parseInt(env.VISUALIZER_DAILY_CAP ?? "20", 10);

  if (!serviceKey) {
    return Response.json({ error: "Server misconfigured" }, { status: 500, headers: CORS });
  }
  if (!googleApiKey) {
    return Response.json({ error: "GOOGLE_API_KEY / GEMINI_API_KEY not configured" }, { status: 500, headers: CORS });
  }

  // Auth — require valid sales-tool JWT
  const userId = await getUserId(request, env);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Rate limit: per-user per-day
  const withinCap = await checkRateLimit(sb, userId, dailyCap);
  if (!withinCap) {
    await sb.from("visualizer_render_log").insert({
      user_id: userId,
      status: "rate_limited",
      error: `Daily cap of ${dailyCap} reached`,
    });
    return Response.json(
      { error: "Daily render limit reached. Contact your manager to increase your cap." },
      { status: 429, headers: CORS },
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  if (!body.color) {
    return Response.json({ error: "color is required" }, { status: 400, headers: CORS });
  }

  // Resolve photo to base64
  let photoBase64: string;
  let mimeType = body.mime_type ?? "image/jpeg";
  try {
    if (body.photo_base64) {
      photoBase64 = body.photo_base64;
    } else if (body.photo_url) {
      const fetched = await fetchPhotoBase64(body.photo_url);
      photoBase64 = fetched.data;
      mimeType = fetched.mimeType;
    } else {
      return Response.json({ error: "photo_base64 or photo_url is required" }, { status: 400, headers: CORS });
    }
  } catch (err) {
    return Response.json(
      { error: `Failed to load photo: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400, headers: CORS },
    );
  }

  const finish = body.finish ?? "Matte";
  const prompt = `Replace this roof with standing seam metal in ${body.color}, ${finish.toLowerCase()} finish. Preserve all other elements of the image including landscaping, vehicles, sky, lighting, and building geometry. Keep the same perspective and scale.`;

  // Call Gemini API
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${googleApiKey}`;

  let renderBase64: string;
  let renderMimeType = "image/jpeg";

  try {
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: photoBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          response_mime_type: "image/jpeg",
          responseModalities: ["IMAGE", "TEXT"],
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      await sb.from("visualizer_render_log").insert({
        user_id: userId,
        quote_id: body.quote_id ?? null,
        color: body.color,
        finish,
        prompt,
        status: "error",
        error: `Gemini ${geminiRes.status}: ${errText.slice(0, 500)}`,
      });
      return Response.json(
        { error: `Gemini API error (${geminiRes.status}). If this is a 404, the model ID may need updating.`, detail: errText.slice(0, 200) },
        { status: 502, headers: CORS },
      );
    }

    const geminiJson = (await geminiRes.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }>;
        };
      }>;
    };

    const imagePart = geminiJson.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      const raw = JSON.stringify(geminiJson).slice(0, 300);
      await sb.from("visualizer_render_log").insert({
        user_id: userId,
        quote_id: body.quote_id ?? null,
        color: body.color,
        finish,
        prompt,
        status: "error",
        error: `No image in Gemini response: ${raw}`,
      });
      return Response.json(
        { error: "Gemini did not return an image. Check model ID or prompt.", raw: raw },
        { status: 502, headers: CORS },
      );
    }

    renderBase64 = imagePart.inlineData.data;
    renderMimeType = imagePart.inlineData.mimeType ?? "image/jpeg";
  } catch (err) {
    return Response.json(
      { error: `Gemini request failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 502, headers: CORS },
    );
  }

  // Upload to Supabase storage: visualizer-renders/{user_id}/{quote_id or 'no-quote'}/{timestamp}.jpg
  const quoteSegment = body.quote_id ?? "no-quote";
  const timestamp = Date.now();
  const storagePath = `${userId}/${quoteSegment}/${timestamp}.jpg`;

  const imageBytes = Uint8Array.from(atob(renderBase64), (c) => c.charCodeAt(0));

  const { error: uploadErr } = await sb.storage
    .from("visualizer-renders")
    .upload(storagePath, imageBytes, {
      contentType: renderMimeType,
      upsert: false,
    });

  if (uploadErr) {
    await sb.from("visualizer_render_log").insert({
      user_id: userId,
      quote_id: body.quote_id ?? null,
      color: body.color,
      finish,
      prompt,
      status: "error",
      error: `Storage upload failed: ${uploadErr.message}`,
    });
    return Response.json({ error: `Storage upload failed: ${uploadErr.message}` }, { status: 500, headers: CORS });
  }

  // Get public URL
  const { data: urlData } = sb.storage.from("visualizer-renders").getPublicUrl(storagePath);
  const renderUrl = urlData.publicUrl;

  // Log success
  await sb.from("visualizer_render_log").insert({
    user_id: userId,
    quote_id: body.quote_id ?? null,
    color: body.color,
    finish,
    prompt,
    status: "success",
    render_url: renderUrl,
  });

  return Response.json({ render_url: renderUrl, model_id: MODEL_ID }, { headers: CORS });
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
