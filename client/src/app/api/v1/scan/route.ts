import { NextRequest, NextResponse } from 'next/server';
import { ProductCard, ScanResult } from '@/types/vision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function buildPrompt(targetLang: string) {
  return `Analyze this Danish grocery image.
CRITICAL SPEED RULE: Focus ONLY on the 1 to 4 largest, clearest products in the center/foreground. Completely ignore small background items or crowded distant shelves.
TRANSLATION RULE: Translate product names and summaries into ${targetLang}.

Return ONLY valid JSON matching this exact schema:
{
  "items": [
    {
      "id": "1",
      "danish_name": "Original Danish name on label",
      "english_name": "Clear translation in ${targetLang} + weight/volume (e.g. Latte Parzialmente Scremato Bio 1L / Organic Semi-Skimmed Milk 1L)",
      "price_dkk": 14.5,
      "pant_dkk": 0,
      "category": "Dairy / Drinks / Meat / Snacks / Bakery / Produce / Other",
      "is_organic": false,
      "is_lactose_free": false,
      "is_vegan": false,
      "is_gluten_free": false,
      "summary": "Max 10 words in ${targetLang} describing the product and key dietary info"
    }
  ]
}
Rules:
- Maximum 4 items.
- No bounding boxes.
- Set pant_dkk to 1, 1.5, or 3 ONLY if it is a returnable bottle/can with Danish Pant, otherwise 0.`;
}

function mapItemToProduct(item: any, preferences: any): ProductCard {
  const dietary = preferences?.dietary_lifestyle || [];
  let matches = true;
  if (dietary.includes('organic') && !item.is_organic) matches = false;
  if (dietary.includes('vegan') && !item.is_vegan) matches = false;
  if (dietary.includes('lactose_free') && !item.is_lactose_free) matches = false;
  if (dietary.includes('gluten_free') && !item.is_gluten_free) matches = false;

  const pant = Number(item.pant_dkk ?? item.pant_fee_dkk ?? 0);

  return {
    label: item.english_name || item.danish_name || item.label || 'Danish Product',
    danish_term: item.danish_name || item.danish_term || item.english_name || '',
    package_price_dkk: Number(item.price_dkk ?? item.package_price_dkk ?? 0),
    unit_price_dkk: item.unit_price_dkk != null ? Number(item.unit_price_dkk) : null,
    pant_fee_dkk: pant > 0 ? pant : null,
    multipack_offer: item.multipack_offer || null,
    fat_percentage: item.fat_percentage != null ? Number(item.fat_percentage) : null,
    sugar_g_per_100g: item.sugar_g_per_100g != null ? Number(item.sugar_g_per_100g) : null,
    protein_g_per_100g: item.protein_g_per_100g != null ? Number(item.protein_g_per_100g) : null,
    is_organic: Boolean(item.is_organic),
    is_lactose_free: Boolean(item.is_lactose_free),
    is_plant_based: Boolean(item.is_vegan || item.is_plant_based),
    is_gluten_free: Boolean(item.is_gluten_free),
    matches_constraints: matches,
    summary: item.summary || null,
  };
}

export async function POST(request: NextRequest) {
  const rawApiKeys = (process.env.GEMINI_API_KEY || '').trim();
  const apiKeys = rawApiKeys
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);

  let preferences: any = {};
  let base64 = '';
  let mimeType = 'image/jpeg';
  let language = 'en';

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
      { error_code: 'BAD_REQUEST', message: 'Payload richiesta non valido' },
      { status: 400 }
    );
  }

  // Validate API Key presence
  if (apiKeys.length === 0) {
    console.error('[Scan Route] No GEMINI_API_KEY configured in environment.');
    return NextResponse.json(
      {
        error_code: 'AUTH_ERROR',
        message: language === 'it'
          ? 'Chiave API Gemini non valida o mancante nelle variabili d\'ambiente.'
          : 'Gemini API key is missing or invalid in environment variables.',
      },
      { status: 401 }
    );
  }

  if (!base64 || base64.length === 0) {
    return NextResponse.json(
      {
        error_code: 'NO_IMAGE',
        message: language === 'it' ? 'Nessuna immagine fornita' : 'No image provided',
      },
      { status: 400 }
    );
  }

  const targetLang = language === 'it' ? 'Italian' : 'English';
  const prompt = buildPrompt(targetLang);

  // Time budget: Max 14 seconds total on server (7.5s attempt 1 + 6.5s attempt 2)
  const ATTEMPTS = [
    { model: 'gemini-3.5-flash-lite', timeoutMs: 7500 },
    { model: 'gemini-3.6-flash', timeoutMs: 6500 },
  ];

  let isQuotaExceeded = false;
  let isTimeout = false;
  let isAuthError = false;
  let lastErrorMsg = '';

  for (const apiKey of apiKeys) {
    for (const attempt of ATTEMPTS) {
      const { model, timeoutMs } = attempt;
      try {
        console.log(`[Scan Route] Calling ${model} (timeout ${timeoutMs}ms)...`);
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
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 800,
              responseMimeType: 'application/json',
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (res.status === 429) {
          isQuotaExceeded = true;
          console.warn(`[Scan Route] ${model} 429 quota reached.`);
          continue;
        }

        if (res.status === 400 || res.status === 401 || res.status === 403) {
          const errText = await res.text();
          console.error(`[Scan Route] ${model} auth error (${res.status}):`, errText);
          if (errText.includes('API_KEY') || errText.includes('identity') || errText.includes('unregistered')) {
            isAuthError = true;
          }
          lastErrorMsg = errText.slice(0, 150);
          continue;
        }

        if (!res.ok) {
          const errText = await res.text();
          console.warn(`[Scan Route] ${model} failed (${res.status}):`, errText);
          lastErrorMsg = `${model} ${res.status}: ${errText.slice(0, 150)}`;
          continue;
        }

        const data = await res.json();
        const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!candidateText) {
          console.warn(`[Scan Route] ${model} returned empty candidate text`);
          continue;
        }

        const cleaned = candidateText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const rawItems = Array.isArray(parsed?.items)
          ? parsed.items
          : (Array.isArray(parsed?.detected_products) ? parsed.detected_products : []);

        // If no products were found in image: return 422
        if (rawItems.length === 0) {
          console.log('[Scan Route] 0 items found in image. Returning 422 NO_PRODUCTS_FOUND.');
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

        // Limit strictly to 4 items max
        const detectedProducts: ProductCard[] = rawItems.slice(0, 4).map((item: any) =>
          mapItemToProduct(item, preferences)
        );

        const recommendedIdx = detectedProducts.findIndex(p => p.matches_constraints);

        const finalResult: ScanResult = {
          items: rawItems.slice(0, 4),
          detected_products: detectedProducts,
          recommended_product_index: recommendedIdx >= 0 ? recommendedIdx : 0,
          decision_reason: language === 'it'
            ? `Rilevati ${detectedProducts.length} prodotti in primo piano.`
            : `Detected ${detectedProducts.length} prominent products in foreground.`,
          is_blurry_or_obscured: false,
        };

        return NextResponse.json(finalResult, { status: 200 });
      } catch (err: any) {
        if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
          isTimeout = true;
          console.warn(`[Scan Route] ${model} timed out after ${timeoutMs}ms`);
        } else {
          lastErrorMsg = err?.message || String(err);
          console.warn(`[Scan Route] ${model} error:`, lastErrorMsg);
        }
      }
    }
  }

  // Handle specific structured failure modes without hiding behind mock data
  if (isQuotaExceeded) {
    return NextResponse.json(
      {
        error_code: 'QUOTA_EXCEEDED',
        message: language === 'it'
          ? 'Limite di richieste gratuite Gemini API raggiunto. Riprova tra 1 minuto.'
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
          ? 'L\'immagine contiene troppi elementi o richiede troppo tempo. Inquadra da più vicino solo 1-3 prodotti.'
          : 'The image contains too many items or took too long. Move closer and frame 1-3 products.',
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
