import { NextRequest, NextResponse } from 'next/server';
import { ProductCard, ScanResult } from '@/types/vision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PROMPT = `Analyze this Danish supermarket image. Identify AT MOST the 6 clearest, most prominent grocery products.
Return ONLY valid JSON with this exact schema:
{
  "items": [
    {
      "id": "1",
      "danish_name": "Product name on label in Danish",
      "english_name": "English translation + size (e.g. Organic Semi-Skimmed Milk 1L)",
      "price_dkk": 14.5,
      "pant_dkk": 0,
      "category": "Dairy / Drinks / Snacks / Bakery / Other",
      "is_organic": false,
      "is_lactose_free": false,
      "is_vegan": false,
      "is_gluten_free": false,
      "summary": "Short 8-word note on ingredients or dietary traits"
    }
  ]
}
Rules:
- Maximum 6 items total.
- Do NOT output bounding boxes.
- If a price tag is unclear, estimate typical Danish price in DKK.
- Add pant_dkk (1, 1.5, or 3) only for cans/bottles.`;

const DEMO_ITEMS = [
  {
    id: "1",
    danish_name: "Arla Økologisk Letmælk 1L",
    english_name: "Arla Organic Semi-Skimmed Milk 1L",
    price_dkk: 14.50,
    pant_dkk: 0,
    category: "Dairy",
    is_organic: true,
    is_lactose_free: false,
    is_vegan: false,
    is_gluten_free: true,
    summary: "Danish organic semi-skimmed fresh milk",
  },
  {
    id: "2",
    danish_name: "Faxe Kondi 33cl",
    english_name: "Faxe Kondi Lemon/Lime Soda 330ml",
    price_dkk: 8.50,
    pant_dkk: 1.0,
    category: "Drinks",
    is_organic: false,
    is_lactose_free: true,
    is_vegan: true,
    is_gluten_free: true,
    summary: "Classic Danish lemon soda with Pant A deposit",
  },
  {
    id: "3",
    danish_name: "Pågen Gifflar Kanel 260g",
    english_name: "Pågen Cinnamon Swirls 260g",
    price_dkk: 22.00,
    pant_dkk: 0,
    category: "Bakery",
    is_organic: false,
    is_lactose_free: false,
    is_vegan: false,
    is_gluten_free: false,
    summary: "Nordic cinnamon mini pastry rolls",
  },
  {
    id: "4",
    danish_name: "Lurpak Smørbar 200g",
    english_name: "Lurpak Salted Spreadable Butter 200g",
    price_dkk: 26.95,
    pant_dkk: 0,
    category: "Dairy",
    is_organic: false,
    is_lactose_free: false,
    is_vegan: false,
    is_gluten_free: true,
    summary: "Classic salted Danish churned spreadable butter",
  },
];

function mapItemToProduct(item: any, preferences: any): ProductCard {
  const dietary = preferences?.dietary_lifestyle || [];
  let matches = true;
  if (dietary.includes('organic') && !item.is_organic) matches = false;
  if (dietary.includes('vegan') && !item.is_vegan) matches = false;
  if (dietary.includes('lactose_free') && !item.is_lactose_free) matches = false;
  if (dietary.includes('gluten_free') && !item.is_gluten_free) matches = false;

  return {
    label: item.english_name || item.label || item.danish_name || 'Danish Product',
    danish_term: item.danish_name || item.danish_term || item.english_name || '',
    package_price_dkk: Number(item.price_dkk ?? item.package_price_dkk ?? 0),
    unit_price_dkk: item.unit_price_dkk != null ? Number(item.unit_price_dkk) : null,
    pant_fee_dkk: item.pant_dkk != null ? Number(item.pant_dkk) : (item.pant_fee_dkk != null ? Number(item.pant_fee_dkk) : null),
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

function buildDemoScanResponse(notice: string, preferences: any): ScanResult {
  const detected = DEMO_ITEMS.map(i => mapItemToProduct(i, preferences));
  const recommendedIdx = detected.findIndex(p => p.matches_constraints);

  return {
    is_demo_fallback: true,
    notice,
    items: DEMO_ITEMS,
    detected_products: detected,
    recommended_product_index: recommendedIdx >= 0 ? recommendedIdx : 0,
    decision_reason: "Scaffale dimostrativo danese caricato con successo.",
    is_blurry_or_obscured: false,
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
    } else {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const preferencesStr = formData.get('preferences') as string | null;

      if (file) {
        const bytes = await file.arrayBuffer();
        base64 = Buffer.from(bytes).toString('base64');
        mimeType = (file.type && file.type.startsWith('image/')) ? file.type : 'image/jpeg';
      }
      preferences = preferencesStr ? JSON.parse(preferencesStr) : {};
    }
  } catch (parseErr) {
    console.error('[Scan Route] Request body parse failed:', parseErr);
    return NextResponse.json({ error: 'Payload richiesta non valido' }, { status: 400 });
  }

  // If no API key configured, gracefully fall back to demo items
  if (apiKeys.length === 0) {
    console.warn('[Scan Route] No GEMINI_API_KEY configured. Returning demo shelf.');
    return NextResponse.json(
      buildDemoScanResponse("Chiave Gemini non configurata: caricati dati demo dello scaffale danese", preferences),
      { status: 200 }
    );
  }

  if (!base64 || base64.length === 0) {
    return NextResponse.json({ error: 'Nessuna immagine fornita' }, { status: 400 });
  }

  // Official models in order of latency and quota efficiency
  const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash'];
  let lastErrorMsg = '';
  let isRateLimited = false;

  for (const apiKey of apiKeys) {
    for (const model of MODELS) {
      try {
        console.log(`[Scan Route] Calling model ${model}...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: PROMPT },
                  { inlineData: { mimeType, data: base64 } }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 800,
              responseMimeType: 'application/json'
            }
          }),
          signal: AbortSignal.timeout(12000), // Max 12 seconds per call
        });

        if (res.status === 429) {
          isRateLimited = true;
          console.warn(`[Scan Route] ${model} rate limited (429).`);
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

        const detectedProducts: ProductCard[] = rawItems.slice(0, 6).map((item: any) =>
          mapItemToProduct(item, preferences)
        );

        const recommendedIdx = detectedProducts.findIndex(p => p.matches_constraints);

        const finalResult: ScanResult = {
          items: rawItems,
          detected_products: detectedProducts,
          recommended_product_index: recommendedIdx >= 0 ? recommendedIdx : (detectedProducts.length > 0 ? 0 : null),
          decision_reason: detectedProducts.length > 0 ? `Trovati ${detectedProducts.length} prodotti sullo scaffale.` : "Nessun prodotto chiaro identificato.",
          is_blurry_or_obscured: detectedProducts.length === 0,
        };

        return NextResponse.json(finalResult, { status: 200 });
      } catch (err: any) {
        lastErrorMsg = err?.message || String(err);
        console.warn(`[Scan Route] ${model} error:`, lastErrorMsg);
      }
    }
  }

  // Graceful fallback if quota exceeded or all models timed out
  console.warn('[Scan Route] All model attempts failed or timed out. Serving demo fallback.');
  const notice = isRateLimited
    ? "Quota API gratuita in pausa: caricati dati dimostrativi dello scaffale danese"
    : "Connessione API rallentata: caricati dati dimostrativi dello scaffale danese";

  return NextResponse.json(
    buildDemoScanResponse(notice, preferences),
    { status: 200 }
  );
}
