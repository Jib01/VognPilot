"use client";

import { ShoppingCart, RefreshCw, CheckCircle2, Info, ChevronLeft } from "lucide-react";
import { ProductBoundingBox, RawShelfAnalysis } from "../types/vision";

interface Props {
  analysis: RawShelfAnalysis;
  selectedBox: number | null;
  onSelectProduct: (idx: number | null) => void;
  onAddToList: (prod: ProductBoundingBox) => void;
  onNewScan: () => void;
  convertDKKtoEUR: (dkk: number) => string;
}

export function ProductBottomSheet({
  analysis,
  selectedBox,
  onSelectProduct,
  onAddToList,
  onNewScan,
  convertDKKtoEUR,
}: Props) {
  const selectedProduct = selectedBox !== null ? analysis.detected_products[selectedBox] : null;

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 rounded-t-[2.5rem] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)] overflow-hidden">
      <div className="p-4 bg-white rounded-t-[2.5rem] flex-1 flex flex-col h-full shadow-sm overflow-hidden">
        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-slate-200 mb-4" />
        
        {!selectedProduct ? (
          // Default View: Vertical Scrollable List
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center px-2 mb-4 shrink-0">
              <h3 className="font-bold text-slate-800 text-lg tracking-tight">Prodotti Trovati</h3>
              <span className="text-xs font-bold bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
                {analysis.detected_products.length}
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-3 hide-scrollbar">
              {analysis.detected_products.map((prod, idx) => {
                const price = prod.package_price_dkk ?? prod.unit_price_dkk;
                const isWinner = idx === analysis.recommended_product_index;
                
                return (
                  <div 
                    key={idx} 
                    onClick={() => onSelectProduct(idx)}
                    className={`flex items-center justify-between p-4 bg-white rounded-2xl shadow-sm border cursor-pointer active:scale-[0.98] transition-transform ${isWinner ? 'border-green-400 bg-green-50/30' : 'border-slate-100'}`}
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-slate-800 text-base truncate">{prod.label}</h4>
                        {isWinner && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                      </div>
                      <p className="text-xs text-slate-500 truncate mb-2">{prod.danish_term}</p>
                      
                      <div className="flex items-baseline gap-2">
                        <span className="font-black text-slate-900">{price != null ? `${price} kr` : '-- kr'}</span>
                        <span className="text-xs font-bold text-blue-600">{price != null ? `€${convertDKKtoEUR(price)}` : '--'}</span>
                      </div>
                      
                      {(prod.pant_fee_dkk || prod.multipack_offer) && (
                        <div className="flex flex-wrap gap-1 mt-2">
                           {prod.pant_fee_dkk && <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-md font-bold">+ {prod.pant_fee_dkk} kr Pant</span>}
                           {prod.multipack_offer && <span className="bg-purple-100 text-purple-800 text-[10px] px-2 py-0.5 rounded-md font-bold truncate max-w-[150px]">🏷️ {prod.multipack_offer}</span>}
                        </div>
                      )}
                    </div>
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToList(prod);
                      }}
                      className="bg-blue-600 text-white p-3.5 rounded-xl shadow-md active:scale-90 transition-transform shrink-0"
                    >
                      <ShoppingCart className="w-5 h-5" />
                    </button>
                  </div>
                );
              })}
            </div>
            
            <div className="p-2 pt-4 shrink-0 bg-white border-t border-slate-50">
              <button 
                onClick={onNewScan}
                className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <RefreshCw className="w-5 h-5" />
                Nuova Scansione
              </button>
            </div>
          </div>
        ) : (
          // Selected Product View
          <div className="flex flex-col h-full overflow-hidden px-2">
            
            {/* Header with Back Button */}
            <div className="flex items-start gap-3 mb-6 shrink-0">
              <button 
                onClick={() => onSelectProduct(null)}
                className="p-2 bg-slate-100 text-slate-600 rounded-full active:scale-90 transition-transform mt-1"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 pr-2">
                <h2 className="text-2xl font-black text-slate-900 leading-tight tracking-tight">{selectedProduct.label}</h2>
                <p className="text-sm font-medium text-slate-500 mt-1">{selectedProduct.danish_term}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-2xl font-black text-slate-900">
                  {selectedProduct.package_price_dkk ?? selectedProduct.unit_price_dkk ?? '--'} kr
                </p>
                {selectedProduct.pant_fee_dkk && (
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">+ {selectedProduct.pant_fee_dkk} kr Pant</p>
                )}
                <p className="text-sm font-bold text-blue-600 mt-1">
                  {selectedProduct.package_price_dkk ?? selectedProduct.unit_price_dkk 
                    ? `≈ €${convertDKKtoEUR(selectedProduct.package_price_dkk ?? selectedProduct.unit_price_dkk!)}` 
                    : '--'}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mb-6 shrink-0">
              <button 
                onClick={() => onAddToList(selectedProduct)}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black text-lg py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-95 transition-transform"
              >
                <ShoppingCart className="w-6 h-6" />
                + Carrello
              </button>
              <button 
                onClick={onNewScan}
                className="w-14 h-14 flex-shrink-0 bg-slate-100 text-slate-600 rounded-2xl flex items-center justify-center active:scale-95 transition-transform"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>

            {/* EXPANDED CONTENT (Scrollable) */}
            <div className="flex-1 overflow-y-auto hide-scrollbar pb-4 space-y-6">
              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                {selectedProduct.pant_fee_dkk && <span className="bg-blue-100 text-blue-800 text-xs px-3 py-1 rounded-full font-black flex items-center gap-1">+ {selectedProduct.pant_fee_dkk} kr Pant</span>}
                {selectedProduct.multipack_offer && <span className="bg-purple-100 text-purple-800 text-xs px-3 py-1 rounded-full font-black flex items-center gap-1">🏷️ {selectedProduct.multipack_offer}</span>}
                {selectedProduct.is_organic && <span className="bg-emerald-100 text-emerald-800 text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Biologico</span>}
                {selectedProduct.is_lactose_free && <span className="bg-blue-100 text-blue-800 text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Senza Lattosio</span>}
                {selectedProduct.is_plant_based && <span className="bg-green-100 text-green-900 text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Vegano</span>}
                {selectedProduct.is_gluten_free && <span className="bg-amber-100 text-amber-900 text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Senza Glutine</span>}
              </div>

              {/* Macros */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-sm">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Info className="w-4 h-4" /> Valori Nutrizionali (per 100g)
                </h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                    <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Proteine</span>
                    <span className="text-lg font-black text-slate-800">{selectedProduct.protein_g_per_100g !== null ? `${selectedProduct.protein_g_per_100g}g` : '-'}</span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                    <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Grassi</span>
                    <span className="text-lg font-black text-slate-800">{selectedProduct.fat_percentage !== null ? `${selectedProduct.fat_percentage}%` : '-'}</span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                    <span className="block text-[10px] text-slate-400 uppercase font-bold mb-1">Zuccheri</span>
                    <span className="text-lg font-black text-slate-800">{selectedProduct.sugar_g_per_100g !== null ? `${selectedProduct.sugar_g_per_100g}g` : '-'}</span>
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
