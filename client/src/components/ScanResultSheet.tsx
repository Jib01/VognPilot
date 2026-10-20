"use client";

import { useState } from 'react';
import { ShoppingCart, RefreshCw, CheckCircle2, Info, Sparkles, X } from 'lucide-react';
import { ProductCard, ScanResult } from '../types/vision';
import { Language, getTranslation } from '../lib/translations';

interface Props {
  scan: ScanResult;
  imageUri: string;
  onAddToList: (prod: ProductCard) => void;
  onNewScan: () => void;
  onViewCart?: () => void;
  convertDKKtoEUR: (dkk: number) => string;
  language?: Language;
  primaryCurrency?: "DKK" | "EUR";
}

export function ScanResultSheet({
  scan,
  imageUri,
  onAddToList,
  onNewScan,
  onViewCart,
  convertDKKtoEUR,
  language = 'en',
  primaryCurrency = 'DKK',
}: Props) {
  const t = getTranslation(language);
  const [addedIndices, setAddedIndices] = useState<Set<number>>(new Set());
  const [expandedNutrition, setExpandedNutrition] = useState<number | null>(null);

  const handleAdd = (prod: ProductCard, idx: number) => {
    onAddToList(prod);
    setAddedIndices(prev => new Set(prev).add(idx));
    setTimeout(() => {
      setAddedIndices(prev => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }, 2000);
  };

  const formatPrice = (dkk: number | null | undefined) => {
    if (dkk == null) return null;
    const eur = convertDKKtoEUR(dkk);
    if (primaryCurrency === 'EUR') {
      return { primary: `€${eur}`, secondary: `${dkk.toFixed(2)} kr` };
    }
    return { primary: `${dkk.toFixed(2)} kr`, secondary: `≈ €${eur}` };
  };

  const hasProducts = Array.isArray(scan.detected_products) && scan.detected_products.length > 0;

  return (
    <div className="flex flex-col h-full bg-zinc-50 text-zinc-900 dark:bg-[#0b0b0e] dark:text-zinc-100 transition-colors">

      {/* Notice Banner (Demo Shelf) */}
      {Boolean(scan.notice) ? (
        <div className="bg-emerald-50 dark:bg-emerald-950/70 border-b border-emerald-200 dark:border-emerald-800/60 px-4 py-2.5 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2 shrink-0">
          <span className="text-sm">⚡</span>
          <span className="font-semibold">{scan.notice}</span>
        </div>
      ) : null}

      {/* Compact photo + header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-white/10 bg-white/95 dark:bg-[#121216]/95 backdrop-blur-md shrink-0">
        {/* Thumbnail */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUri || '/icon-512.svg'}
          alt="Scanned shelf"
          className="w-14 h-14 rounded-xl object-cover border border-zinc-200 dark:border-zinc-800 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h2 className="font-extrabold text-zinc-900 dark:text-zinc-100 text-base leading-tight">
            {hasProducts ? t.productsFound(scan.detected_products.length) : t.couldNotRead}
          </h2>
          {Boolean(scan.decision_reason) && hasProducts ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">{scan.decision_reason}</p>
          ) : null}
        </div>
        <button
          onClick={onViewCart || onNewScan}
          className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:text-white border border-zinc-200 dark:border-zinc-700 active:scale-95 transition-all flex-shrink-0"
          title={t.dismiss}
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

      {/* Product cards list */}
      {hasProducts ? (
        <div className="flex-1 overflow-y-auto hide-scrollbar px-3 py-3 space-y-3 pb-24">
          {scan.detected_products.map((prod, idx) => {
            const price = prod.package_price_dkk ?? prod.unit_price_dkk;
            const priceDisplay = formatPrice(price);
            const isWinner = idx === scan.recommended_product_index;
            const isAdded = addedIndices.has(idx);
            const hasNutrition = prod.protein_g_per_100g != null || prod.fat_percentage != null || prod.sugar_g_per_100g != null;
            const nutritionOpen = expandedNutrition === idx;
            const pantFee = Number(prod.pant_fee_dkk || 0);

            return (
              <div
                key={idx}
                className={`rounded-2xl border overflow-hidden transition-all shadow-xs ${
                  isWinner
                    ? 'border-emerald-500/70 bg-emerald-50/20 dark:border-emerald-600/60 dark:bg-zinc-900/90'
                    : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                }`}
              >
                <div className="p-4">
                  {/* Product name + Winner badge */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      {isWinner ? (
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800/60 text-[10px] font-black px-2 py-0.5 rounded-full">
                            <Sparkles className="w-2.5 h-2.5" /> {t.bestPick}
                          </span>
                        </div>
                      ) : null}
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

                    {/* Price */}
                    {priceDisplay ? (
                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-zinc-900 dark:text-zinc-100 text-lg leading-none">{priceDisplay.primary}</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">{priceDisplay.secondary}</p>
                        {/* Strict check: never print 0 */}
                        {pantFee > 0 ? (
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-semibold">+{pantFee} kr {t.returnable}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {/* Tags row: Strict boolean checks */}
                  <div className="flex flex-wrap gap-1.5 mt-3 mb-3">
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
                    {/* Pant badge: Only print if pantFee > 0, never print 0 */}
                    {pantFee > 0 ? (
                      <span className="text-[10px] font-bold bg-zinc-100 text-zinc-700 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700 px-2 py-0.5 rounded-md">♻️ {t.returnable} ({pantFee} kr)</span>
                    ) : null}
                    {Boolean(prod.multipack_offer) ? (
                      <span className="text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-900/40 px-2 py-0.5 rounded-md truncate max-w-[160px]">🏷️ {prod.multipack_offer}</span>
                    ) : null}
                  </div>

                  {/* Add to Cart button */}
                  <button
                    onClick={() => handleAdd(prod, idx)}
                    className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                      isAdded
                        ? 'bg-emerald-700 text-white cursor-default'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/10'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        {t.addedToCart}
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-4 h-4" />
                        {t.addToCart}
                      </>
                    )}
                  </button>

                  {/* Nutrition toggle */}
                  {hasNutrition ? (
                    <button
                      onClick={() => setExpandedNutrition(prev => prev === idx ? null : idx)}
                      className="mt-2.5 w-full flex items-center justify-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors py-1"
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
        </div>
      ) : null}

      {/* Sticky bottom: New Scan & View Cart */}
      {hasProducts ? (
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#0b0b0e]/95 backdrop-blur-md shrink-0 flex gap-2.5">
          <button
            onClick={onNewScan}
            className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-700 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-xs sm:text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            {t.newScan}
          </button>
          <button
            onClick={onViewCart || onNewScan}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md shadow-emerald-950/20 text-xs sm:text-sm"
          >
            <ShoppingCart className="w-4 h-4" />
            {t.viewCart}
          </button>
        </div>
      ) : null}
    </div>
  );
}
