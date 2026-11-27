"use client";

import { useState } from 'react';
import {
  ShoppingCart,
  RefreshCw,
  Info,
  Sparkles,
  X,
  Plus,
  Minus,
  AlertTriangle,
  MessageSquare,
  Send,
  CheckCircle2,
  Scale,
} from 'lucide-react';
import { ProductCard, ScanResult } from '../types/vision';
import { GroceryItem } from '../lib/db';
import { Language, getTranslation } from '../lib/translations';

interface Props {
  scan: ScanResult;
  imageUri: string;
  imageBase64?: string | null;
  cartItems: GroceryItem[];
  onAddToList: (prod: ProductCard) => void;
  onUpdateCartQty: (id: number, currentQty: number, delta: number) => void;
  onRemoveCartItem: (id: number) => void;
  onNewScan: () => void;
  onViewCart?: () => void;
  convertDKKtoEUR: (dkk: number) => string;
  language?: Language;
  primaryCurrency?: "DKK" | "EUR";
  dietaryFilters?: string[];
}

export function ScanResultSheet({
  scan,
  imageUri,
  imageBase64,
  cartItems,
  onAddToList,
  onUpdateCartQty,
  onRemoveCartItem,
  onNewScan,
  onViewCart,
  convertDKKtoEUR,
  language = 'en',
  primaryCurrency = 'DKK',
  dietaryFilters = [],
}: Props) {
  const t = getTranslation(language);
  const [expandedNutrition, setExpandedNutrition] = useState<number | null>(null);
  const [question, setQuestion] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  const formatPrice = (dkk: number | null | undefined) => {
    if (dkk == null) return null;
    const eur = convertDKKtoEUR(dkk);
    if (primaryCurrency === 'EUR') {
      return { primary: `€${eur}`, secondary: `${dkk.toFixed(2)} kr` };
    }
    return { primary: `${dkk.toFixed(2)} kr`, secondary: `≈ €${eur}` };
  };

  const formatUnitPrice = (unitDkk: number | null | undefined, measure?: string | null) => {
    if (unitDkk == null || unitDkk <= 0) return null;
    const unitLabel = measure || 'kg';
    if (primaryCurrency === 'EUR') {
      return `€${convertDKKtoEUR(unitDkk)}/${unitLabel}`;
    }
    return `${unitDkk.toFixed(2)} kr/${unitLabel}`;
  };

  const hasProducts = Array.isArray(scan.detected_products) && scan.detected_products.length > 0;
  const totalCartItems = cartItems
    .filter(i => (i.status || 'in_cart') === 'in_cart')
    .reduce((acc, i) => acc + (i.quantity || 1), 0);

  const handleAskAI = async (qText?: string) => {
    const query = (qText ?? question).trim();
    if (!query || askLoading) return;
    setAskLoading(true);
    setAskError(null);
    if (!qText) setQuestion('');

    try {
      const res = await fetch('/api/v1/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: query,
          image: imageBase64 || undefined,
          products: scan.detected_products,
          language,
          dietary: dietaryFilters,
        }),
        signal: AbortSignal.timeout(12000),
      });
      const data = await res.json();
      if (!res.ok) {
        setAskError(data?.error || 'Error');
      } else {
        setAiAnswer(data.answer);
      }
    } catch {
      setAskError(language === 'it' ? 'Richiesta scaduta, riprova.' : 'Request timed out, please retry.');
    } finally {
      setAskLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 text-zinc-900 dark:bg-[#0b0b0e] dark:text-zinc-100 transition-colors">

      {/* Notice Banner (Demo Shelf) */}
      {Boolean(scan.notice) ? (
        <div className="bg-emerald-50 dark:bg-emerald-950/70 border-b border-emerald-200 dark:border-emerald-800/60 px-4 py-2 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2 shrink-0">
          <span className="text-sm">⚡</span>
          <span className="font-semibold">{scan.notice}</span>
        </div>
      ) : null}

      {/* Compact photo + header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-200 dark:border-white/10 bg-white/95 dark:bg-[#121216]/95 backdrop-blur-md shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUri || '/icon-512.svg'}
          alt="Scanned shelf"
          className="w-12 h-12 rounded-xl object-cover border border-zinc-200 dark:border-zinc-800 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-extrabold text-zinc-900 dark:text-zinc-100 text-sm sm:text-base leading-tight truncate">
              {hasProducts ? t.productsFound(scan.detected_products.length) : t.couldNotRead}
            </h2>
            {typeof scan.latency_ms === 'number' && scan.latency_ms > 0 ? (
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/50 shrink-0">
                {(scan.latency_ms / 1000).toFixed(1)}s
              </span>
            ) : null}
          </div>
          {Boolean(scan.decision_reason) && hasProducts ? (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">{scan.decision_reason}</p>
          ) : null}
        </div>
        <button
          onClick={onNewScan}
          className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:text-white border border-zinc-200 dark:border-zinc-700 active:scale-95 transition-all flex-shrink-0"
          title={t.dismiss}
          aria-label={t.dismiss}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Empty / no result state */}
      {!hasProducts ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed max-w-xs">
            {Boolean(scan.is_blurry_or_obscured)
              ? (language === 'it' ? "L'immagine è poco nitida o non contiene prodotti leggibili. Inquadra da più vicino." : "The photo was too blurry or products were hard to read. Move a bit closer and try again.")
              : t.tryCloser}
          </p>
          <button
            onClick={onNewScan}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 active:scale-95 transition-all shadow-md"
          >
            <RefreshCw className="w-4 h-4" />
            {t.retakePhoto}
          </button>
        </div>
      ) : null}

      {/* Product cards + Copilot Ask AI */}
      {hasProducts ? (
        <div className="flex-1 overflow-y-auto hide-scrollbar px-3 py-3 space-y-3 pb-24">
          {Boolean(scan.copilot_tip || scan.decision_reason) ? (
            <div className="rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/30 dark:border-emerald-500/25 px-3.5 py-2.5 flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  {t.whyRecommended}
                </p>
                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 leading-snug mt-0.5">
                  {scan.copilot_tip || scan.decision_reason}
                </p>
              </div>
            </div>
          ) : null}

          {scan.detected_products.map((prod, idx) => {
            const price = prod.package_price_dkk ?? prod.unit_price_dkk;
            const priceDisplay = formatPrice(price);
            const unitPriceText = formatUnitPrice(prod.unit_price_dkk, prod.unit_measure);
            const isWinner = idx === scan.recommended_product_index;
            const hasNutrition = prod.protein_g_per_100g != null || prod.fat_percentage != null || prod.sugar_g_per_100g != null;
            const nutritionOpen = expandedNutrition === idx;
            const pantFee = Number(prod.pant_fee_dkk || 0);

            // Live match against Dexie cart
            const cartMatch = cartItems.find(
              item => (item.status || 'in_cart') === 'in_cart' && item.name === prod.label
            );
            const qtyInCart = cartMatch?.quantity || 0;

            return (
              <div
                key={idx}
                className={`rounded-2xl border overflow-hidden transition-all shadow-xs ${
                  qtyInCart > 0
                    ? 'border-emerald-500 bg-emerald-50/30 dark:border-emerald-500/80 dark:bg-emerald-950/15'
                    : isWinner
                    ? 'border-emerald-500/60 bg-white dark:border-emerald-600/50 dark:bg-zinc-900'
                    : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                }`}
              >
                <div className="p-3.5 sm:p-4">
                  {/* Badges row */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                    {isWinner ? (
                      <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800/60 text-[10px] font-black px-2 py-0.5 rounded-full">
                        <Sparkles className="w-2.5 h-2.5" /> {t.bestPick}
                      </span>
                    ) : null}
                    {dietaryFilters.length > 0 && prod.matches_constraints && !prod.dietary_warning ? (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800/50 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-2.5 h-2.5" /> {t.bestMatch}
                      </span>
                    ) : null}
                    {Boolean(prod.dietary_warning) ? (
                      <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/60 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        <AlertTriangle className="w-2.5 h-2.5" /> {prod.dietary_warning}
                      </span>
                    ) : null}
                  </div>

                  {/* Product name + Price */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-extrabold text-zinc-900 dark:text-zinc-100 text-base leading-tight">
                        {prod.label}
                      </h3>
                      {Boolean(prod.danish_term) ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">{prod.danish_term}</p>
                      ) : null}
                      {Boolean(prod.summary) ? (
                        <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 leading-snug">{prod.summary}</p>
                      ) : null}
                    </div>

                    {priceDisplay ? (
                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-zinc-900 dark:text-zinc-100 text-lg leading-none">{priceDisplay.primary}</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">{priceDisplay.secondary}</p>
                        {unitPriceText ? (
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-semibold inline-flex items-center gap-0.5 justify-end">
                            <Scale className="w-2.5 h-2.5" /> {unitPriceText}
                          </p>
                        ) : null}
                        {pantFee > 0 ? (
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold">+{pantFee} kr {t.returnable}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {/* Tags row */}
                  <div className="flex flex-wrap gap-1.5 mt-2.5 mb-3">
                    {Boolean(prod.is_organic) ? (
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-900/40 px-2 py-0.5 rounded-md">🌿 {t.organic}</span>
                    ) : null}
                    {Boolean(prod.is_plant_based) ? (
                      <span className="text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-900/40 px-2 py-0.5 rounded-md">🌱 {t.vegan}</span>
                    ) : null}
                    {Boolean(prod.is_lactose_free) ? (
                      <span className="text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-900/40 px-2 py-0.5 rounded-md">🥛 {t.lactoseFree}</span>
                    ) : null}
                    {Boolean(prod.is_gluten_free) ? (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900/40 px-2 py-0.5 rounded-md">🌾 {t.glutenFree}</span>
                    ) : null}
                    {pantFee > 0 ? (
                      <span className="text-[10px] font-bold bg-zinc-100 text-zinc-700 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 px-2 py-0.5 rounded-md">♻️ {t.returnable} ({pantFee} kr)</span>
                    ) : null}
                    {Boolean(prod.multipack_offer) ? (
                      <span className="text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-900/40 px-2 py-0.5 rounded-md truncate max-w-[180px]">🏷️ {prod.multipack_offer}</span>
                    ) : null}
                  </div>

                  {/* LIVE Cart Stepper (Deliveroo-style synced directly to Dexie!) */}
                  {qtyInCart > 0 && cartMatch?.id != null ? (
                    <div className="flex items-center justify-between bg-emerald-600 text-white rounded-xl p-1 shadow-md">
                      <button
                        onClick={() => {
                          if (qtyInCart <= 1) onRemoveCartItem(cartMatch.id!);
                          else onUpdateCartQty(cartMatch.id!, qtyInCart, -1);
                        }}
                        className="w-10 h-9 rounded-lg bg-emerald-700/80 hover:bg-emerald-700 flex items-center justify-center active:scale-90 transition-all"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <div className="text-center">
                        <span className="text-xs font-extrabold tracking-tight block">
                          {qtyInCart} {t.inCartLabel}
                        </span>
                        {price != null && price > 0 ? (
                          <span className="text-[10px] text-emerald-100 font-semibold block leading-none mt-0.5">
                            {primaryCurrency === 'EUR'
                              ? `€${convertDKKtoEUR((price + pantFee) * qtyInCart)}`
                              : `${((price + pantFee) * qtyInCart).toFixed(2)} kr`}
                          </span>
                        ) : null}
                      </div>
                      <button
                        onClick={() => onUpdateCartQty(cartMatch.id!, qtyInCart, 1)}
                        className="w-10 h-9 rounded-lg bg-emerald-700/80 hover:bg-emerald-700 flex items-center justify-center active:scale-90 transition-all"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onAddToList(prod)}
                      className="w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      {t.addToCart}
                    </button>
                  )}

                  {/* Nutrition toggle */}
                  {hasNutrition ? (
                    <button
                      onClick={() => setExpandedNutrition(prev => prev === idx ? null : idx)}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors py-1"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>{nutritionOpen ? t.hideNutrition : t.nutritionFacts}</span>
                    </button>
                  ) : null}
                </div>

                {/* Inline Nutrition Facts */}
                {nutritionOpen && hasNutrition ? (
                  <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 px-4 py-3">
                    <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">{t.per100g}</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {prod.protein_g_per_100g != null ? (
                        <div className="bg-white dark:bg-zinc-900 rounded-xl py-2 border border-zinc-200 dark:border-zinc-800">
                          <span className="block text-[10px] text-zinc-500 font-bold mb-0.5">{t.protein}</span>
                          <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">{prod.protein_g_per_100g}g</span>
                        </div>
                      ) : null}
                      {prod.fat_percentage != null ? (
                        <div className="bg-white dark:bg-zinc-900 rounded-xl py-2 border border-zinc-200 dark:border-zinc-800">
                          <span className="block text-[10px] text-zinc-500 font-bold mb-0.5">{t.fat}</span>
                          <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">{prod.fat_percentage}%</span>
                        </div>
                      ) : null}
                      {prod.sugar_g_per_100g != null ? (
                        <div className="bg-white dark:bg-zinc-900 rounded-xl py-2 border border-zinc-200 dark:border-zinc-800">
                          <span className="block text-[10px] text-zinc-500 font-bold mb-0.5">{t.sugars}</span>
                          <span className="text-sm font-black text-zinc-900 dark:text-zinc-100">{prod.sugar_g_per_100g}g</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* Interactive Copilot Follow-Up ("Ask AI about this shelf") */}
          {!scan.is_demo_fallback ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-200">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{t.askAiTitle}</span>
              </div>

              {/* Quick chips */}
              <div className="flex flex-wrap gap-1.5">
                {t.askAiChips.map((chip, cIdx) => (
                  <button
                    key={cIdx}
                    onClick={() => handleAskAI(chip)}
                    disabled={askLoading}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Input bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAskAI();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={t.askAiPlaceholder}
                  className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={askLoading || !question.trim()}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1 active:scale-95 transition-all shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>

              {askLoading ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-pulse">{t.askAiThinking}</p>
              ) : null}

              {askError ? (
                <p className="text-xs text-rose-500 dark:text-rose-400">{askError}</p>
              ) : null}

              {aiAnswer ? (
                <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed">
                  {aiAnswer}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Sticky bottom: New Scan & View Cart */}
      {hasProducts ? (
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0b0b0e]/95 backdrop-blur-md shrink-0 flex gap-2.5">
          <button
            onClick={onNewScan}
            className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-xs sm:text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            {t.newScan}
          </button>
          <button
            onClick={onViewCart || onNewScan}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md shadow-emerald-950/20 text-xs sm:text-sm"
          >
            <ShoppingCart className="w-4 h-4" />
            {t.viewCart}{totalCartItems > 0 ? ` (${totalCartItems})` : ''}
          </button>
        </div>
      ) : null}
    </div>
  );
}
