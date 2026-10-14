"use client";

import { useState, useRef, useEffect } from 'react';
import { Camera, Upload, AlertTriangle, CheckCircle2, ShoppingCart, Settings, Sparkles, Circle, Plus, Minus, Trash2, Target, Pencil, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScanResult, ProductCard } from '../types/vision';
import { db } from '../lib/db';
import { useSyncEngine } from '../hooks/useSync';
import { ScanResultSheet } from './ScanResultSheet';
import SettingsModal, { UserPreferences } from './SettingsModal';
import TutorialModal, { HelpButton } from './TutorialModal';
import { getTranslation } from '../lib/translations';

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  language: "en",
  currency: "DKK",
  dietary: {
    vegetarian: false,
    vegan: false,
    organic: false,
    lactoseFree: false,
    glutenFree: false,
  },
};

type AppView = 'dashboard' | 'scanning' | 'results';

export default function CameraScanner() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<AppView>('dashboard');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isBudgetDialogOpen, setIsBudgetDialogOpen] = useState(false);
  const [tempBudget, setTempBudget] = useState('200');

  // Live cart data from Dexie (order by auto-increment id reverse = newest first)
  const cartItems = useLiveQuery(() => db.groceryList.orderBy('id').reverse().toArray()) || [];
  const productsTotalDKK = cartItems.reduce((acc, item) => acc + ((item.price_dkk || 0) * (item.quantity || 1)), 0);
  const pantTotalDKK = cartItems.reduce((acc, item) => acc + ((item.pant_fee_dkk || 0) * (item.quantity || 1)), 0);
  const totalDKK = productsTotalDKK + pantTotalDKK;

  const [budgetTarget, setBudgetTarget] = useState<number>(200);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('vognpilot_budget');
      if (saved) {
        const val = parseFloat(saved) || 200;
        setBudgetTarget(val);
        setTempBudget(val.toString());
      }
    }
  }, []);

  // User Preferences
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedTheme = localStorage.getItem('vognpilot_theme') as 'dark' | 'light' | 'system' | null;
        const savedLang = localStorage.getItem('vognpilot_language') as 'en' | 'it' | null;
        const savedCurrency = localStorage.getItem('vognpilot_currency') as 'DKK' | 'EUR' | null;
        const savedDietary = localStorage.getItem('vognpilot_dietary');
        if (savedTheme || savedLang || savedCurrency || savedDietary) {
          setPreferences({
            theme: savedTheme || 'system',
            language: savedLang || 'en',
            currency: savedCurrency || 'DKK',
            dietary: savedDietary ? JSON.parse(savedDietary) : DEFAULT_PREFERENCES.dietary,
          });
        }
      } catch (err) {
        console.warn('Failed to parse preferences from localStorage:', err);
      }
    }
  }, []);

  const t = getTranslation(preferences.language);

  // Apply theme
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const theme = preferences.theme;
      if (theme === 'dark') document.documentElement.classList.add('dark');
      else if (theme === 'light') document.documentElement.classList.remove('dark');
      else {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', isDark);
      }
    }
  }, [preferences.theme]);

  useSyncEngine();

  // Loading step transitions
  useEffect(() => {
    if (view !== 'scanning') { setLoadingStep(0); return; }
    setLoadingStep(0);
    const t1 = setTimeout(() => setLoadingStep(1), 1800);
    const t2 = setTimeout(() => setLoadingStep(2), 3800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [view]);

  const compressImage = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const max = 1024;
        if (width > height && width > max) { height = (height * max) / width; width = max; }
        else if (height > max) { width = (width * max) / height; height = max; }
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = url;
    });

  const scanImage = async (file: Blob) => {
    setView('scanning');
    setError(null);
    setScanResult(null);

    try {
      const base64DataUrl = await compressImage(file);
      const base64 = base64DataUrl.split(',')[1] || base64DataUrl;

      const dietaryList: string[] = [];
      if (preferences.dietary.vegetarian) dietaryList.push('vegetarian');
      if (preferences.dietary.vegan) dietaryList.push('vegan');
      if (preferences.dietary.organic) dietaryList.push('organic');
      if (preferences.dietary.lactoseFree) dietaryList.push('lactose_free');
      if (preferences.dietary.glutenFree) dietaryList.push('gluten_free');

      // Call local Vercel API Route without trailing slash (no 308 redirect, clean JSON)
      const res = await fetch('/api/v1/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: base64,
          mimeType: 'image/jpeg',
          preferences: {
            dietary_lifestyle: dietaryList,
            currency: { primary: preferences.currency, fixed_rate: 7.46 },
          },
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        const errorMsg = errorJson?.error || `Server error: ${res.status}`;
        throw new Error(errorMsg);
      }

      const data: ScanResult = await res.json();
      setScanResult(data);
      setView('results');
    } catch (err: unknown) {
      console.error('[Scanner]', err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || t.tryCloser);
      setView('dashboard');
    }
  };

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setImageUri(URL.createObjectURL(file));
      scanImage(file);
    }
    e.target.value = '';
  };

  const reset = () => {
    setView('dashboard');
    setScanResult(null);
    setImageUri(null);
    setError(null);
  };

  const convertDKKtoEUR = (dkk: number) => (dkk / 7.46).toFixed(2);

  const handleAddToList = async (prod: ProductCard) => {
    const priceDkk = prod.package_price_dkk || prod.unit_price_dkk || 0;
    const priceEur = parseFloat(convertDKKtoEUR(priceDkk));
    const pantFee = prod.pant_fee_dkk || 0;
    const allItems = await db.groceryList.toArray();
    const existing = allItems.find(i => i.name === prod.label);
    if (existing?.id) {
      await db.groceryList.update(existing.id, { quantity: (existing.quantity || 1) + 1, sync_status: 'pending' });
    } else {
      const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

      await db.groceryList.add({
        uuid, name: prod.label, danish_term: prod.danish_term,
        price_dkk: priceDkk, price_eur: priceEur, pant_fee_dkk: pantFee,
        quantity: 1, is_checked: false, sync_status: 'pending', created_at: Date.now(),
      });
    }
  };

  const updateQty = async (id: number, current: number, delta: number) => {
    await db.groceryList.update(id, { quantity: Math.max(1, current + delta), sync_status: 'pending' });
  };
  const removeItem = async (id: number) => { await db.groceryList.delete(id); };
  const toggleItem = async (id: number, checked: boolean) => {
    await db.groceryList.update(id, { is_checked: !checked, sync_status: 'pending' });
  };

  const saveBudget = () => {
    const num = Math.max(10, parseFloat(tempBudget) || 200);
    setBudgetTarget(num);
    localStorage.setItem('vognpilot_budget', num.toString());
    setIsBudgetDialogOpen(false);
  };

  const budgetPercent = Math.min((totalDKK / budgetTarget) * 100, 100);
  const isOverBudget = totalDKK > budgetTarget;
  const activeDietaryCount = Object.values(preferences.dietary).filter(Boolean).length;

  const formatCartPrice = (dkk: number) =>
    preferences.currency === 'EUR' ? `€${(dkk / 7.46).toFixed(2)}` : `${dkk.toFixed(2)} kr`;

  return (
    <div className="relative w-full max-w-md mx-auto h-[100dvh] bg-zinc-950 text-zinc-100 overflow-hidden flex flex-col font-sans select-none">

      {/* Hidden file inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleCapture} />

      {/* ─── HEADER ─── */}
      <header className="h-14 w-full px-4 z-50 flex justify-between items-center bg-zinc-900/95 backdrop-blur-md border-b border-zinc-800 text-zinc-100 shrink-0">
        <div className="flex items-center gap-2 cursor-pointer whitespace-nowrap flex-shrink-0" onClick={reset}>
          <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm">
            <span className="text-white font-black text-base">V</span>
          </div>
          <h1 className="font-extrabold text-lg tracking-tight text-zinc-100">VognPilot</h1>
        </div>

        <div className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
          {/* Help / Tutorial */}
          <HelpButton onClick={() => setIsTutorialOpen(true)} />

          {/* Settings */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 rounded-xl border border-zinc-700/80 transition-all active:scale-95 relative flex-shrink-0"
          >
            <Settings className="w-4 h-4" />
            {activeDietaryCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-zinc-900" />
            )}
          </button>

          {/* Live cart total (compact, always visible) */}
          <div className="bg-zinc-800 border border-zinc-700 text-zinc-100 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-extrabold flex-shrink-0">
            <ShoppingCart className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {preferences.currency === 'EUR'
                ? `€${(totalDKK / 7.46).toFixed(1)}`
                : `${totalDKK.toFixed(0)} kr`}
            </span>
          </div>
        </div>
      </header>

      {/* ─── SCANNING VIEW ─── */}
      {view === 'scanning' && imageUri && (
        <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
          {/* Photo fill */}
          <div className="relative flex-1 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUri} alt="Scanning" className="w-full h-full object-cover opacity-50" />
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-0">
              {/* Scan laser line */}
              <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-scan-laser opacity-90 pointer-events-none" />
            </div>
          </div>

          {/* Loading sheet */}
          <div className="bg-zinc-900 border-t border-zinc-800 p-4 pb-6 shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <span className="font-bold text-zinc-100 text-base">{t.analyzingShelf}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
            </div>
            <div className="space-y-3">
              {[
                { label: t.photoProcessed, done: true },
                { label: loadingStep >= 1 ? t.locatingProducts : 'Locating products...', done: loadingStep >= 1, active: loadingStep === 0 },
                { label: loadingStep >= 2 ? t.translatingLabels : 'Translating labels & prices...', done: loadingStep >= 2, active: loadingStep === 1 },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  {step.done
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    : step.active
                    ? <div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin shrink-0" />
                    : <Circle className="w-4 h-4 text-zinc-700 shrink-0" />}
                  <span className={step.done ? 'text-emerald-400 font-semibold' : step.active ? 'text-zinc-300 font-medium' : 'text-zinc-500'}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── SCAN RESULTS VIEW ─── */}
      {view === 'results' && scanResult && imageUri && (
        <div className="flex-1 overflow-hidden">
          <ScanResultSheet
            scan={scanResult}
            imageUri={imageUri}
            onAddToList={handleAddToList}
            onNewScan={reset}
            convertDKKtoEUR={convertDKKtoEUR}
            language={preferences.language}
            primaryCurrency={preferences.currency}
          />
        </div>
      )}

      {/* ─── DASHBOARD (HOME) ─── */}
      {view === 'dashboard' && (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Budget Card */}
          <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/60 shrink-0">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                <Target className="w-3.5 h-3.5 text-emerald-400" />
                Budget
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-extrabold ${isOverBudget ? 'text-rose-400' : 'text-zinc-100'}`}>
                  {preferences.currency === 'EUR'
                    ? `€${(totalDKK / 7.46).toFixed(1)} / €${(budgetTarget / 7.46).toFixed(0)}`
                    : `${totalDKK.toFixed(0)} / ${budgetTarget} kr`}
                </span>
                <button
                  onClick={() => { setTempBudget(budgetTarget.toString()); setIsBudgetDialogOpen(true); }}
                  className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-900/60 px-2 py-0.5 rounded-full flex items-center gap-1 active:scale-95"
                >
                  <Pencil className="w-2.5 h-2.5" /> Edit
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${isOverBudget ? 'bg-rose-500' : budgetPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>

            {/* Quick preset chips */}
            <div className="flex gap-2 mt-2">
              {[100, 200, 300, 500].map(p => (
                <button
                  key={p}
                  onClick={() => { setBudgetTarget(p); localStorage.setItem('vognpilot_budget', p.toString()); }}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all active:scale-95 ${
                    budgetTarget === p
                      ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {p} kr
                </button>
              ))}
            </div>
          </div>

          {/* Cart Items (scrollable) */}
          <div className="flex-1 overflow-y-auto hide-scrollbar px-3 py-3 space-y-2 pb-28">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-3 py-12">
                <ShoppingCart className="w-12 h-12 opacity-20" />
                <p className="font-semibold text-zinc-400 text-sm">{t.emptyList}</p>
                <p className="text-xs text-center px-6 text-zinc-500 leading-relaxed">{t.emptyListSub}</p>
              </div>
            ) : (
              <>
                {cartItems.map(item => {
                  const qty = item.quantity || 1;
                  const rowTotal = ((item.price_dkk || 0) + (item.pant_fee_dkk || 0)) * qty;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center p-3 rounded-2xl border transition-all ${
                        item.is_checked
                          ? 'bg-zinc-950/30 border-zinc-800/40 opacity-50'
                          : 'bg-zinc-900 border-zinc-800 shadow-sm'
                      }`}
                    >
                      <button onClick={() => toggleItem(item.id!, item.is_checked)} className="mr-3 active:scale-90 transition-transform flex-shrink-0">
                        {item.is_checked
                          ? <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                          : <Circle className="w-6 h-6 text-zinc-600" />}
                      </button>

                      <div className="flex-1 min-w-0 pr-2">
                        <p className={`font-bold text-sm text-zinc-100 truncate ${item.is_checked ? 'line-through' : ''}`}>
                          {item.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {/* Qty controls */}
                          <div className="flex items-center bg-zinc-800 rounded-lg border border-zinc-700">
                            <button onClick={() => updateQty(item.id!, qty, -1)} className="px-2 py-0.5 active:bg-zinc-700 rounded-l-lg text-zinc-300">
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-black text-zinc-200 w-5 text-center">{qty}</span>
                            <button onClick={() => updateQty(item.id!, qty, 1)} className="px-2 py-0.5 active:bg-zinc-700 rounded-r-lg text-zinc-300">
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="text-xs font-black text-zinc-200">{formatCartPrice(rowTotal)}</span>
                          {item.pant_fee_dkk && item.pant_fee_dkk > 0 && (
                            <span className="text-[10px] text-zinc-400 bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded">+{item.pant_fee_dkk} Pant</span>
                          )}
                        </div>
                      </div>

                      <button onClick={() => removeItem(item.id!)} className="p-1.5 text-zinc-500 hover:text-rose-400 active:scale-90 transition-colors flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}

                {/* Cart subtotal footer */}
                {cartItems.length > 0 && (
                  <div className="pt-2 pb-1 border-t border-zinc-800 flex justify-between items-center text-xs text-zinc-400">
                    <span>{cartItems.length} item{cartItems.length > 1 ? 's' : ''}</span>
                    <div className="text-right">
                      {pantTotalDKK > 0 && <span className="block text-emerald-400">+{pantTotalDKK.toFixed(2)} kr Pant</span>}
                      <span className="font-extrabold text-zinc-100 text-sm">
                        {preferences.currency === 'EUR' ? `≈ €${(totalDKK / 7.46).toFixed(2)}` : `${totalDKK.toFixed(2)} kr`}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Floating Action Bar */}
          <div className="absolute bottom-0 left-0 right-0 p-4 pb-safe bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent pointer-events-none">
            <div className="flex gap-3 pointer-events-auto">
              {/* Primary: Scan */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white py-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-base shadow-lg shadow-emerald-950/30 transition-all active:scale-[0.98]"
              >
                <Camera className="w-5 h-5" />
                {t.takePhoto}
              </button>

              {/* Secondary: Gallery */}
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="w-16 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-zinc-200 rounded-2xl flex items-center justify-center transition-all active:scale-[0.98] shadow-sm"
                aria-label={t.gallery}
              >
                <Upload className="w-5 h-5" />
              </button>
            </div>

            {/* Dietary filter hint */}
            {activeDietaryCount > 0 && (
              <div
                onClick={() => setIsSettingsOpen(true)}
                className="mt-2 flex items-center justify-center gap-1.5 text-xs text-emerald-400 cursor-pointer opacity-80 pointer-events-auto"
              >
                <Sparkles className="w-3 h-3" />
                <span>{activeDietaryCount} dietary filter{activeDietaryCount > 1 ? 's' : ''} active</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── ERROR OVERLAY ─── */}
      {error && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-[120] px-6 animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center text-zinc-100">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
              <AlertTriangle className="w-7 h-7 text-rose-400" />
            </div>
            <h3 className="font-extrabold text-lg mb-2">{t.couldNotRead}</h3>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed break-words max-h-32 overflow-y-auto px-1">
              {error}
            </p>
            <div className="w-full flex flex-col gap-2.5">
              <button
                onClick={() => { setError(null); cameraInputRef.current?.click(); }}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <Camera className="w-4 h-4" /> {t.retakePhoto}
              </button>
              <button
                onClick={() => setError(null)}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 font-semibold py-2.5 rounded-xl active:scale-95 transition-all text-xs"
              >
                {t.dismiss}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Budget Dialog */}
      {isBudgetDialogOpen && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-2xl text-zinc-100 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base">Set Budget</h3>
              <button onClick={() => setIsBudgetDialogOpen(false)} className="p-1.5 rounded-full bg-zinc-800 text-zinc-400 hover:text-white active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[100, 200, 300, 500].map(p => (
                <button
                  key={p}
                  onClick={() => setTempBudget(p.toString())}
                  className={`py-2 text-xs font-bold rounded-xl border transition-all active:scale-95 ${
                    tempBudget === p.toString()
                      ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  {p} kr
                </button>
              ))}
            </div>
            <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 focus-within:border-emerald-500 transition-colors">
              <input
                type="number" inputMode="numeric" value={tempBudget}
                onChange={e => setTempBudget(e.target.value)}
                className="w-full bg-transparent text-zinc-100 font-extrabold text-base focus:outline-none"
                placeholder="200"
              />
              <span className="text-xs font-bold text-zinc-400 ml-2">kr</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsBudgetDialogOpen(false)} className="flex-1 bg-zinc-800 text-zinc-300 font-bold py-2.5 rounded-xl text-xs border border-zinc-700 active:scale-95">Cancel</button>
              <button onClick={saveBudget} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs active:scale-95">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} preferences={preferences} onUpdatePreferences={setPreferences} />

      {/* Tutorial Modal */}
      <TutorialModal isOpen={isTutorialOpen} onClose={() => setIsTutorialOpen(false)} />
    </div>
  );
}
