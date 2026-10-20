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
  convertDKKtoEUR: (dkk: number) => string;
  language?: Language;
  primaryCurrency?: "DKK" | "EUR";
}

export function ScanResultSheet({
  scan,
  imageUri,
  onAddToList,
  onNewScan,
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
    // Reset after 2s to allow re-adding
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
      return { primary: `€${eur}`, secondary: `${dkk} kr` };
    }
    return { primary: `${dkk} kr`, secondary: `≈ €${eur}` };
  };

  const hasProducts = scan.detected_products.length > 0;

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">

      {/* Notice Banner (Demo / Quota fallback) */}
      {scan.notice && (
        <div className="bg-emerald-950/70 border-b border-emerald-800/60 px-4 py-2.5 text-xs text-emerald-200 flex items-center gap-2 shrink-0">
          <span className="text-sm">⚡</span>
          <span className="font-medium">{scan.notice}</span>
        </div>
      )}

      {/* Compact photo + header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-900 shrink-0">
        {/* Thumbnail */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUri}
          alt="Scanned shelf"
          className="w-14 h-14 rounded-xl object-cover border border-zinc-800 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <h2 className="font-extrabold text-zinc-100 text-base leading-tight">
            {hasProducts ? `${scan.detected_products.length} product${scan.detected_products.length > 1 ? 's' : ''} found` : 'Nothing detected'}
          </h2>
          {scan.decision_reason && hasProducts && (
            <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{scan.decision_reason}</p>
          )}
        </div>
        <button
          onClick={onNewScan}
          className="p-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 active:scale-95 transition-all flex-shrink-0"
          title={t.newScan}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Blurry / no result state */}
      {!hasProducts && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-zinc-400 text-sm leading-relaxed max-w-xs">
            {scan.is_blurry_or_obscured
              ? "The photo was too blurry or products were hard to read. Move a bit closer and try again."
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
      )}

      {/* Product cards list */}
      {hasProducts && (
        <div className="flex-1 overflow-y-auto hide-scrollbar px-3 py-3 space-y-3 pb-20">
          {scan.detected_products.map((prod, idx) => {
            const price = prod.package_price_dkk ?? prod.unit_price_dkk;
            const priceDisplay = formatPrice(price);
            const isWinner = idx === scan.recommended_product_index;
            const isAdded = addedIndices.has(idx);
            const hasNutrition = prod.protein_g_per_100g != null || prod.fat_percentage != null || prod.sugar_g_per_100g != null;
            const nutritionOpen = expandedNutrition === idx;

            return (
              <div
                key={idx}
                className={`rounded-2xl border overflow-hidden transition-all ${
                  isWinner
                    ? 'border-emerald-700/60 bg-zinc-900'
                    : 'border-zinc-800 bg-zinc-900'
                }`}
              >
                <div className="p-4">
                  {/* Product name + Winner badge */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isWinner && (
                          <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 text-[10px] font-black px-2 py-0.5 rounded-full">
                            <Sparkles className="w-2.5 h-2.5" /> Best pick
                          </span>
                        )}
                      </div>
                      <h3 className="font-extrabold text-zinc-100 text-base leading-tight mt-0.5">
                        {prod.label}
                      </h3>
                      <p className="text-xs text-zinc-400 font-medium mt-0.5">{prod.danish_term}</p>
                      {prod.summary && (
                        <p className="text-xs text-zinc-300 mt-1 leading-snug">{prod.summary}</p>
                      )}
                    </div>

                    {/* Price */}
                    {priceDisplay && (
                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-zinc-100 text-lg leading-none">{priceDisplay.primary}</p>
                        <p className="text-xs text-emerald-400 font-bold mt-0.5">{priceDisplay.secondary}</p>
                        {prod.pant_fee_dkk && (
                          <p className="text-[10px] text-zinc-400 mt-0.5">+{prod.pant_fee_dkk} kr Pant</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tags row */}
                  <div className="flex flex-wrap gap-1.5 mt-3 mb-3">
                    {prod.is_organic && (
                      <span className="text-[10px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-900/40 px-2 py-0.5 rounded-md">🌿 Organic</span>
                    )}
                    {prod.is_plant_based && (
                      <span className="text-[10px] font-bold bg-teal-950/60 text-teal-300 border border-teal-900/40 px-2 py-0.5 rounded-md">🌱 Vegan</span>
                    )}
                    {prod.is_lactose_free && (
                      <span className="text-[10px] font-bold bg-sky-950/60 text-sky-300 border border-sky-900/40 px-2 py-0.5 rounded-md">🥛 Lactose-Free</span>
                    )}
                    {prod.is_gluten_free && (
                      <span className="text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-900/40 px-2 py-0.5 rounded-md">🌾 Gluten-Free</span>
                    )}
                    {prod.pant_fee_dkk && (
                      <span className="text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded-md">♻️ Returnable</span>
                    )}
                    {prod.multipack_offer && (
                      <span className="text-[10px] font-bold bg-purple-950/60 text-purple-300 border border-purple-900/40 px-2 py-0.5 rounded-md truncate max-w-[150px]">🏷️ {prod.multipack_offer}</span>
                    )}
                  </div>

                  {/* Add to Cart button */}
                  <button
                    onClick={() => handleAdd(prod, idx)}
                    className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                      isAdded
                        ? 'bg-emerald-700 text-white cursor-default'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Added to cart
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-4 h-4" />
                        {t.addToCart}
                      </>
                    )}
                  </button>

                  {/* Nutrition toggle */}
                  {hasNutrition && (
                    <button
                      onClick={() => setExpandedNutrition(prev => prev === idx ? null : idx)}
                      className="mt-2.5 w-full flex items-center justify-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>{nutritionOpen ? 'Hide nutrition' : 'Nutrition facts'}</span>
                    </button>
                  )}
                </div>

                {/* Inline Nutrition Facts */}
                {nutritionOpen && hasNutrition && (
                  <div className="border-t border-zinc-800 bg-zinc-950/60 px-4 py-3">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Per 100g</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {prod.protein_g_per_100g != null && (
                        <div className="bg-zinc-900 rounded-xl py-2 border border-zinc-800">
                          <span className="block text-[10px] text-zinc-500 font-bold mb-0.5">Protein</span>
                          <span className="text-sm font-black text-zinc-100">{prod.protein_g_per_100g}g</span>
                        </div>
                      )}
                      {prod.fat_percentage != null && (
                        <div className="bg-zinc-900 rounded-xl py-2 border border-zinc-800">
                          <span className="block text-[10px] text-zinc-500 font-bold mb-0.5">Fat</span>
                          <span className="text-sm font-black text-zinc-100">{prod.fat_percentage}%</span>
                        </div>
                      )}
                      {prod.sugar_g_per_100g != null && (
                        <div className="bg-zinc-900 rounded-xl py-2 border border-zinc-800">
                          <span className="block text-[10px] text-zinc-500 font-bold mb-0.5">Sugars</span>
                          <span className="text-sm font-black text-zinc-100">{prod.sugar_g_per_100g}g</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky bottom: New Scan */}
      {hasProducts && (
        <div className="p-3 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md shrink-0">
          <button
            onClick={onNewScan}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            {t.newScan}
          </button>
        </div>
      )}
    </div>
  );
}
