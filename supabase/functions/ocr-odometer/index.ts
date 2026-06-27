import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { getAuthenticatedUser, getAdminClient } from '../_shared/auth.ts';
import { getEnv } from '../_shared/env.ts';

type OcrRequest = {
  bucket: string;
  path: string;
  language?: string;
};

function pickBestOdometer(text: string): number | null {
  const candidates = Array.from(text.matchAll(/\b\d{3,7}\b/g)).map((m) => m[0]);
  if (candidates.length === 0) return null;

  const nums = candidates
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));

  const preferred = nums.filter((n) => n >= 1000 && n <= 999999);
  const pool = preferred.length ? preferred : nums;
  return pool.length ? Math.max(...pool) : null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'POST') return jsonResponse(req, { error: 'Method not allowed' }, 405);

  try {
    await getAuthenticatedUser(req);

    const { bucket, path, language } = (await req.json()) as OcrRequest;
    if (!bucket || !path) return jsonResponse(req, { error: 'bucket and path are required' }, 400);

    const ocrApiKey = getEnv('OCRSPACE_API_KEY');
    if (!ocrApiKey) return jsonResponse(req, { error: 'Missing OCRSPACE_API_KEY in function environment' }, 500);

    const admin = getAdminClient();

    const { data: fileData, error: dlErr } = await admin.storage.from(bucket).download(path);
    if (dlErr || !fileData) {
      return jsonResponse(req, { error: `Storage download failed: ${dlErr?.message || 'file not found'}` }, 400);
    }

    const arrayBuf = await fileData.arrayBuffer();
    const blob = new Blob([arrayBuf], { type: fileData.type || 'image/jpeg' });

    const form = new FormData();
    form.append('apikey', ocrApiKey);
    form.append('language', language || 'eng');
    form.append('scale', 'true');
    form.append('isOverlayRequired', 'false');
    form.append('OCREngine', '2');
    form.append('file', blob, 'odometer.jpg');

    const ocrRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: form,
    });

    if (!ocrRes.ok) {
      const txt = await ocrRes.text();
      return jsonResponse(req, { error: `OCR request failed (${ocrRes.status})`, details: txt.slice(0, 1000) }, 502);
    }

    const ocrJson = await ocrRes.json();

    const parsedText: string =
      ocrJson?.ParsedResults?.[0]?.ParsedText ??
      ocrJson?.ParsedResults?.map((r: any) => r?.ParsedText).join('\n') ??
      '';

    const confidence: number | null = (() => {
      const conf = ocrJson?.ParsedResults?.[0]?.TextOverlay?.Lines?.[0]?.Words?.[0]?.WordConfidence;
      const asNum = typeof conf === 'string' ? parseInt(conf, 10) : typeof conf === 'number' ? conf : NaN;
      return Number.isFinite(asNum) ? asNum : null;
    })();

    return jsonResponse(req, {
      extracted_km: pickBestOdometer(parsedText),
      confidence,
      // Kept for current frontend compatibility, but trimmed to reduce leakage/noise.
      raw_text: parsedText.slice(0, 1000),
      provider: 'ocr.space',
    });
  } catch (e) {
    if (e instanceof Response) {
      const body = await e.text();
      return new Response(body, { status: e.status, headers: jsonResponse(req, {}).headers });
    }

    return jsonResponse(req, { error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});
