import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SHELF_PROMPT = `You are an expert Danish grocery store product scanner. Analyze this shelf image and identify all visible products with price tags.

Return a JSON object with this exact structure:
{
  "detected_products": [
    {
      "label": "Product name in English",
      "danish_term": "Original Danish product name from label",
      "package_price_dkk": 13.95,
      "unit_price_dkk": null,
      "pant_fee_dkk": 1.0,
      "multipack_offer": null,
      "is_organic": true,
      "is_plant_based": false,
      "is_lactose_free": false,
      "is_gluten_free": false,
      "matches_constraints": false,
      "protein_g_per_100g": 3.2,
      "fat_percentage": 3.5,
      "sugar_g_per_100g": 4.8
    }
  ],
  "recommended_product_index": 0,
  "decision_reason": "Brief reason why this product is recommended",
  "is_blurry_or_obscured": false
}

Rules:
- Extract ALL clearly visible products with price tags
- package_price_dkk is the total pack price shown on the shelf tag
- unit_price_dkk is price per kg/L/piece if shown separately
- pant_fee_dkk: 1.0 for small bottles/cans (≤0.5L), 3.0 for large (>0.5L), null if no pant
- is_organic: true if the Danish Ø-label (red Ø) is visible
- is_plant_based: true if "plantebaseret", "vegan", or similar is on label  
- is_lactose_free: true if "laktosefri" is visible
- is_gluten_free: true if "glutenfri" is visible
- matches_constraints: true if this product matches the user dietary preferences provided
- For nutrition: extract from visible label if available, otherwise null
- recommended_product_index: index of best product for the user based on dietary constraints (null if no constraints)
- If image is blurry or products are not readable, set is_blurry_or_obscured: true and return empty detected_products
- Return ONLY the JSON object, no markdown, no explanation`;

export async function POST(request: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const preferencesStr = formData.get('preferences') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    const preferences = preferencesStr ? JSON.parse(preferencesStr) : {};
    const dietary: string[] = preferences.dietary_lifestyle || [];
    const currency = preferences.currency || { primary: 'DKK', fixed_rate: 7.46 };

    // Build dietary context
    let dietaryContext = '';
    if (dietary.length > 0) {
      dietaryContext = `\n\nUser dietary preferences: ${dietary.join(', ')}. Mark matches_constraints: true for products that satisfy ALL these preferences.`;
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mimeType = (file.type && file.type.startsWith('image/')) ? file.type : 'image/jpeg';

    // Use gemini-2.0-flash for speed (no thinking overhead)
    const model = genai.getGenerativeModel({
      model: 'gemini-2.0-flash',
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 2048,
      },
    });

    const result = await model.generateContent([
      { text: SHELF_PROMPT + dietaryContext + `\n\nPrimary display currency: ${currency.primary} (rate: 1 EUR = ${currency.fixed_rate} DKK)` },
      { inlineData: { mimeType, data: base64 } },
    ]);

    const responseText = result.response.text();
    
    // Parse JSON — strip any accidental markdown fences
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const data = JSON.parse(cleaned);

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('[Scan API Route] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    // If JSON parse error, still return a valid error response
    if (message.includes('JSON')) {
      return NextResponse.json(
        { detected_products: [], is_blurry_or_obscured: true, decision_reason: null, recommended_product_index: null },
        { status: 200 }
      );
    }
    
    return NextResponse.json({ error: 'Scan failed. Please try again.' }, { status: 500 });
  }
}
