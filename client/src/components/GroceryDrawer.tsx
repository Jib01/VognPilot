"use client";

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { X, CheckCircle2, Circle, ShoppingCart, Trash2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function GroceryDrawer({ isOpen, onClose }: Props) {
  // Observe DB changes automatically
  const items = useLiveQuery(() => db.groceryList.orderBy('id').reverse().toArray()) || [];
  
  const toggleItem = async (id: number, currentStatus: boolean) => {
    await db.groceryList.update(id, { 
      is_checked: !currentStatus,
      sync_status: 'pending'
    });
  };

  const removeItem = async (id: number) => {
    await db.groceryList.delete(id);
  };

  const totalDKK = items.reduce((acc, item) => acc + item.price_dkk, 0).toFixed(2);
  const totalEUR = items.reduce((acc, item) => acc + item.price_eur, 0).toFixed(2);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[200] flex flex-col justify-end pointer-events-auto">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Drawer */}
      <div className="relative w-full max-w-md mx-auto bg-slate-50 h-[80dvh] rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom-full duration-300">
        
        {/* Header */}
        <div className="p-5 border-b flex justify-between items-center bg-white rounded-t-3xl shadow-sm z-10">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-full">
              <ShoppingCart className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Shopping List</h2>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full active:scale-95 text-slate-500 hover:text-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3">
              <ShoppingCart className="w-12 h-12 opacity-20" />
              <p className="font-medium">Your list is empty.</p>
              <p className="text-sm">Scan items to add them!</p>
            </div>
          ) : (
            items.map(item => (
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
                    {item.sync_status === 'pending' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Pending Sync" />
                    )}
                  </div>
                </div>
                
                <div className={`text-right mr-3 ${item.is_checked ? 'opacity-50' : ''}`}>
                  <p className="font-bold text-slate-800">{item.price_dkk.toFixed(2)} kr</p>
                  <p className="text-xs font-semibold text-blue-600">€{item.price_eur.toFixed(2)}</p>
                </div>
                
                <button onClick={() => removeItem(item.id!)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-90">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Totals Footer */}
        <div className="p-6 bg-white border-t border-slate-200 rounded-b-3xl pb-8 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-bold uppercase tracking-wider text-xs">Estimated Total</span>
            <div className="text-right flex items-baseline gap-3">
              <p className="text-sm font-bold text-blue-600">≈ €{totalEUR}</p>
              <p className="text-2xl font-black text-slate-900">{totalDKK} <span className="text-sm font-bold text-slate-500">DKK</span></p>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
