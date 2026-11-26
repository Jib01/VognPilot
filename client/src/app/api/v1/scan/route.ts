import { NextRequest, NextResponse } from 'next/server';
import { ProductCard, ScanResult } from '@/types/vision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function buildPrompt(targetLang: string, dietary: string[], targetItem?: string) {
  const dietaryText = dietary.length > 0
    ? `USER DIETARY FILTERS: ${dietary.join(', ')}. Flag any product violating these in "dietary_warning" in ${targetLang} (null if compliant).`
    : 'USER DIETARY FILTERS: none.';

  const targetText = targetItem
    ? `USER IS LOOKING FOR: "${targetItem}". Prioritize matching items and note relevance in "copilot_tip".`
    : '';

  return `Analyze this Danish supermarket shelf/product image for a shopper.
SPEED RULE: Focus ONLY on the 1 to 4 largest, clearest products in the foreground. Ignore tiny background shelves.
LANGUAGE RULE: Write all translated names, summaries, warnings, and copilot_tip in ${targetLang}.
${dietaryText}
${targetText}

Return ONLY valid JSON matching this schema:
{
  "copilot_tip": "1 short practical sentence in ${targetLang} telling which product is best value/fit and why (e.g. compare price per kg/L or dietary fit).",
  "recommended_index": 0,
  "items": [
    {
      "danish_name": "Exact Danish name on label",
      "translated_name": "Clear ${targetLang} name + weight/volume (e.g. 500g / 1L)",
      "price_dkk": 14.5,
      "unit_price_dkk": 29.0,
      "unit_measure": "kg or L (null if unknown)",
      "pant_dkk": 0,
      "multipack_offer": "Exact Danish deal text e.g. 'Ta 2 for 30 kr' or null",
      "is_organic": false,
      "is_lactose_free": false,
      "is_vegan": false,
      "is_gluten_free": false,
      "dietary_warning": "Short warning in ${targetLang} ONLY if it violates USER DIETARY FILTERS, else null",
      "protein_g_per_100g": null,
      "fat_percentage": null,
      "sugar_g_per_100g": null,
      "summary": "Max 10 words in ${targetLang}"
    }
  ]
}
Rules:
- Max 4 items.
- Calculate or read unit_price_dkk per kg or L whenever weight/volume or shelf kr/kg is visible so shopper can compare real value.
- Set pant_dkk to 1, 1.5, or 3 ONLY for Danish returnable bottles/cans (Pant A/B/C), else 0.
- If no food/grocery product or readable price tag is visible, return {"items":[]}.`;
}

interface RawProductItem {
  translated_name?: string;
  english_name?: string;
  danish_name?: string;
  danish_term?: string;
  label?: string;
  price_dkk?: number | string | null;
  package_price_dkk?: number | string | null;
  unit_price_dkk?: number | string | null;
  unit_measure?: string | null;
  pant_dkk?: number | string | null;
  pant_fee_dkk?: number | string | null;
  multipack_offer?: string | null;
  fat_percentage?: number | string | null;
  sugar_g_per_100g?: number | string | null;
  protein_g_per_100g?: number | string | null;
  is_organic?: boolean;
  is_lactose_free?: boolean;
  is_vegan?: boolean;
  is_plant_based?: boolean;
  is_gluten_free?: boolean;
  dietary_warning?: string | null;
  summary?: string | null;
  [key: string]: unknown;
}

interface ScanPreferences {
  language?: string;
  dietary_lifestyle?: string[];
}

function mapItemToProduct(item: RawProductItem, dietary: string[]): ProductCard {
  let matches = true;
  if (dietary.includes('organic') && !item.is_organic) matches = false;
  if (dietary.includes('vegan') && !item.is_vegan) matches = false;
  if (dietary.includes('lactose_free') && !item.is_lactose_free) matches = false;
  if (dietary.includes('gluten_free') && !item.is_gluten_free) matches = false;

  const pant = Number(item.pant_dkk ?? item.pant_fee_dkk ?? 0);
  const warning = item.dietary_warning && String(item.dietary_warning).toLowerCase() !== 'null'
    ? String(item.dietary_warning)
    : null;

  return {
    label: item.translated_name || item.english_name || item.danish_name || item.label || 'Danish Product',
    danish_term: item.danish_name || item.danish_term || '',
    package_price_dkk: Number(item.price_dkk ?? item.package_price_dkk ?? 0),
    unit_price_dkk: item.unit_price_dkk != null && Number(item.unit_price_dkk) > 0 ? Number(item.unit_price_dkk) : null,
    unit_measure: item.unit_measure || null,
    pant_fee_dkk: pant > 0 ? pant : null,
    multipack_offer: item.multipack_offer && String(item.multipack_offer).toLowerCase() !== 'null' ? String(item.multipack_offer) : null,
    fat_percentage: item.fat_percentage != null ? Number(item.fat_percentage) : null,
    sugar_g_per_100g: item.sugar_g_per_100g != null ? Number(item.sugar_g_per_100g) : null,
    protein_g_per_100g: item.protein_g_per_100g != null ? Number(item.protein_g_per_100g) : null,
    is_organic: Boolean(item.is_organic),
    is_lactose_free: Boolean(item.is_lactose_free),
    is_plant_based: Boolean(item.is_vegan || item.is_plant_based),
    is_gluten_free: Boolean(item.is_gluten_free),
    matches_constraints: matches && !warning,
    dietary_warning: warning,
    summary: item.summary || null,
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const rawApiKeys = (process.env.GEMINI_API_KEY || '').trim();
  const apiKeys = rawApiKeys
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);

  let preferences: ScanPreferences = {};
  let base64 = '';
  let mimeType = 'image/jpeg';
  let language = 'en';
  let targetItem = '';

  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      base64 = body.image || '';
      if (base64.includes('base64,')) {
        base64 = base64.split('base64,')[1];
      }
      mimeType = body.mimeType || 'image/jpeg';
      preferences = body.preferences || {};
      language = body.language || preferences?.language || 'en';
      targetItem = typeof body.targetItem === 'string' ? body.targetItem.trim() : '';
    } else {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const preferencesStr = formData.get('preferences') as string | null;
      const langStr = formData.get('language') as string | null;

      if (file) {
        const bytes = await file.arrayBuffer();
        base64 = Buffer.from(bytes).toString('base64');
        mimeType = (file.type && file.type.startsWith('image/')) ? file.type : 'image/jpeg';
      }
      preferences = preferencesStr ? JSON.parse(preferencesStr) : {};
      language = langStr || preferences?.language || 'en';
    }
  } catch (parseErr) {
    console.error('[Scan Route] Request body parse failed:', parseErr);
    return NextResponse.json(
      { error_code: 'BAD_REQUEST', message: 'Invalid request payload' },
      { status: 400 }
    );
  }

  if (apiKeys.length === 0) {
    return NextResponse.json(
      {
        error_code: 'AUTH_ERROR',
        message: language === 'it'
          ? 'Chiave API Gemini mancante o non valida nelle variabili d\'ambiente.'
          : 'Gemini API key is missing or invalid in environment variables.',
      },
      { status: 401 }
    );
  }

  if (!base64) {
    return NextResponse.json(
      {
        error_code: 'NO_IMAGE',
        message: language === 'it' ? 'Nessuna immagine fornita' : 'No image provided',
      },
      { status: 400 }
    );
  }

  const dietary: string[] = Array.isArray(preferences?.dietary_lifestyle) ? preferences.dietary_lifestyle : [];
  const targetLang = language === 'it' ? 'Italian' : 'English';
  const prompt = buildPrompt(targetLang, dietary, targetItem);

  // Empirically benchmarked fast models with minimal thinking (avg 1-3s)
  const ATTEMPTS = [
    {
      model: 'gemini-3.1-flash-lite',
      timeoutMs: 8500,
      genConfig: {
        temperature: 0.1,
        maxOutputTokens: 900,
        responseMimeType: 'application/json',
        mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
    },
    {
      model: 'gemini-3-flash-preview',
      timeoutMs: 8500,
      genConfig: {
        temperature: 0.1,
        maxOutputTokens: 900,
        responseMimeType: 'application/json',
        mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
    },
    {
      model: 'gemini-3.5-flash-lite',
      timeoutMs: 7000,
      genConfig: {
        temperature: 0.1,
        maxOutputTokens: 900,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
    },
  ];

  let isQuotaExceeded = false;
  let isTimeout = false;
  let isAuthError = false;
  let lastErrorMsg = '';

  for (const apiKey of apiKeys) {
    for (const attempt of ATTEMPTS) {
      const { model, timeoutMs, genConfig } = attempt;
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType, data: base64 } },
                ],
              },
            ],
            generationConfig: genConfig,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.status === 429) {
          isQuotaExceeded = true;
          continue;
        }

        if (res.status === 400 || res.status === 401 || res.status === 403) {
          const errText = await res.text();
          if (errText.includes('API_KEY') || errText.includes('identity') || errText.includes('unregistered')) {
            isAuthError = true;
          }
          lastErrorMsg = errText.slice(0, 150);
          continue;
        }

        if (!res.ok) {
          const errText = await res.text();
          lastErrorMsg = `${model} ${res.status}: ${errText.slice(0, 150)}`;
          continue;
        }

        const data = await res.json();
        const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidateText) continue;

        const cleaned = candidateText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const rawItems = Array.isArray(parsed?.items)
          ? parsed.items
          : (Array.isArray(parsed?.detected_products) ? parsed.detected_products : []);

        if (rawItems.length === 0) {
          return NextResponse.json(
            {
              error_code: 'NO_PRODUCTS_FOUND',
              message: language === 'it'
                ? 'Nessun prodotto o cartellino prezzo leggibile nell\'immagine.'
                : 'No readable products or price tags found in the image.',
            },
            { status: 422 }
          );
        }

        const detectedProducts: ProductCard[] = rawItems.slice(0, 4).map((item: RawProductItem) =>
          mapItemToProduct(item, dietary)
        );

        let recommendedIdx = typeof parsed?.recommended_index === 'number'
          ? parsed.recommended_index
          : detectedProducts.findIndex(p => p.matches_constraints);
        if (recommendedIdx < 0 || recommendedIdx >= detectedProducts.length) {
          recommendedIdx = Math.max(0, detectedProducts.findIndex(p => p.matches_constraints));
        }

        const finalResult: ScanResult = {
          items: rawItems.slice(0, 4),
          detected_products: detectedProducts,
          recommended_product_index: recommendedIdx,
          copilot_tip: parsed?.copilot_tip || null,
          decision_reason: parsed?.copilot_tip || (language === 'it'
            ? `Rilevati ${detectedProducts.length} prodotti in primo piano.`
            : `Detected ${detectedProducts.length} prominent products in foreground.`),
          is_blurry_or_obscured: false,
          model_used: model,
          latency_ms: Date.now() - startTime,
        };

        return NextResponse.json(finalResult, { status: 200 });
      } catch (err: unknown) {
        const errObj = err as { name?: string; message?: string };
        if (errObj?.name === 'TimeoutError' || errObj?.name === 'AbortError') {
          isTimeout = true;
        } else {
          lastErrorMsg = errObj?.message || String(err);
        }
      }
    }
  }

  if (isQuotaExceeded) {
    return NextResponse.json(
      {
        error_code: 'QUOTA_EXCEEDED',
        message: language === 'it'
          ? 'Limite richieste gratuite Gemini API raggiunto. Riprova tra 1 minuto.'
          : 'Gemini free API quota reached for this minute. Please retry in 1 minute.',
      },
      { status: 429 }
    );
  }

  if (isTimeout) {
    return NextResponse.json(
      {
        error_code: 'TIMEOUT_TOO_DENSE',
        message: language === 'it'
          ? 'L\'immagine richiede troppo tempo. Inquadra da più vicino 1–3 prodotti.'
          : 'The scan took too long. Move closer and frame 1–3 products.',
      },
      { status: 408 }
    );
  }

  if (isAuthError) {
    return NextResponse.json(
      {
        error_code: 'AUTH_ERROR',
        message: language === 'it'
          ? 'Chiave API Gemini non valida o scaduta nelle variabili d\'ambiente.'
          : 'Gemini API key is invalid or expired in environment variables.',
      },
      { status: 401 }
    );
  }

  return NextResponse.json(
    {
      error_code: 'SCAN_FAILED',
      message: lastErrorMsg || (language === 'it' ? 'Errore durante l\'analisi dello scaffale.' : 'Error during shelf scan.'),
    },
    { status: 500 }
  );
}
