"use client";

import { useState, useRef, useEffect } from 'react';
import { Camera, Upload, AlertTriangle, CheckCircle2, ShoppingCart, Settings, Sparkles, Circle } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { RawShelfAnalysis, ProductBoundingBox } from '../types/vision';
import { db } from '../lib/db';
import { useSyncEngine } from '../hooks/useSync';
import GroceryDrawer from './GroceryDrawer';
import { ProductBottomSheet } from './ProductBottomSheet';
import SettingsModal, { UserPreferences } from './SettingsModal';
import { API_URL } from '../lib/api';
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

export default function CameraScanner() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RawShelfAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // Modals & Drawers
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Live Budget calculation
  const cartItems = useLiveQuery(() => db.groceryList.toArray()) || [];
  const totalSpent = cartItems.reduce(
    (acc, item) => acc + ((item.price_dkk || 0) * (item.quantity || 1)) + ((item.pant_fee_dkk || 0) * (item.quantity || 1)),
    0
  );
  const [budgetTarget, setBudgetTarget] = useState<number>(200);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem('vognpilot_budget');
      if (saved) setBudgetTarget(parseFloat(saved) || 200);
    }
  }, [isDrawerOpen]);

  // User Preferences
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    if (typeof window !== "undefined") {
      try {
        const savedTheme = localStorage.getItem("vognpilot_theme") as "dark" | "light" | "system" | null;
        const savedLang = localStorage.getItem("vognpilot_language") as "en" | "it" | null;
        const savedCurrency = localStorage.getItem("vognpilot_currency") as "DKK" | "EUR" | null;
        const savedDietary = localStorage.getItem("vognpilot_dietary");
        return {
          theme: savedTheme || "system",
          language: savedLang || "en",
          currency: savedCurrency || "DKK",
          dietary: savedDietary ? JSON.parse(savedDietary) : DEFAULT_PREFERENCES.dietary,
        };
      } catch {
        return DEFAULT_PREFERENCES;
      }
    }
    return DEFAULT_PREFERENCES;
  });

  const t = getTranslation(preferences.language);

  // Apply theme on client mount & preference changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      const theme = preferences.theme;
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      } else if (theme === "light") {
        document.documentElement.classList.remove("dark");
      } else {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.classList.toggle("dark", isDark);
      }
    }
  }, [preferences.theme]);

  // Draggable bottom sheet height (percentage of viewport: 50% = half, 96% = full/expanded, 20% = peek)
  const [sheetHeight, setSheetHeight] = useState<number>(50);
  const [isDraggingSheet, setIsDraggingSheet] = useState<boolean>(false);
  const dragStartY = useRef<number>(0);
  const dragStartHeight = useRef<number>(50);

  const startDrag = (clientY: number) => {
    dragStartY.current = clientY;
    dragStartHeight.current = sheetHeight;
    setIsDraggingSheet(true);
  };

  useEffect(() => {
    if (!isDraggingSheet) return;

    const onPointerMove = (e: PointerEvent) => {
      const deltaY = e.clientY - dragStartY.current;
      const vh = window.innerHeight;
      const deltaPercent = (deltaY / vh) * 100;
      const nextHeight = Math.min(96, Math.max(20, dragStartHeight.current - deltaPercent));
      setSheetHeight(nextHeight);
    };

    const onPointerUp = () => {
      setIsDraggingSheet(false);
      setSheetHeight((current) => {
        if (current < 35) return 20;
        if (current > 70) return 96;
        return 50;
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isDraggingSheet]);

  const toggleSheetSnap = () => {
    setSheetHeight((prev) => {
      if (prev >= 75) return 50;
      return 96;
    });
  };

  const handleSelectBox = (idx: number | null) => {
    setSelectedBox(idx);
    if (idx !== null && sheetHeight < 35) {
      setSheetHeight(50);
    }
  };

  // Initialize offline sync engine
  useSyncEngine();

  // Multi-step progressive loading transitions
  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      return;
    }
    setLoadingStep(0);
    const t1 = setTimeout(() => setLoadingStep(1), 1600);
    const t2 = setTimeout(() => setLoadingStep(2), 3800);
    const t3 = setTimeout(() => setLoadingStep(3), 6200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [loading]);

  const compressAndResizeImage = (fileOrBlob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(fileOrBlob);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const maxDim = 1600;
        
        if (width > height && width > maxDim) {
          height = (height * maxDim) / width;
          width = maxDim;
        } else if (height > maxDim) {
          width = (width * maxDim) / height;
          height = maxDim;
        }
        
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(fileOrBlob);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, Math.round(width), Math.round(height));
        
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else resolve(fileOrBlob);
        }, 'image/jpeg', 0.88);
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      };

      img.src = objectUrl;
    });
  };

  const uploadToApi = async (file: Blob) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setSheetHeight(50);
    
    try {
      const optimizedBlob = await compressAndResizeImage(file);
      const formData = new FormData();
      formData.append("file", optimizedBlob, "shelf_capture.jpg");

      // Extract active dietary constraints
      const dietaryList: string[] = [];
      if (preferences.dietary.vegetarian) dietaryList.push("vegetarian");
      if (preferences.dietary.vegan) dietaryList.push("vegan");
      if (preferences.dietary.organic) dietaryList.push("organic");
      if (preferences.dietary.lactoseFree) dietaryList.push("lactose_free");
      if (preferences.dietary.glutenFree) dietaryList.push("gluten_free");

      formData.append("preferences", JSON.stringify({
        dietary_lifestyle: dietaryList,
        allergens_blacklist: [],
        currency: {
          primary: preferences.currency,
          favorite: preferences.currency === "DKK" ? "EUR" : "DKK",
          fixed_rate: 7.46
        }
      }));

      const res = await fetch(`${API_URL}/api/v1/scan/`, {
        method: "POST",
        body: formData
      });
      
      if (!res.ok) {
        throw new Error("Couldn't read this shelf clearly. Try moving closer or taking another shot.");
      }
      
      const data: RawShelfAnalysis = await res.json();
      setAnalysis(data);
    } catch (err: unknown) {
      console.error(err);
      setError(t.tryCloser);
    } finally {
      setLoading(false);
    }
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setImageUri(URL.createObjectURL(file));
      uploadToApi(file);
    }
    e.target.value = '';
  };

  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setImageUri(URL.createObjectURL(file));
      uploadToApi(file);
    }
    e.target.value = '';
  };

  const reset = () => {
    setImageUri(null);
    setAnalysis(null);
    setSelectedBox(null);
    setError(null);
    setSheetHeight(50);
  };

  const convertDKKtoEUR = (dkk: number) => (dkk / 7.46).toFixed(2);

  const handleAddToList = async (prod: ProductBoundingBox) => {
    const priceDkk = prod.package_price_dkk || prod.unit_price_dkk || 0;
    const priceEur = parseFloat(convertDKKtoEUR(priceDkk));
    const pantFee = prod.pant_fee_dkk || 0;
    
    const allItems = await db.groceryList.toArray();
    const existing = allItems.find(i => i.name === prod.label);
    
    if (existing && existing.id) {
       await db.groceryList.update(existing.id, {
          quantity: (existing.quantity || 1) + 1,
          pant_fee_dkk: pantFee || existing.pant_fee_dkk || 0,
          sync_status: 'pending'
       });
    } else {
       await db.groceryList.add({
         uuid: crypto.randomUUID(),
         name: prod.label,
         danish_term: prod.danish_term,
         price_dkk: priceDkk,
         price_eur: priceEur,
         pant_fee_dkk: pantFee,
         quantity: 1,
         is_checked: false,
         sync_status: 'pending',
         created_at: Date.now()
       });
    }
    
    setSelectedBox(null);
  };

  const activeDietaryCount = Object.values(preferences.dietary).filter(Boolean).length;

  return (
    <div className="relative w-full max-w-md mx-auto h-[100dvh] bg-zinc-950 text-zinc-100 overflow-hidden flex flex-col font-sans select-none transition-colors duration-200">
      
      {/* Hidden Native File Inputs */}
      <input 
        ref={cameraInputRef}
        type="file" 
        accept="image/*" 
        capture="environment" 
        className="hidden" 
        onChange={handleCameraCapture} 
      />
      <input 
        ref={galleryInputRef}
        type="file" 
        accept="image/*" 
        className="hidden" 
        onChange={handleGalleryUpload} 
      />

      {/* Top Bar Area: Fixed single-line h-14, zero wrap, dark unified palette */}
      <header className="h-14 w-full px-4 z-50 flex justify-between items-center bg-zinc-900/95 backdrop-blur-md border-b border-zinc-800 text-zinc-100 shrink-0">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2 cursor-pointer whitespace-nowrap flex-shrink-0" onClick={reset}>
          <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm flex-shrink-0">
            <span className="text-white font-black text-base">V</span>
          </div>
          <h1 className="font-extrabold text-lg tracking-tight leading-none text-zinc-100">VognPilot</h1>
        </div>

        {/* Right Actions: Settings & Live Cart Badge (No wrapping, exchange rate moved to cart footer) */}
        <div className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
          {/* Settings Button */}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 rounded-xl border border-zinc-700/80 transition-all active:scale-95 relative flex-shrink-0"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
            {activeDietaryCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-zinc-900" />
            )}
          </button>

          {/* Cart budget status button */}
          <button 
            onClick={() => setIsDrawerOpen(true)} 
            className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white px-3 py-1.5 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 flex-shrink-0 font-bold"
            aria-label="Shopping list and budget"
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="font-extrabold text-xs tracking-tight">
              {preferences.currency === "EUR" 
                ? `${(totalSpent / 7.46).toFixed(1)} / ${(budgetTarget / 7.46).toFixed(0)} €`
                : `${totalSpent.toFixed(0)} / ${budgetTarget} kr`}
            </span>
          </button>
        </div>
      </header>

      {/* Main View Area */}
      {!imageUri ? (
        // IDLE HERO STATE: Nordic Minimalist, Emerald Accented Home View
        <div className="flex-1 flex flex-col justify-between p-6 overflow-y-auto hide-scrollbar bg-zinc-950">
          
          {/* Center guidance */}
          <div className="flex-1 flex flex-col items-center justify-center text-center my-auto py-8">
            <div className="w-20 h-20 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6 shadow-sm">
              <Camera className="w-9 h-9 text-emerald-500" />
            </div>

            <h2 className="text-2xl font-black text-zinc-100 tracking-tight">
              {t.homeTitle}
            </h2>
            <p className="text-zinc-400 text-sm mt-3 max-w-xs leading-relaxed font-normal">
              {t.homeSubtitle}
            </p>

            {/* Active dietary filter badge */}
            {activeDietaryCount > 0 && (
              <div 
                onClick={() => setIsSettingsOpen(true)}
                className="mt-5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/60 border border-emerald-500/40 rounded-full text-emerald-400 text-xs font-semibold cursor-pointer hover:opacity-85 transition-opacity"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {preferences.language === 'it' 
                    ? `${activeDietaryCount} filtro alimentare attivo` 
                    : `${activeDietaryCount} dietary constraint${activeDietaryCount > 1 ? 's' : ''} active`}
                </span>
              </div>
            )}
          </div>

          {/* Bottom Action Bar */}
          <div className="w-full space-y-3 pb-4">
            {/* Primary Button: "Take Photo" (Nordic Emerald CTA) */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white py-4 px-6 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-emerald-900/30 transition-all active:scale-[0.98] font-bold text-base"
            >
              <Camera className="w-5 h-5" />
              <span>{t.takePhoto}</span>
            </button>

            {/* Secondary Button: "Gallery" (Enhanced border & contrast) */}
            <button
              onClick={() => galleryInputRef.current?.click()}
              className="w-full border border-zinc-700 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 py-3.5 px-6 rounded-2xl flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] font-semibold text-sm shadow-sm"
            >
              <Upload className="w-4 h-4 text-zinc-400" />
              <span>{t.gallery}</span>
            </button>
          </div>
        </div>
      ) : (
        // ACTIVE SCAN STATE: Image Viewport + Seamless Overlapping Bottom Sheet
        <div className="relative flex-1 w-full overflow-hidden flex flex-col bg-zinc-950">
          
          {/* Scanned Image Viewport Container */}
          <div 
            className="relative w-full bg-zinc-950 flex-shrink-0 flex flex-col items-center justify-center overflow-hidden z-10"
            style={{
              height: `${Math.max(0, 100 - sheetHeight)}%`,
              transition: isDraggingSheet ? 'none' : 'height 0.35s cubic-bezier(0.2, 0.9, 0.3, 1)'
            }}
          >
            <div className="relative inline-flex max-w-full max-h-full items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={imageUri} 
                alt="Scanned Shelf" 
                className={`max-w-full max-h-full w-auto h-auto object-contain block transition-opacity duration-300 ${loading ? 'opacity-70' : 'opacity-100'}`} 
              />
              
              {/* Subtle Calm Scan Pulse Overlay during loading */}
              {loading && (
                <div className="absolute inset-0 bg-zinc-950/30 backdrop-blur-[0.5px] pointer-events-none overflow-hidden">
                  <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-scan-laser opacity-80" />
                </div>
              )}

              {/* Bounding Boxes: Active Box STRICTLY matches Active Product Card border */}
              {!loading && analysis && (
                <div className="absolute inset-0 pointer-events-none">
                  {analysis.detected_products.map((prod, idx) => {
                    const [ymin, xmin, ymax, xmax] = prod.box_2d;
                    const top = (ymin / 1000) * 100;
                    const left = (xmin / 1000) * 100;
                    const height = ((ymax - ymin) / 1000) * 100;
                    const width = ((xmax - xmin) / 1000) * 100;
                    
                    const isWinner = idx === analysis.recommended_product_index;
                    const isSelected = selectedBox === idx;
                    const price = prod.package_price_dkk ?? prod.unit_price_dkk;

                    return (
                      <div 
                        key={idx}
                        onClick={() => handleSelectBox(isSelected ? null : idx)}
                        className={`absolute cursor-pointer transition-all duration-200 pointer-events-auto rounded-lg ${
                          isSelected
                            ? "border-2 border-emerald-500 bg-emerald-500/15 shadow-md z-[70]"
                            : isWinner
                            ? "border border-dashed border-teal-400/80 bg-teal-500/10 hover:border-teal-300 z-[60]"
                            : "border border-white/50 bg-black/20 hover:border-white z-[50]"
                        }`}
                        style={{ top: `${top}%`, left: `${left}%`, width: `${width}%`, height: `${height}%` }}
                      >
                        {/* Floating Price Pill */}
                        {price != null && (
                          <div 
                            className={`absolute -top-3 left-1 transition-all ${
                              isSelected 
                                ? "bg-emerald-600 text-white font-black text-xs px-2.5 py-1 rounded-md shadow-md scale-105"
                                : isWinner
                                ? "bg-teal-700 text-white font-bold text-[10px] px-1.5 py-0.5 rounded shadow-sm"
                                : "bg-zinc-900/90 text-zinc-200 font-semibold text-[10px] px-1.5 py-0.5 rounded shadow-sm backdrop-blur-sm"
                            }`}
                          >
                            {preferences.currency === "EUR" ? `€${convertDKKtoEUR(price)}` : `${price} kr`}
                          </div>
                        )}

                        {/* Recommendation badge */}
                        {isWinner && (
                          <div className={`absolute -top-2.5 -right-2 bg-emerald-600 text-white rounded-full p-0.5 shadow-md ${isSelected ? 'scale-110' : ''}`}>
                            <Sparkles className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Multi-Step Progressive Loading Bottom Sheet (Seamless Overlap & Zinc palette) */}
          {loading && (
            <div 
              className="w-full bg-zinc-900 flex flex-col overflow-hidden relative z-30 -mt-5 rounded-t-3xl shadow-[0_-12px_36px_rgba(0,0,0,0.35)] border-t border-zinc-800"
              style={{
                height: `calc(${sheetHeight}% + 20px)`,
                transition: isDraggingSheet ? 'none' : 'height 0.35s cubic-bezier(0.2, 0.9, 0.3, 1)'
              }}
            >
              <div className="p-4 pt-2 bg-zinc-900 rounded-t-3xl flex-1 flex flex-col h-full shadow-sm overflow-hidden text-zinc-100">
                <div 
                  onPointerDown={(e) => startDrag(e.clientY)}
                  onClick={toggleSheetSnap}
                  className="mx-auto w-full pt-1 pb-2 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none group"
                >
                  <div className="w-12 h-1.5 rounded-full bg-zinc-700 group-hover:bg-zinc-600 transition-colors" />
                </div>
                
                <div className="flex justify-between items-center px-2 mb-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-100 text-base tracking-tight">
                      {t.analyzingShelf}
                    </span>
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  </div>
                </div>

                {/* Multi-Step Checklist Card */}
                <div className="mx-2 mb-4 p-4 bg-zinc-950 text-zinc-200 rounded-2xl shadow-sm border border-zinc-800 space-y-3">
                  {/* Step 1 */}
                  <div className="flex items-center gap-3 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-semibold text-emerald-400">{t.photoProcessed}</span>
                  </div>

                  {/* Step 2 */}
                  <div className="flex items-center gap-3 text-xs">
                    {loadingStep >= 1 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin shrink-0" />
                    )}
                    <span className={`font-semibold ${loadingStep >= 1 ? 'text-emerald-400' : 'text-zinc-300'}`}>
                      {loadingStep >= 1 ? t.locatingProducts : (preferences.language === 'it' ? 'Individuazione prodotti...' : 'Locating products...')}
                    </span>
                  </div>

                  {/* Step 3 */}
                  <div className="flex items-center gap-3 text-xs">
                    {loadingStep >= 2 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : loadingStep === 1 ? (
                      <div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-zinc-700 shrink-0" />
                    )}
                    <span className={`font-medium ${loadingStep >= 2 ? 'text-emerald-400' : loadingStep === 1 ? 'text-zinc-300' : 'text-zinc-500'}`}>
                      {loadingStep >= 2 ? t.translatingLabels : (preferences.language === 'it' ? 'Lettura termini e prezzi...' : 'Reading terms & prices...')}
                    </span>
                  </div>

                  {/* Step 4 */}
                  <div className="flex items-center gap-3 text-xs">
                    {loadingStep >= 3 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : loadingStep === 2 ? (
                      <div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-zinc-700 shrink-0" />
                    )}
                    <span className={`font-medium ${loadingStep >= 3 ? 'text-emerald-400' : loadingStep === 2 ? 'text-zinc-300' : 'text-zinc-500'}`}>
                      {loadingStep >= 3 ? t.matchingDietary : (preferences.language === 'it' ? 'Verifica preferenze alimentari...' : 'Checking dietary preferences...')}
                    </span>
                  </div>
                </div>
                
                {/* Skeleton Cards preview */}
                <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-3 hide-scrollbar">
                  {[1, 2].map((idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between p-4 bg-zinc-950/60 rounded-2xl border border-zinc-800 shadow-sm animate-pulse"
                    >
                      <div className="flex-1 min-w-0 pr-4 space-y-2">
                        <div className="h-4 bg-zinc-800 rounded w-3/4" />
                        <div className="h-3 bg-zinc-850 rounded w-1/2" />
                      </div>
                      <div className="w-10 h-10 bg-zinc-800 rounded-xl shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Product List / Details Sheet (Seamless Overlap) */}
          {analysis && !loading && (
            <div 
              className="w-full flex-1 flex flex-col overflow-hidden relative z-30 -mt-5 rounded-t-3xl shadow-[0_-12px_36px_rgba(0,0,0,0.35)]"
              style={{
                height: `calc(${sheetHeight}% + 20px)`,
                transition: isDraggingSheet ? 'none' : 'height 0.35s cubic-bezier(0.2, 0.9, 0.3, 1)'
              }}
            >
              <ProductBottomSheet 
                analysis={analysis}
                selectedBox={selectedBox}
                onSelectProduct={handleSelectBox}
                onAddToList={handleAddToList}
                onNewScan={reset}
                convertDKKtoEUR={convertDKKtoEUR}
                sheetSnap={sheetHeight <= 35 ? 'peek' : sheetHeight >= 75 ? 'full' : 'half'}
                onDragStart={(e) => startDrag(e.clientY)}
                onToggleSnap={toggleSheetSnap}
                language={preferences.language}
                primaryCurrency={preferences.currency}
              />
            </div>
          )}
        </div>
      )}

      {/* Actionable Error State Dialog */}
      {error && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center z-[120] px-6 text-center animate-in fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-zinc-100">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
              <AlertTriangle className="w-7 h-7 text-rose-500" />
            </div>
            <h3 className="font-extrabold text-lg tracking-tight mb-2">
              {t.couldNotRead}
            </h3>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              {t.tryCloser}
            </p>
            <div className="w-full flex flex-col gap-2.5">
              <button 
                onClick={() => {
                  setError(null);
                  cameraInputRef.current?.click();
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-950/25 transition-all active:scale-95 text-sm flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                {t.retakePhoto}
              </button>
              <button 
                onClick={() => {
                  setError(null);
                  reset();
                }}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold py-2.5 rounded-xl transition-all active:scale-95 text-xs border border-zinc-700"
              >
                {t.dismiss}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        preferences={preferences}
        onUpdatePreferences={setPreferences}
      />

      {/* Grocery List Drawer */}
      <GroceryDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)}
        language={preferences.language}
        primaryCurrency={preferences.currency}
      />
    </div>
  );
}
