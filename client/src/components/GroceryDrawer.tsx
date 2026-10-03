"use client";

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { X, CheckCircle2, Circle, ShoppingCart, Trash2, Plus, Minus, Target } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function GroceryDrawer({ isOpen, onClose }: Props) {
  const items = useLiveQuery(() => db.groceryList.orderBy('id').reverse().toArray()) || [];
  const [budgetTarget, setBudgetTarget] = useState<number>(200);
  const [isEditingBudget, setIsEditingBudget] = useState(false);

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

  const totalDKK = items.reduce((acc, item) => acc + ((item.price_dkk || 0) * (item.quantity || 1)), 0);
  const totalEUR = items.reduce((acc, item) => acc + ((item.price_eur || 0) * (item.quantity || 1)), 0);

  const budgetPercent = Math.min((totalDKK / budgetTarget) * 100, 100);
  const isOverBudget = totalDKK > budgetTarget;

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[200] flex flex-col justify-end pointer-events-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md mx-auto bg-slate-50 h-[80dvh] rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom-full duration-300">
        
        <div className="p-5 border-b flex justify-between items-center bg-white rounded-t-3xl shadow-sm z-10">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-full">
              <ShoppingCart className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Lista Spesa</h2>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full active:scale-95 text-slate-500 hover:text-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Budget Tracker UI */}
        <div className="bg-white border-b border-slate-100 px-5 py-4">
          <div className="flex justify-between items-end mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Target className="w-3.5 h-3.5" /> Budget
            </div>
            {isEditingBudget ? (
              <input 
                type="number" 
                autoFocus
                onBlur={() => setIsEditingBudget(false)}
                onChange={(e) => handleBudgetChange(e.target.value)}
                value={budgetTarget}
                className="w-16 text-right border rounded p-1 text-xs font-bold"
              />
            ) : (
              <button onClick={() => setIsEditingBudget(true)} className="text-xs font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full cursor-pointer">
                Max {budgetTarget} kr
              </button>
            )}
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${isOverBudget ? 'bg-red-500' : 'bg-green-500'}`} 
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
          {isOverBudget && (
            <p className="text-[10px] text-red-500 font-bold mt-1 text-right animate-pulse">Budget superato!</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3">
              <ShoppingCart className="w-12 h-12 opacity-20" />
              <p className="font-medium">Il carrello è vuoto.</p>
              <p className="text-sm">Scansiona dei prodotti per aggiungerli!</p>
            </div>
          ) : (
            items.map(item => {
              const qty = item.quantity || 1;
              const priceDkk = item.price_dkk || 0;
              
              return (
                <div 
                  key={item.id} 
                  className={`flex items-center p-3 rounded-2xl border transition-all ${
                    item.is_checked ? 'bg-slate-100/50 border-slate-200' : 'bg-white border-slate-200 shadow-sm'
                  }`}
                >
                  <button onClick={() => toggleItem(item.id!, item.is_checked)} className="mr-3 active:scale-90 transition-transform">
                    {item.is_checked ? (
                      <CheckCircle2 className="w-7 h-7 text-green-500" />
                    ) : (
                      <Circle className="w-7 h-7 text-slate-300" />
                    )}
                  </button>
                  
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-slate-800 truncate ${item.is_checked ? 'line-through opacity-50' : ''}`}>
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className={`text-xs truncate ${item.is_checked ? 'text-slate-400' : 'text-slate-500'}`}>
                        {item.danish_term}
                      </p>
                    </div>
                    
                    {/* Quantity controls */}
                    <div className={`flex items-center gap-3 mt-2 ${item.is_checked ? 'opacity-50' : ''}`}>
                      <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
                        <button onClick={() => updateQuantity(item.id!, qty, -1)} className="p-1 active:bg-slate-200 rounded">
                          <Minus className="w-3 h-3 text-slate-600" />
                        </button>
                        <span className="text-xs font-bold w-6 text-center text-slate-700">{qty}</span>
                        <button onClick={() => updateQuantity(item.id!, qty, 1)} className="p-1 active:bg-slate-200 rounded">
                          <Plus className="w-3 h-3 text-slate-600" />
                        </button>
                      </div>
                      <p className="text-[10px] font-semibold text-slate-500">
                        {(priceDkk * qty).toFixed(2)} kr
                      </p>
                    </div>
                  </div>
                  
                  <button onClick={() => removeItem(item.id!)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-90 self-start">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="p-6 bg-white border-t border-slate-200 rounded-b-3xl pb-8 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-bold uppercase tracking-wider text-xs">Totale Stimato</span>
            <div className="text-right flex items-baseline gap-3">
              <p className="text-sm font-bold text-blue-600">≈ €{totalEUR.toFixed(2)}</p>
              <p className="text-2xl font-black text-slate-900">{totalDKK.toFixed(2)} <span className="text-sm font-bold text-slate-500">DKK</span></p>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
