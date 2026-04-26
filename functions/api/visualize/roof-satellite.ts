// POST /api/visualize/roof-satellite
// Satellite-path fallback for the roof visualizer.
// Used when Street View is unavailable (HOA-gated, no coverage) or when the
// Flash vision score indicates heavy tree occlusion (<30% roof visible).
//
// Input:  { lat: number, lng: number, color: string, finish?: string, quote_id?: string }
// Output: { before_url: string, after_url: string }
//
// The "before" image is the satellite tile itself (served as a data URL via Supabase storage).
// The "after" image is the Gemini-rendered version with the new roof applied.
//
// Cost: 1 Static Maps tile (free, covered by $200/mo Google credit) +
//       1 Gemini 2.5 Flash Image call (~$0.035). Total unchanged vs. street-view path.

import { createClient } from "@supabase/supabase-js";

const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
const MODEL_ID = "gemini-2.5-flash-image";
const SATELLITE_ZOOM = 19;
const SATELLITE_SIZE = "1024x1024";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GOOGLE_API_KEY?: string;
  GEMINI_API_KEY?: string;
  VISUALIZER_DAILY_CAP?: string;
}

interface RequestBody {
  address?: string;
  lat?: number;
  lng?: number;
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

  const userId = await getUserId(request, env);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS });
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

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

  const center = body.address
    ? encodeURIComponent(body.address)
    : (typeof body.lat === "number" && typeof body.lng === "number")
      ? `${body.lat},${body.lng}`
      : null;

  if (!center) {
    return Response.json({ error: "address or lat+lng is required" }, { status: 400, headers: CORS });
  }

  // Fetch satellite tile from Google Static Maps
  const satelliteUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=${SATELLITE_ZOOM}&size=${SATELLITE_SIZE}&maptype=satellite&key=${googleApiKey}`;

  let satelliteBase64: string;
  let satelliteMimeType = "image/png";

  try {
    const tileRes = await fetch(satelliteUrl);
    if (!tileRes.ok) {
      return Response.json(
        { error: `Google Static Maps error: ${tileRes.status}` },
        { status: 502, headers: CORS },
      );
    }
    satelliteMimeType = tileRes.headers.get("content-type") ?? "image/png";
    const buffer = await tileRes.arrayBuffer();
    // Chunked to avoid call-stack overflow on large satellite tiles
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    satelliteBase64 = btoa(binary);
  } catch (err) {
    return Response.json(
      { error: `Satellite tile fetch failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 502, headers: CORS },
    );
  }

  // Upload satellite "before" image to Supabase storage
  const timestamp = Date.now();
  const quoteSegment = body.quote_id ?? "no-quote";
  const beforePath = `${userId}/${quoteSegment}/${timestamp}-satellite-before.png`;
  const beforeBytes = Uint8Array.from(atob(satelliteBase64), (c) => c.charCodeAt(0));

  const { error: beforeUploadErr } = await sb.storage
    .from("visualizer-renders")
    .upload(beforePath, beforeBytes, { contentType: satelliteMimeType, upsert: false });

  if (beforeUploadErr) {
    return Response.json(
      { error: `Before-image upload failed: ${beforeUploadErr.message}` },
      { status: 500, headers: CORS },
    );
  }

  const { data: beforeUrlData } = sb.storage.from("visualizer-renders").getPublicUrl(beforePath);
  const beforeUrl = beforeUrlData.publicUrl;

  // Gemini photoshop: apply roof color from aerial perspective
  const finish = body.finish ?? "Matte";
  const prompt = `This is a top-down aerial satellite view of a residential home. Apply ${body.color} ${finish.toLowerCase()} finish standing seam metal roofing to all roof surfaces visible from above. Preserve the building footprint, surrounding landscape, driveway, trees, and all non-roof elements exactly. Render in the same top-down satellite perspective.`;

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
            { inline_data: { mime_type: satelliteMimeType, data: satelliteBase64 } },
            { text: prompt },
          ],
        }],
        generationConfig: { responseModalities: ["IMAGE"] },
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
        error: `Gemini satellite ${geminiRes.status}: ${errText.slice(0, 500)}`,
      });
      return Response.json(
        { error: `Gemini API error (${geminiRes.status})`, detail: errText.slice(0, 200) },
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
        error: `No image in Gemini satellite response: ${raw}`,
      });
      return Response.json(
        { error: "Gemini did not return an image for the satellite render.", raw },
        { status: 502, headers: CORS },
      );
    }

    renderBase64 = imagePart.inlineData.data;
    renderMimeType = imagePart.inlineData.mimeType ?? "image/jpeg";
  } catch (err) {
    return Response.json(
      { error: `Gemini satellite request failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 502, headers: CORS },
    );
  }

  // Upload "after" render
  const afterPath = `${userId}/${quoteSegment}/${timestamp}-satellite-after.jpg`;
  const afterBytes = Uint8Array.from(atob(renderBase64), (c) => c.charCodeAt(0));

  const { error: afterUploadErr } = await sb.storage
    .from("visualizer-renders")
    .upload(afterPath, afterBytes, { contentType: renderMimeType, upsert: false });

  if (afterUploadErr) {
    return Response.json(
      { error: `After-image upload failed: ${afterUploadErr.message}` },
      { status: 500, headers: CORS },
    );
  }

  const { data: afterUrlData } = sb.storage.from("visualizer-renders").getPublicUrl(afterPath);
  const afterUrl = afterUrlData.publicUrl;

  // Log success
  await sb.from("visualizer_render_log").insert({
    user_id: userId,
    quote_id: body.quote_id ?? null,
    color: body.color,
    finish,
    prompt,
    status: "success",
    render_url: afterUrl,
  });

  return Response.json({ before_url: beforeUrl, after_url: afterUrl, model_id: MODEL_ID, path: "satellite" }, { headers: CORS });
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
