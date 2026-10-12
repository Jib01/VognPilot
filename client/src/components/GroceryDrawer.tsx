"use client";

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { X, CheckCircle2, Circle, ShoppingCart, Trash2, Plus, Minus, Target, Pencil } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { Language, getTranslation } from '../lib/translations';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  language?: Language;
  primaryCurrency?: "DKK" | "EUR";
}

export default function GroceryDrawer({ isOpen, onClose, language = 'en', primaryCurrency = 'DKK' }: Props) {
  const t = getTranslation(language);
  const items = useLiveQuery(() => db.groceryList.orderBy('id').reverse().toArray()) || [];
  const [budgetTarget, setBudgetTarget] = useState<number>(200);
  
  // Dedicated Budget Edit Dialog
  const [isBudgetDialogOpen, setIsBudgetDialogOpen] = useState<boolean>(false);
  const [tempBudget, setTempBudget] = useState<string>("200");

  // Swipe down to dismiss
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const startY = useRef<number>(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const onPointerMove = (e: PointerEvent) => {
      const deltaY = e.clientY - startY.current;
      if (deltaY > 0) {
        setDragOffsetY(deltaY);
      }
    };

    const onPointerUp = () => {
      setIsDragging(false);
      setDragOffsetY((current) => {
        if (current > 100) {
          onClose();
        }
        return 0;
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isDragging, onClose]);

  useEffect(() => {
    const saved = localStorage.getItem('vognpilot_budget');
    if (saved) {
      const val = parseFloat(saved) || 200;
      setBudgetTarget(val);
      setTempBudget(val.toString());
    }
  }, []);

  const openBudgetDialog = () => {
    setTempBudget(budgetTarget.toString());
    setIsBudgetDialogOpen(true);
  };

  const saveBudget = () => {
    const num = Math.max(10, parseFloat(tempBudget) || 200);
    setBudgetTarget(num);
    localStorage.setItem('vognpilot_budget', num.toString());
    setIsBudgetDialogOpen(false);
  };
  
  const toggleItem = async (id: number, currentStatus: boolean) => {
    await db.groceryList.update(id, { 
      is_checked: !currentStatus,
      sync_status: 'pending'
    });
  };

  const updateQuantity = async (id: number, currentQty: number, delta: number) => {
    const safeQty = currentQty || 1;
    const newQty = Math.max(1, safeQty + delta);
    await db.groceryList.update(id, { quantity: newQty, sync_status: 'pending' });
  };

  const removeItem = async (id: number) => {
    await db.groceryList.delete(id);
  };

  const productsTotalDKK = items.reduce((acc, item) => acc + ((item.price_dkk || 0) * (item.quantity || 1)), 0);
  const pantTotalDKK = items.reduce((acc, item) => acc + ((item.pant_fee_dkk || 0) * (item.quantity || 1)), 0);
  const totalDKK = productsTotalDKK + pantTotalDKK;
  const totalEUR = totalDKK / 7.46;

  const budgetPercent = Math.min((totalDKK / budgetTarget) * 100, 100);
  const isOverBudget = totalDKK > budgetTarget;
  const remainingBudget = Math.max(0, budgetTarget - totalDKK);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[200] flex flex-col justify-end pointer-events-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Drawer Container: supports dvh and max-h-85vh to prevent browser navbar interference */}
      <div 
        className="relative w-full max-w-md mx-auto bg-zinc-900 h-[85dvh] max-h-[85vh] sm:max-h-[85dvh] rounded-t-3xl flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-full duration-300 text-zinc-100 border-t border-zinc-800"
        style={{
          transform: `translateY(${dragOffsetY}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1)'
        }}
      >
        {/* Interactive Drag Handle */}
        <div 
          onPointerDown={handlePointerDown}
          className="mx-auto w-full pt-2.5 pb-1 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none bg-zinc-900 rounded-t-3xl"
        >
          <div className="w-12 h-1.5 rounded-full bg-zinc-700 hover:bg-zinc-600 transition-colors" />
          <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-1">{t.swipeDownToClose}</span>
        </div>
        
        {/* Drawer Header */}
        <div 
          onPointerDown={handlePointerDown}
          className="p-5 pt-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-900 shadow-sm z-10 cursor-grab active:cursor-grabbing touch-none select-none"
        >
          <div className="flex items-center gap-3">
            <div className="bg-emerald-950/60 border border-emerald-900/40 p-2 rounded-full">
              <ShoppingCart className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-zinc-100 tracking-tight leading-none">{t.shoppingList}</h2>
              <p className="text-[11px] text-zinc-400 mt-1 font-medium">{items.length} {language === 'it' ? 'articoli' : 'items'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-zinc-800 rounded-full active:scale-95 text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Budget Tracker Bar */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-5 py-4">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-400">
              <Target className="w-3.5 h-3.5 text-emerald-400" /> {t.spentVsBudget}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-extrabold ${isOverBudget ? 'text-rose-400' : 'text-zinc-100'}`}>
                {primaryCurrency === 'EUR'
                  ? `€${(totalDKK / 7.46).toFixed(1)} / €${(budgetTarget / 7.46).toFixed(0)}`
                  : `${totalDKK.toFixed(0)} / ${budgetTarget} kr`}
              </span>
              
              {/* Clean Pencil/Edit Button that opens dialog without keyboard obstructing list */}
              <button 
                onClick={openBudgetDialog} 
                className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-900/60 px-2 py-0.5 rounded-full hover:bg-emerald-900/50 transition-colors flex items-center gap-1 active:scale-95"
              >
                <Pencil className="w-2.5 h-2.5" />
                <span>{t.editBudget}</span>
              </button>
            </div>
          </div>
          <div className="h-2.5 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${isOverBudget ? 'bg-rose-500' : budgetPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-1.5 text-[11px]">
            <span className="text-zinc-400 font-medium">
              {isOverBudget 
                ? `${(totalDKK - budgetTarget).toFixed(0)} kr ${t.overBudget}` 
                : `${remainingBudget.toFixed(0)} kr ${t.remaining}`}
            </span>
            <span className={`font-bold ${isOverBudget ? 'text-rose-400' : 'text-zinc-400'}`}>
              {budgetPercent.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Scrollable Items Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-3">
              <ShoppingCart className="w-12 h-12 opacity-20" />
              <p className="font-semibold text-zinc-400">{t.emptyList}</p>
              <p className="text-sm text-center px-4 text-zinc-500">{t.emptyListSub}</p>
            </div>
          ) : (
            items.map(item => {
              const qty = item.quantity || 1;
              const priceDkk = item.price_dkk || 0;
              const pantDkk = (item.pant_fee_dkk || 0) * qty;
              
              return (
                <div 
                  key={item.id} 
                  className={`flex items-center p-3.5 rounded-2xl border transition-all ${
                    item.is_checked 
                      ? 'bg-zinc-950/40 border-zinc-800/60 opacity-60' 
                      : 'bg-zinc-900 border-zinc-800 shadow-sm'
                  }`}
                >
                  <button onClick={() => toggleItem(item.id!, item.is_checked)} className="mr-3 active:scale-90 transition-transform">
                    {item.is_checked ? (
                      <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                    ) : (
                      <Circle className="w-7 h-7 text-zinc-600" />
                    )}
                  </button>
                  
                  <div className="flex-1 min-w-0 pr-2">
                    <p className={`font-bold text-zinc-100 text-sm truncate ${item.is_checked ? 'line-through opacity-50' : ''}`}>
                      {item.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className={`text-xs truncate ${item.is_checked ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        {item.danish_term}
                      </p>
                      {item.pant_fee_dkk && item.pant_fee_dkk > 0 && (
                        <span className="text-[10px] font-bold text-zinc-300 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded">
                          +{item.pant_fee_dkk} kr Pant
                        </span>
                      )}
                    </div>
                    
                    {/* Quantity controls */}
                    <div className={`flex items-center gap-3 mt-2 ${item.is_checked ? 'opacity-50' : ''}`}>
                      <div className="flex items-center bg-zinc-800 rounded-lg p-0.5 border border-zinc-700">
                        <button onClick={() => updateQuantity(item.id!, qty, -1)} className="p-1 active:bg-zinc-700 rounded">
                          <Minus className="w-3 h-3 text-zinc-300" />
                        </button>
                        <span className="text-xs font-bold w-6 text-center text-zinc-200">{qty}</span>
                        <button onClick={() => updateQuantity(item.id!, qty, 1)} className="p-1 active:bg-zinc-700 rounded">
                          <Plus className="w-3 h-3 text-zinc-300" />
                        </button>
                      </div>
                      <div className="text-xs font-black text-zinc-100">
                        {primaryCurrency === 'EUR'
                          ? `€${((priceDkk * qty + pantDkk) / 7.46).toFixed(2)}`
                          : `${(priceDkk * qty + pantDkk).toFixed(2)} kr`}
                      </div>
                    </div>
                  </div>
                  
                  <button onClick={() => removeItem(item.id!)} className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 rounded-xl transition-colors active:scale-90 self-start">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with Exchange rate pill, Subtotal & Pant breakdown */}
        <div className="p-5 bg-zinc-900 border-t border-zinc-800 rounded-b-3xl pb-8 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.2)] space-y-3">
          {/* Rate info moved to cart footer */}
          <div className="text-[11px] text-zinc-400 font-medium flex items-center justify-between border-b border-zinc-800 pb-2">
            <span>{t.currencyRate}</span>
            <span className="text-zinc-500">{primaryCurrency === 'EUR' ? 'EUR first' : 'DKK first'}</span>
          </div>

          {pantTotalDKK > 0 && (
            <div className="space-y-1 pb-2 border-b border-zinc-800 text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>{t.productsSubtotal}</span>
                <span>{productsTotalDKK.toFixed(2)} kr</span>
              </div>
              <div className="flex justify-between text-emerald-400 font-medium">
                <span>{t.pantDeposits}</span>
                <span>+{pantTotalDKK.toFixed(2)} kr</span>
              </div>
            </div>
          )}
          <div className="flex justify-between items-center">
            <div>
              <span className="text-zinc-400 font-bold uppercase tracking-wider text-[10px] block">{t.totalEstimated}</span>
              <span className="text-xs font-bold text-emerald-400">≈ €{totalEUR.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-zinc-100 leading-none">
                {totalDKK.toFixed(2)} <span className="text-sm font-bold text-zinc-400">DKK</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated Budget Dialog (Prevents keyboard from occluding shopping list) */}
      {isBudgetDialogOpen && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-2xl text-zinc-100 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base tracking-tight">{t.spentVsBudget}</h3>
              <button 
                onClick={() => setIsBudgetDialogOpen(false)}
                className="p-1.5 rounded-full text-zinc-400 hover:text-white bg-zinc-800 active:scale-95 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Presets */}
            <div>
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                {language === 'it' ? 'Preset Rapidi' : 'Quick Presets'}
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[100, 200, 300, 500].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setTempBudget(preset.toString())}
                    className={`py-2 px-1 text-xs font-bold rounded-xl border transition-all active:scale-95 ${
                      tempBudget === preset.toString()
                        ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    {preset} kr
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Budget Input */}
            <div>
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
                {language === 'it' ? 'Valore Target' : 'Target Amount'}
              </label>
              <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 focus-within:border-emerald-500 transition-colors">
                <input 
                  type="number"
                  inputMode="numeric"
                  value={tempBudget}
                  onChange={(e) => setTempBudget(e.target.value)}
                  className="w-full bg-transparent text-zinc-100 font-extrabold text-base focus:outline-none"
                  placeholder="200"
                />
                <span className="text-xs font-bold text-zinc-400 ml-2">kr</span>
              </div>
            </div>

            {/* Dialog Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setIsBudgetDialogOpen(false)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-bold py-2.5 rounded-xl text-xs transition-colors border border-zinc-700"
              >
                {t.dismiss}
              </button>
              <button
                onClick={saveBudget}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-all active:scale-95"
              >
                {t.done}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
