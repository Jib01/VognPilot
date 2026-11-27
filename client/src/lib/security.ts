export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const ALLOWED_DIETARY_FILTERS = new Set([
  'vegetarian',
  'vegan',
  'organic',
  'lactose_free',
  'gluten_free',
]);

// ~3 MB binary image limit (~4M base64 chars)
export const MAX_BASE64_LENGTH = 4_200_000;

interface RateLimitBucket {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitBucket>();
const dailyGlobalCounter = {
  dayKey: '',
  count: 0,
};

const MAX_STORE_KEYS = 5000;

export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp.slice(0, 64);
  return 'unknown';
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

export function checkSlidingRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitResult {
  if (rateLimitStore.size > MAX_STORE_KEYS) {
    // Evict stale entries to prevent unbounded memory growth
    for (const [k, bucket] of rateLimitStore.entries()) {
      const fresh = bucket.timestamps.filter(ts => now - ts < windowMs);
      if (fresh.length === 0) {
        rateLimitStore.delete(k);
      } else {
        bucket.timestamps = fresh;
      }
      if (rateLimitStore.size <= MAX_STORE_KEYS / 2) break;
    }
  }

  const bucket = rateLimitStore.get(key) || { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter(ts => now - ts < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    rateLimitStore.set(key, bucket);
    return { allowed: false, retryAfterSeconds, remaining: 0 };
  }

  bucket.timestamps.push(now);
  rateLimitStore.set(key, bucket);
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: Math.max(0, limit - bucket.timestamps.length),
  };
}

export function checkDailyGlobalCap(maxDailyRequests: number, now = Date.now()): boolean {
  if (maxDailyRequests <= 0) return true;
  const dayKey = new Date(now).toISOString().slice(0, 10);
  if (dailyGlobalCounter.dayKey !== dayKey) {
    dailyGlobalCounter.dayKey = dayKey;
    dailyGlobalCounter.count = 0;
  }
  if (dailyGlobalCounter.count >= maxDailyRequests) {
    return false;
  }
  dailyGlobalCounter.count += 1;
  return true;
}

export function resetSecurityCountersForTests(): void {
  rateLimitStore.clear();
  dailyGlobalCounter.dayKey = '';
  dailyGlobalCounter.count = 0;
}

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Non-browser clients (curl, native apps, same-origin server calls)

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!host) return false;

  try {
    const parsedOrigin = new URL(origin);
    const allowedExtra = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    if (allowedExtra.includes(parsedOrigin.origin.toLowerCase())) {
      return true;
    }

    return parsedOrigin.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function validateImagePayload(
  base64: string,
  mimeType: string
):
  | { valid: true; normalizedMime: string }
  | { valid: false; status: number; code: string; messageEn: string; messageDa: string; messageIt: string } {
  const cleanMime = (mimeType || 'image/jpeg').toLowerCase().trim();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(cleanMime)) {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_MIME',
      messageEn: 'Unsupported image format. Use JPEG, PNG, or WebP.',
      messageDa: 'Billedformat understøttes ikke. Brug JPEG, PNG eller WebP.',
      messageIt: 'Formato immagine non supportato. Usa JPEG, PNG o WebP.',
    };
  }

  if (!base64 || typeof base64 !== 'string') {
    return {
      valid: false,
      status: 400,
      code: 'NO_IMAGE',
      messageEn: 'No image provided.',
      messageDa: 'Intet billede modtaget.',
      messageIt: 'Nessuna immagine fornita.',
    };
  }

  if (base64.length > MAX_BASE64_LENGTH) {
    return {
      valid: false,
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      messageEn: 'Image file is too large (max 3 MB).',
      messageDa: 'Billedfilen er for stor (maks. 3 MB).',
      messageIt: 'Immagine troppo pesante (massimo 3 MB).',
    };
  }

  // Decode first 16 bytes to verify real image magic bytes (blocks HTML/SVG/script spoofing)
  let headerBytes: Buffer;
  try {
    const prefix = base64.slice(0, 32);
    headerBytes = Buffer.from(prefix, 'base64');
  } catch {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_IMAGE',
      messageEn: 'Corrupted image data.',
      messageDa: 'Ødelagte billeddata.',
      messageIt: 'Dati immagine non validi.',
    };
  }

  if (headerBytes.length < 4) {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_IMAGE',
      messageEn: 'Image payload too small or invalid.',
      messageDa: 'Billedet er for lille eller ugyldigt.',
      messageIt: 'Immagine troppo piccola o non valida.',
    };
  }

  const isJpeg = headerBytes[0] === 0xff && headerBytes[1] === 0xd8 && headerBytes[2] === 0xff;
  const isPng =
    headerBytes[0] === 0x89 &&
    headerBytes[1] === 0x50 &&
    headerBytes[2] === 0x4e &&
    headerBytes[3] === 0x47;
  const isWebp =
    headerBytes.length >= 12 &&
    headerBytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    headerBytes.subarray(8, 12).toString('ascii') === 'WEBP';

  if (!isJpeg && !isPng && !isWebp) {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_IMAGE_SIGNATURE',
      messageEn: 'File content does not match a valid JPEG, PNG, or WebP image.',
      messageDa: 'Filindholdet matcher ikke et gyldigt JPEG-, PNG- eller WebP-billede.',
      messageIt: 'Il contenuto del file non corrisponde a un\'immagine JPEG, PNG o WebP valida.',
    };
  }

  return {
    valid: true,
    normalizedMime: cleanMime === 'image/jpg' ? 'image/jpeg' : cleanMime,
  };
}

export function sanitizeUserText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input
    // Remove control characters, zero-width chars, and newlines that could break prompt sections
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/[`"{}<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeDietaryFilters(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const unique = new Set<string>();
  for (const item of input) {
    if (typeof item === 'string') {
      const normalized = item.trim().toLowerCase();
      if (ALLOWED_DIETARY_FILTERS.has(normalized)) {
        unique.add(normalized);
      }
    }
  }
  return Array.from(unique);
}

export function redactSecrets(message: string): string {
  return message
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[REDACTED_KEY]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]');
}

export function rateLimitResponse(retryAfterSeconds: number, language: 'en' | 'da' | 'it') {
  const message =
    language === 'it'
      ? `Troppe richieste. Riprova tra ${retryAfterSeconds} secondi.`
      : language === 'da'
      ? `For mange forespørgsler. Prøv igen om ${retryAfterSeconds} sekunder.`
      : `Too many requests. Please retry in ${retryAfterSeconds} seconds.`;

  return Response.json(
    {
      error_code: 'RATE_LIMITED',
      message,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
      },
    }
  );
}
