import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 25;

export async function POST(request: NextRequest) {
  const rawApiKeys = (process.env.GEMINI_API_KEY || '').trim();
  const apiKeys = rawApiKeys.split(',').map(k => k.trim()).filter(Boolean);

  if (apiKeys.length === 0) {
    return NextResponse.json({ error: 'API key missing' }, { status: 401 });
  }

  interface AskBody {
    question?: unknown;
    image?: unknown;
    language?: unknown;
    dietary?: unknown;
    products?: Array<{
      label?: string;
      danish_term?: string;
      package_price_dkk?: number | null;
      unit_price_dkk?: number | null;
    }>;
  }

  let body: AskBody;
  try {
    body = (await request.json()) as AskBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const base64Raw = typeof body.image === 'string' ? body.image : '';
  const base64 = base64Raw.includes('base64,') ? base64Raw.split('base64,')[1] : base64Raw;
  const language = body.language === 'it' ? 'it' : 'en';
  const targetLang = language === 'it' ? 'Italian' : 'English';
  const dietary: string[] = Array.isArray(body.dietary) ? body.dietary.filter((d): d is string => typeof d === 'string') : [];
  const productsContext = Array.isArray(body.products) ? body.products : [];

  if (!question) {
    return NextResponse.json({ error: 'Question is required' }, { status: 400 });
  }

  const prompt = `You are VognPilot, a fast Danish supermarket shopping assistant.
Answer the shopper's question in ${targetLang} in 2–4 concise, practical sentences (no markdown bloat).
User dietary profile: ${dietary.length > 0 ? dietary.join(', ') : 'none'}.
Detected shelf products: ${JSON.stringify(productsContext.map((p) => ({ name: p.label, danish: p.danish_term, price_dkk: p.package_price_dkk, unit_price: p.unit_price_dkk })))}.
Shopper question: "${question}"`;

  const models = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-3.5-flash-lite'];

  type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

  for (const apiKey of apiKeys) {
    for (const model of models) {
      try {
        const parts: GeminiPart[] = [{ text: prompt }];
        if (base64) {
          parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
        }

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 350,
                thinkingConfig: { thinkingLevel: 'minimal' },
              },
            }),
            signal: AbortSignal.timeout(8000),
          }
        );

        if (!res.ok) continue;
        const data = await res.json();
        const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (answer) {
          return NextResponse.json({ answer, model }, { status: 200 });
        }
      } catch {
        // try next model
      }
    }
  }

  return NextResponse.json(
    {
      error: language === 'it'
        ? 'Impossibile ottenere una risposta al momento. Riprova tra qualche secondo.'
        : 'Could not get an answer right now. Please try again in a moment.',
    },
    { status: 503 }
  );
}
