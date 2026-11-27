/**
 * Central VognPilot Rate-Limit & Quota Configuration
 * --------------------------------------------------
 * Modifica questo file (oppure imposta le variabili d'ambiente su Vercel)
 * per gestire i limiti su minuti, ora, giorno e mese nel rispetto del
 * Free Tier di Gemini API (~1.000 RPD totali tra 3.1 Flash-Lite e 3.5 Flash-Lite).
 */

export type UserTier = 'guest';
export type QuotaEndpoint = 'scan' | 'ask';

export interface EndpointQuotaConfig {
  /** Finestra breve anti-raffica in minuti */
  windowMinutes: number;
  /** Richieste massime per singolo IP nella finestra breve */
  perWindow: number;
  /** Richieste massime per singolo IP all'ora */
  perHour: number;
  /** Richieste massime per singolo IP al giorno (UTC) */
  perDay: number;
  /** Richieste massime per singolo IP al mese (UTC) */
  perMonth: number;
}

export interface GlobalSafetyCapConfig {
  /** Tetto globale giornaliero condiviso su tutto il sito */
  perDay: number;
  /** Tetto globale mensile condiviso su tutto il sito */
  perMonth: number;
}

export interface TierLimitsConfig {
  scan: EndpointQuotaConfig;
  ask: EndpointQuotaConfig;
  bypassGlobalCap?: boolean;
}

export interface LimitsPolicy {
  tiers: Record<UserTier, TierLimitsConfig>;
  global: Record<QuotaEndpoint, GlobalSafetyCapConfig>;
  /** Opzionale: abilita una fascia oraria UTC per le scansioni */
  publicScheduleUtc: {
    enabled: boolean;
    startHour: number;
    endHour: number;
  };
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getLimitsPolicy(): LimitsPolicy {
  return {
    tiers: {
      // Regole uniformi per tutti i visitatori (tracciati per IP su Neon Postgres)
      guest: {
        scan: {
          windowMinutes: envInt('LIMIT_GUEST_SCAN_WINDOW_MIN', 10),
          perWindow: envInt('LIMIT_GUEST_SCAN_WINDOW', 6),
          perHour: envInt('LIMIT_GUEST_SCAN_HOUR', 15),
          perDay: envInt('LIMIT_GUEST_SCAN_DAY', 30),
          perMonth: envInt('LIMIT_GUEST_SCAN_MONTH', 250),
        },
        ask: {
          windowMinutes: envInt('LIMIT_GUEST_ASK_WINDOW_MIN', 10),
          perWindow: envInt('LIMIT_GUEST_ASK_WINDOW', 10),
          perHour: envInt('LIMIT_GUEST_ASK_HOUR', 25),
          perDay: envInt('LIMIT_GUEST_ASK_DAY', 50),
          perMonth: envInt('LIMIT_GUEST_ASK_MONTH', 400),
        },
        bypassGlobalCap: false,
      },
    },

    // Tetto globale di sicurezza per restare sempre dentro il Free Tier Gemini (500+500 RPD)
    global: {
      scan: {
        perDay: envInt('MAX_DAILY_SCANS', 400),
        perMonth: envInt('MAX_MONTHLY_SCANS', 9000),
      },
      ask: {
        perDay: envInt('MAX_DAILY_ASKS', 450),
        perMonth: envInt('MAX_MONTHLY_ASKS', 10000),
      },
    },

    publicScheduleUtc: {
      enabled: process.env.LIMIT_SCHEDULE_ENABLED === 'true',
      startHour: envInt('LIMIT_SCHEDULE_START_UTC', 6),
      endHour: envInt('LIMIT_SCHEDULE_END_UTC', 23),
    },
  };
}
