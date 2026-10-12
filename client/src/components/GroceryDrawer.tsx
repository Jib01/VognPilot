"use client";

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { X, CheckCircle2, Circle, ShoppingCart, Trash2, Plus, Minus, Target } from 'lucide-react';
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
  const [isEditingBudget, setIsEditingBudget] = useState(false);

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
    if (saved) setBudgetTarget(parseFloat(saved));
  }, []);

  const handleBudgetChange = (val: string) => {
    const num = parseFloat(val) || 200;
    setBudgetTarget(num);
    localStorage.setItem('vognpilot_budget', num.toString());
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
      
      <div 
        className="relative w-full max-w-md mx-auto bg-slate-50 dark:bg-slate-900 h-[85dvh] rounded-t-3xl flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom-full duration-300 text-slate-900 dark:text-slate-100 border-t border-slate-200/60 dark:border-slate-800"
        style={{
          transform: `translateY(${dragOffsetY}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1)'
        }}
      >
        {/* Interactive Drag Handle */}
        <div 
          onPointerDown={handlePointerDown}
          className="mx-auto w-full pt-2.5 pb-1 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none bg-white dark:bg-slate-900 rounded-t-3xl"
        >
          <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 transition-colors" />
          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-1">{t.swipeDownToClose}</span>
        </div>
        
        <div 
          onPointerDown={handlePointerDown}
          className="p-5 pt-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 shadow-sm z-10 cursor-grab active:cursor-grabbing touch-none select-none"
        >
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 dark:bg-blue-950 p-2 rounded-full">
              <ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">{t.shoppingList}</h2>
              <p className="text-[11px] text-slate-400 mt-1 font-medium">{items.length} {language === 'it' ? 'articoli' : 'items'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full active:scale-95 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Budget Tracker Bar */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Target className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> {t.spentVsBudget}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-extrabold ${isOverBudget ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                {primaryCurrency === 'EUR'
                  ? `€${(totalDKK / 7.46).toFixed(1)} / €${(budgetTarget / 7.46).toFixed(0)}`
                  : `${totalDKK.toFixed(0)} / ${budgetTarget} kr`}
              </span>
              {isEditingBudget ? (
                <input 
                  type="number" 
                  autoFocus
                  onBlur={() => setIsEditingBudget(false)}
                  onChange={(e) => handleBudgetChange(e.target.value)}
                  value={budgetTarget}
                  className="w-16 text-right border dark:border-slate-700 bg-white dark:bg-slate-800 rounded p-1 text-xs font-bold"
                />
              ) : (
                <button onClick={() => setIsEditingBudget(true)} className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full hover:bg-blue-100 transition-colors">
                  {t.editBudget}
                </button>
              )}
            </div>
          </div>
          <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${isOverBudget ? 'bg-rose-500' : budgetPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-1.5 text-[11px]">
            <span className="text-slate-400 font-medium">
              {isOverBudget 
                ? `${(totalDKK - budgetTarget).toFixed(0)} kr ${t.overBudget}` 
                : `${remainingBudget.toFixed(0)} kr ${t.remaining}`}
            </span>
            <span className={`font-bold ${isOverBudget ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {budgetPercent.toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 hide-scrollbar">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3">
              <ShoppingCart className="w-12 h-12 opacity-20" />
              <p className="font-semibold">{t.emptyList}</p>
              <p className="text-sm text-center px-4">{t.emptyListSub}</p>
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
                      ? 'bg-slate-100/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800' 
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-sm'
                  }`}
                >
                  <button onClick={() => toggleItem(item.id!, item.is_checked)} className="mr-3 active:scale-90 transition-transform">
                    {item.is_checked ? (
                      <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                    ) : (
                      <Circle className="w-7 h-7 text-slate-300 dark:text-slate-600" />
                    )}
                  </button>
                  
                  <div className="flex-1 min-w-0 pr-2">
                    <p className={`font-bold text-slate-900 dark:text-white text-sm truncate ${item.is_checked ? 'line-through opacity-50' : ''}`}>
                      {item.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className={`text-xs truncate ${item.is_checked ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {item.danish_term}
                      </p>
                      {item.pant_fee_dkk && item.pant_fee_dkk > 0 && (
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">
                          +{item.pant_fee_dkk} kr Pant
                        </span>
                      )}
                    </div>
                    
                    {/* Quantity controls */}
                    <div className={`flex items-center gap-3 mt-2 ${item.is_checked ? 'opacity-50' : ''}`}>
                      <div className="flex items-center bg-slate-100 dark:bg-slate-700/60 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
                        <button onClick={() => updateQuantity(item.id!, qty, -1)} className="p-1 active:bg-slate-200 dark:active:bg-slate-600 rounded">
                          <Minus className="w-3 h-3 text-slate-600 dark:text-slate-300" />
                        </button>
                        <span className="text-xs font-bold w-6 text-center text-slate-700 dark:text-slate-200">{qty}</span>
                        <button onClick={() => updateQuantity(item.id!, qty, 1)} className="p-1 active:bg-slate-200 dark:active:bg-slate-600 rounded">
                          <Plus className="w-3 h-3 text-slate-600 dark:text-slate-300" />
                        </button>
                      </div>
                      <div className="text-xs font-black text-slate-800 dark:text-white">
                        {primaryCurrency === 'EUR'
                          ? `€${((priceDkk * qty + pantDkk) / 7.46).toFixed(2)}`
                          : `${(priceDkk * qty + pantDkk).toFixed(2)} kr`}
                      </div>
                    </div>
                  </div>
                  
                  <button onClick={() => removeItem(item.id!)} className="p-2 text-slate-300 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors active:scale-90 self-start">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with Subtotal & Pant breakdown */}
        <div className="p-5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-b-3xl pb-8 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] space-y-3">
          {pantTotalDKK > 0 && (
            <div className="space-y-1 pb-2 border-b border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>{t.productsSubtotal}</span>
                <span>{productsTotalDKK.toFixed(2)} kr</span>
              </div>
              <div className="flex justify-between text-blue-600 dark:text-blue-400 font-medium">
                <span>{t.pantDeposits}</span>
                <span>+{pantTotalDKK.toFixed(2)} kr</span>
              </div>
            </div>
          )}
          <div className="flex justify-between items-center">
            <div>
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block">{t.totalEstimated}</span>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">≈ €{totalEUR.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">
                {totalDKK.toFixed(2)} <span className="text-sm font-bold text-slate-500 dark:text-slate-400">DKK</span>
              </p>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
