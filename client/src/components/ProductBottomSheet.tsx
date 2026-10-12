"use client";

import { useState, useRef, useEffect } from "react";
import { ShoppingCart, RefreshCw, CheckCircle2, Info, ChevronLeft, ChevronUp, ChevronDown, Sparkles } from "lucide-react";
import { ProductBoundingBox, RawShelfAnalysis } from "../types/vision";
import { Language, getTranslation } from "../lib/translations";

interface Props {
  analysis: RawShelfAnalysis;
  selectedBox: number | null;
  onSelectProduct: (idx: number | null) => void;
  onAddToList: (prod: ProductBoundingBox) => void;
  onNewScan: () => void;
  convertDKKtoEUR: (dkk: number) => string;
  sheetSnap?: 'peek' | 'half' | 'full';
  onDragStart?: (e: React.PointerEvent) => void;
  onToggleSnap?: () => void;
  language?: Language;
  primaryCurrency?: "DKK" | "EUR";
}

export function ProductBottomSheet({
  analysis,
  selectedBox,
  onSelectProduct,
  onAddToList,
  onNewScan,
  convertDKKtoEUR,
  sheetSnap = 'half',
  onDragStart,
  onToggleSnap,
  language = 'en',
  primaryCurrency = 'DKK',
}: Props) {
  const t = getTranslation(language);
  const [expandedWhy, setExpandedWhy] = useState<number | null>(null);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const selectedProduct = selectedBox !== null ? analysis.detected_products[selectedBox] : null;
  const isSelectedWinner = selectedBox !== null && selectedBox === analysis.recommended_product_index;
  const winnerProduct = analysis.recommended_product_index !== null && analysis.recommended_product_index !== undefined
    ? analysis.detected_products[analysis.recommended_product_index]
    : null;

  // Auto-scroll the selected product card into view in the list when a bounding box is tapped
  useEffect(() => {
    if (selectedBox !== null && cardRefs.current[selectedBox]) {
      cardRefs.current[selectedBox]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedBox]);

  const toggleWhy = (idx: number) => {
    setExpandedWhy(prev => (prev === idx ? null : idx));
  };

  const formatPrice = (dkk: number | null | undefined) => {
    if (dkk == null) return '--';
    const eur = convertDKKtoEUR(dkk);
    if (primaryCurrency === 'EUR') {
      return (
        <div className="flex items-baseline gap-1.5">
          <span className="font-black text-base text-slate-900 dark:text-white">€{eur}</span>
          <span className="text-xs font-semibold text-slate-400">·</span>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">≈ {dkk} kr</span>
        </div>
      );
    }
    return (
      <div className="flex items-baseline gap-1.5">
        <span className="font-black text-base text-slate-900 dark:text-white">{dkk} kr</span>
        <span className="text-xs font-semibold text-slate-400">·</span>
        <span className="text-xs font-bold text-blue-600 dark:text-blue-400">≈ €{eur}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-900 rounded-t-3xl shadow-[0_-10px_35px_-5px_rgba(0,0,0,0.3)] overflow-hidden border-t border-slate-200/80 dark:border-slate-800">
      <div className="p-4 pt-2 bg-white dark:bg-slate-900 rounded-t-3xl flex-1 flex flex-col h-full shadow-sm overflow-hidden text-slate-900 dark:text-slate-100">
        {/* Interactive Drag Handle */}
        <div 
          onPointerDown={onDragStart}
          onClick={onToggleSnap}
          className="mx-auto w-full pt-1 pb-2 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none group"
        >
          <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 group-hover:bg-slate-400 dark:group-hover:bg-slate-600 transition-colors" />
          <div className="flex items-center gap-1 text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-1">
            {sheetSnap === 'peek' && <span>{t.dragUp}</span>}
            {sheetSnap === 'half' && <span>{t.swipeToggle}</span>}
            {sheetSnap === 'full' && <span>{t.dragDown}</span>}
          </div>
        </div>
        
        {!selectedProduct ? (
          // Default View: Vertical Scrollable List
          <div className="flex flex-col h-full overflow-hidden">
            <div 
              onPointerDown={onDragStart}
              onClick={sheetSnap === 'peek' ? onToggleSnap : undefined}
              className={`flex justify-between items-center px-2 mb-3 shrink-0 ${sheetSnap === 'peek' ? 'cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 dark:text-white text-lg tracking-tight">{t.foundProducts}</h3>
                <span className="text-xs font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 rounded-full">
                  {analysis.detected_products.length}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                {sheetSnap === 'peek' && winnerProduct && (
                  <div className="text-right truncate max-w-[170px]">
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md truncate inline-block">
                      ★ {winnerProduct.label}
                    </span>
                  </div>
                )}
                {onToggleSnap && (
                  <button
                    onClick={onToggleSnap}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title={sheetSnap === 'full' ? 'Half view' : 'Fullscreen view'}
                  >
                    {sheetSnap === 'full' ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-3 hide-scrollbar">
              {analysis.detected_products.map((prod, idx) => {
                const price = prod.package_price_dkk ?? prod.unit_price_dkk;
                const isWinner = idx === analysis.recommended_product_index;
                const isFocused = selectedBox === idx;
                
                return (
                  <div 
                    key={idx} 
                    ref={(el) => { cardRefs.current[idx] = el; }}
                    onClick={() => onSelectProduct(idx)}
                    className={`p-4 bg-white dark:bg-slate-800/80 rounded-2xl shadow-sm border cursor-pointer active:scale-[0.99] transition-all ${
                      isFocused 
                        ? 'border-blue-500 ring-2 ring-blue-400/40 bg-blue-50/30 dark:bg-blue-950/30' 
                        : isWinner 
                        ? 'border-emerald-300 dark:border-emerald-700/80 bg-emerald-50/20 dark:bg-emerald-950/20' 
                        : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Title: English Translation First */}
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <h4 className="font-extrabold text-slate-900 dark:text-white text-base leading-tight truncate">
                            {prod.label}
                          </h4>
                        </div>
                        
                        {/* Subtitle: Original Danish term */}
                        <p className="text-xs text-slate-400 dark:text-slate-400 font-medium truncate mb-2">
                          {prod.danish_term}
                        </p>
                        
                        {/* Price */}
                        {formatPrice(price)}
                      </div>

                      {/* Add to Cart button */}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToList(prod);
                        }}
                        className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl shadow-md active:scale-90 transition-transform shrink-0"
                        title={t.addToCart}
                      >
                        <ShoppingCart className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Compliance Badges & Clickable Why? Accordion Button */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60">
                      {isWinner && (
                        <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> {t.bestMatch}
                        </span>
                      )}
                      {prod.is_organic && <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] px-2 py-0.5 rounded-md font-bold">🌿 {t.organic}</span>}
                      {prod.is_plant_based && <span className="bg-green-50 dark:bg-green-950/60 text-green-700 dark:text-green-300 text-[10px] px-2 py-0.5 rounded-md font-bold">🌱 {t.vegan}</span>}
                      {prod.is_lactose_free && <span className="bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-[10px] px-2 py-0.5 rounded-md font-bold">🥛 {t.lactoseFree}</span>}
                      {prod.is_gluten_free && <span className="bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] px-2 py-0.5 rounded-md font-bold">🌾 {t.glutenFree}</span>}
                      {prod.pant_fee_dkk ? <span className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-[10px] px-2 py-0.5 rounded-md font-bold">+{prod.pant_fee_dkk} kr Pant</span> : null}
                      {prod.multipack_offer && <span className="bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 text-[10px] px-2 py-0.5 rounded-md font-bold truncate max-w-[150px]">🏷️ {prod.multipack_offer}</span>}

                      {/* Clickable Why? button */}
                      {analysis.decision_reason && (isWinner || prod.matches_constraints) && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleWhy(idx);
                          }}
                          className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/80 hover:bg-emerald-200/90 dark:hover:bg-emerald-900 px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors ml-auto active:scale-95"
                          title="Why this was recommended"
                        >
                          <span>{t.why}</span>
                          <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${expandedWhy === idx ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>

                    {/* Inline Accordion: Selection Reason */}
                    {expandedWhy === idx && analysis.decision_reason && (
                      <div 
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2.5 p-3 bg-emerald-50/90 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200"
                      >
                        <div className="flex items-center gap-1.5 font-bold text-[11px] text-emerald-950 dark:text-emerald-100 mb-1">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>{t.whyRecommended}</span>
                        </div>
                        <p>{analysis.decision_reason}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="p-2 pt-3 shrink-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
              <button 
                onClick={onNewScan}
                className="w-full bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <RefreshCw className="w-5 h-5" />
                {t.newScan}
              </button>
            </div>
          </div>
        ) : (
          // Selected Product View
          <div className="flex flex-col h-full overflow-hidden px-2">
            
            {/* Header with Back Button */}
            <div className="flex items-start gap-3 mb-4 shrink-0">
              <button 
                onClick={() => onSelectProduct(null)}
                className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full active:scale-90 transition-transform mt-1"
                aria-label="Back to products"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 pr-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white leading-tight tracking-tight">{selectedProduct.label}</h2>
                  {isSelectedWinner && (
                    <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-black px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {t.bestMatch}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">{selectedProduct.danish_term}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-2xl font-black text-slate-900 dark:text-white">
                  {selectedProduct.package_price_dkk ?? selectedProduct.unit_price_dkk ?? '--'} kr
                </p>
                {selectedProduct.pant_fee_dkk && (
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">+ {selectedProduct.pant_fee_dkk} kr Pant</p>
                )}
                <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-1">
                  {selectedProduct.package_price_dkk ?? selectedProduct.unit_price_dkk 
                    ? `≈ €${convertDKKtoEUR(selectedProduct.package_price_dkk ?? selectedProduct.unit_price_dkk!)}` 
                    : '--'}
                </p>
              </div>
            </div>

            {/* Recommendation Explanation */}
            {isSelectedWinner && analysis.decision_reason && (
              <div className="mb-4 p-3.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-start gap-2.5 shrink-0 text-emerald-900 dark:text-emerald-200">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide">{t.whyRecommended}</p>
                  <p className="text-xs mt-0.5 leading-relaxed">{analysis.decision_reason}</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mb-5 shrink-0">
              <button 
                onClick={() => onAddToList(selectedProduct)}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black text-lg py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95 transition-transform"
              >
                <ShoppingCart className="w-6 h-6" />
                {t.addToCart}
              </button>
              <button 
                onClick={onNewScan}
                className="w-14 h-14 flex-shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl flex items-center justify-center active:scale-95 transition-transform"
                title={t.newScan}
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>

            {/* EXPANDED CONTENT (Scrollable) */}
            <div className="flex-1 overflow-y-auto hide-scrollbar pb-4 space-y-5">
              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                {selectedProduct.pant_fee_dkk && <span className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-xs px-3 py-1 rounded-full font-black flex items-center gap-1">+ {selectedProduct.pant_fee_dkk} kr Pant</span>}
                {selectedProduct.multipack_offer && <span className="bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 text-xs px-3 py-1 rounded-full font-black flex items-center gap-1">🏷️ {selectedProduct.multipack_offer}</span>}
                {selectedProduct.is_organic && <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/> {t.organic}</span>}
                {selectedProduct.is_lactose_free && <span className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/> {t.lactoseFree}</span>}
                {selectedProduct.is_plant_based && <span className="bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300 text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/> {t.vegan}</span>}
                {selectedProduct.is_gluten_free && <span className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/> {t.glutenFree}</span>}
              </div>

              {/* Macros */}
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Info className="w-4 h-4" /> {t.nutritionFacts}
                </h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                    <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">{t.protein}</span>
                    <span className="text-lg font-black text-slate-800 dark:text-slate-100">{selectedProduct.protein_g_per_100g !== null ? `${selectedProduct.protein_g_per_100g}g` : '-'}</span>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                    <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">{t.fat}</span>
                    <span className="text-lg font-black text-slate-800 dark:text-slate-100">{selectedProduct.fat_percentage !== null ? `${selectedProduct.fat_percentage}%` : '-'}</span>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
                    <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">{t.sugars}</span>
                    <span className="text-lg font-black text-slate-800 dark:text-slate-100">{selectedProduct.sugar_g_per_100g !== null ? `${selectedProduct.sugar_g_per_100g}g` : '-'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
