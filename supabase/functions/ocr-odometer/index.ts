import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type OcrRequest = {
  bucket: string;
  path: string;
  language?: string; // OCR.space language code (default: eng)
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function pickBestOdometer(text: string): number | null {
  const candidates = Array.from(text.matchAll(/\b\d{3,7}\b/g)).map((m) => m[0]);
  if (candidates.length === 0) return null;

  const nums = candidates
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));

  const preferred = nums.filter((n) => n >= 1000 && n <= 999999);
  const pool = preferred.length ? preferred : nums;
  if (!pool.length) return null;
  return Math.max(...pool);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {

    // Supabase project URL is required for both auth validation and storage download
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ code: 401, message: "Missing Authorization bearer token" }, 401);
    }

    // ANON key is used only for validating the caller token via auth.getUser()
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("ANON_KEY") ||
      req.headers.get("apikey") ||
      req.headers.get("x-api-key") ||
      "";

    if (!supabaseUrl || !anonKey) {
      return json({ error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY in function environment" }, 500);
    }

    // Manual auth check (recommended when gateway verify_jwt is disabled)
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ code: 401, message: "Invalid JWT" }, 401);
    }
    const { bucket, path, language } = (await req.json()) as OcrRequest;
    if (!bucket || !path) return json({ error: "bucket and path are required" }, 400);

    const serviceRoleKey =
      Deno.env.get("SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Missing SERVICE_ROLE_KEY or SUPABASE_URL in function environment" }, 500);
    }

    const ocrApiKey = Deno.env.get("OCRSPACE_API_KEY");
    if (!ocrApiKey) {
      return json({ error: "Missing OCRSPACE_API_KEY in function environment" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Download image bytes from Supabase Storage (expects object key path, not a URL)
    const { data: fileData, error: dlErr } = await supabase.storage.from(bucket).download(path);
    if (dlErr || !fileData) {
      return json({ error: `Storage download failed: ${dlErr?.message || "file not found"}` }, 400);
    }

    const arrayBuf = await fileData.arrayBuffer();
    const blob = new Blob([arrayBuf], { type: fileData.type || "image/jpeg" });

    // Call OCR.space
    const form = new FormData();
    form.append("apikey", ocrApiKey);
    form.append("language", language || "eng");
    form.append("scale", "true");
    form.append("isOverlayRequired", "false");
    form.append("OCREngine", "2");
    form.append("file", blob, "odometer.jpg");

    const ocrRes = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: form,
    });

    if (!ocrRes.ok) {
      const txt = await ocrRes.text();
      return json({ error: `OCR request failed (${ocrRes.status})`, details: txt }, 502);
    }

    const ocrJson = await ocrRes.json();

    const parsedText: string =
      ocrJson?.ParsedResults?.[0]?.ParsedText ??
      ocrJson?.ParsedResults?.map((r: any) => r?.ParsedText).join("\n") ??
      "";

    const confidence: number | null = (() => {
      const conf =
        ocrJson?.ParsedResults?.[0]?.TextOverlay?.Lines?.[0]?.Words?.[0]?.WordConfidence;
      const asNum =
        typeof conf === "string" ? parseInt(conf, 10) : typeof conf === "number" ? conf : NaN;
      return Number.isFinite(asNum) ? asNum : null;
    })();

    const extracted = pickBestOdometer(parsedText);

    return json({
      extracted_km: extracted,
      confidence,
      raw_text: parsedText?.slice(0, 5000) || "",
      provider: "ocr.space",
    });
  } catch (e: any) {
    return json({ error: e?.message ?? "Unknown error" }, 500);
  }
});