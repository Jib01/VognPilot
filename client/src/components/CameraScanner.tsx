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

  // Apply theme on client mount
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

  // Multi-step progressive loading transitions:
  // Step 0 (0s): Photo captured & processed -> Shelves and packages locating...
  // Step 1 (1.6s): Shelves and packages located -> Reading Danish terms & DKK prices...
  // Step 2 (3.8s): Danish terms & DKK prices read -> Matching dietary preferences...
  // Step 3 (6.2s): Matching preferences completed
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
      setError("Couldn't read this shelf clearly. Try moving closer or taking another shot.");
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
    <div className="relative w-full max-w-md mx-auto h-[100dvh] bg-slate-950 text-white overflow-hidden flex flex-col font-sans select-none">
      
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

      {/* Top Bar Area: VognPilot, currency badge, Cart budget status */}
      <header className="w-full px-4 py-3 z-50 flex justify-between items-center bg-slate-950/85 backdrop-blur-md border-b border-slate-800/60 shrink-0">
        <div className="flex items-center gap-2 cursor-pointer" onClick={reset}>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center shadow-md shadow-blue-500/20">
            <span className="text-white font-black text-base">V</span>
          </div>
          <h1 className="font-extrabold text-lg tracking-tight leading-none text-white">VognPilot</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Currency Badge: 1 € ≈ 7.46 kr */}
          <div className="bg-slate-900 text-[11px] text-slate-300 px-2.5 py-1.5 rounded-xl border border-slate-700/80 font-bold flex items-center gap-1 select-none">
            1 € ≈ 7.46 kr
          </div>

          {/* Settings Button */}
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-700/80 transition-all active:scale-95 relative"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
            {activeDietaryCount > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-slate-950" />
            )}
          </button>

          {/* Cart icon displaying current budget status: "XX / 200 kr" */}
          <button 
            onClick={() => setIsDrawerOpen(true)} 
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-xl shadow-lg shadow-blue-600/30 transition-all active:scale-95 flex items-center gap-1.5"
            aria-label="Shopping list and budget"
          >
            <ShoppingCart className="w-4 h-4" />
            <span className="font-extrabold text-xs tracking-tight">
              {totalSpent.toFixed(0)} / {budgetTarget} kr
            </span>
          </button>
        </div>
      </header>

      {/* Main View Area */}
      {!imageUri ? (
        // IDLE HERO STATE: Ultra-Clean Home View
        <div className="flex-1 flex flex-col justify-between p-6 overflow-y-auto hide-scrollbar bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
          
          {/* Center guidance */}
          <div className="flex-1 flex flex-col items-center justify-center text-center my-auto py-8">
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-blue-600 via-cyan-500 to-emerald-400 p-0.5 shadow-2xl shadow-cyan-500/20 flex items-center justify-center">
                <div className="w-full h-full bg-slate-950 rounded-[22px] flex items-center justify-center">
                  <Camera className="w-10 h-10 text-cyan-400" />
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 bg-cyan-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg">
                AI Scan
              </div>
            </div>

            <h2 className="text-3xl font-black text-white tracking-tight">
              Snap a shelf
            </h2>
            <p className="text-slate-400 text-sm mt-3 max-w-xs leading-relaxed font-normal">
              Point at 2–6 items to translate labels, check dietary tags, and track your budget.
            </p>

            {/* Active filter badge if set */}
            {activeDietaryCount > 0 && (
              <div 
                onClick={() => setIsSettingsOpen(true)}
                className="mt-5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/70 border border-emerald-500/40 rounded-full text-emerald-400 text-xs font-bold cursor-pointer hover:bg-emerald-900/50 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{activeDietaryCount} dietary constraint{activeDietaryCount > 1 ? 's' : ''} active</span>
              </div>
            )}
          </div>

          {/* Bottom Action Bar */}
          <div className="w-full space-y-3 pb-4">
            {/* Primary Button: "Take Photo" */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white py-4 px-6 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-blue-600/30 transition-all active:scale-[0.98] font-black text-lg"
            >
              <Camera className="w-6 h-6" />
              <span>Take Photo</span>
            </button>

            {/* Secondary Button: "Gallery" */}
            <button
              onClick={() => galleryInputRef.current?.click()}
              className="w-full bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-slate-200 py-3.5 px-6 rounded-2xl flex items-center justify-center gap-2.5 border border-slate-800 hover:border-slate-700 transition-all active:scale-[0.98] font-bold text-sm"
            >
              <Upload className="w-4 h-4 text-slate-400" />
              <span>Gallery</span>
            </button>
          </div>
        </div>
      ) : (
        // ACTIVE SCAN STATE: Image Viewport + Laser HUD + Responsive Bottom Sheet
        <div className="relative flex-1 w-full overflow-hidden flex flex-col bg-black">
          
          {/* Scanned Image Preview Container */}
          <div 
            className="relative w-full bg-black flex-shrink-0 flex flex-col items-center justify-center overflow-hidden z-20 shadow-xl border-b border-slate-800"
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
                className={`max-w-full max-h-full w-auto h-auto object-contain block transition-opacity duration-300 ${loading ? 'opacity-60' : 'opacity-100'}`} 
              />
              
              {/* Dark overlay & animated laser scanning line during loading */}
              {loading && (
                <>
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-[0.5px]" />
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div 
                      className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-scan-laser z-30"
                      style={{
                        boxShadow: "0 0 18px 4px rgba(6, 182, 212, 0.95), 0 0 32px 6px rgba(16, 185, 129, 0.7)"
                      }}
                    >
                      <div className="absolute inset-x-0 -top-8 h-8 bg-gradient-to-b from-transparent via-cyan-400/20 to-cyan-400/35" />
                      <div className="absolute inset-x-0 top-1 h-8 bg-gradient-to-b from-cyan-400/35 via-cyan-400/20 to-transparent" />
                    </div>
                  </div>

                  {/* Corner Reticles */}
                  <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-cyan-400 rounded-tl pointer-events-none z-30 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                  <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-cyan-400 rounded-tr pointer-events-none z-30 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                  <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-cyan-400 rounded-bl pointer-events-none z-30 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                  <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-cyan-400 rounded-br pointer-events-none z-30 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                </>
              )}

              {/* Decluttered Bounding Boxes (Single Selected Focus) */}
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
                            ? "border-[3px] border-blue-400 bg-blue-500/15 shadow-[0_0_18px_rgba(59,130,246,0.8)] z-[70]"
                            : isWinner
                            ? "border border-dashed border-emerald-400/80 bg-emerald-500/10 hover:border-emerald-300 z-[60]"
                            : "border border-dashed border-white/50 bg-black/15 hover:border-white/90 z-[50]"
                        }`}
                        style={{ top: `${top}%`, left: `${left}%`, width: `${width}%`, height: `${height}%` }}
                      >
                        {/* Floating Price Pill */}
                        {price != null && (
                          <div 
                            className={`absolute -top-3 left-1 transition-all ${
                              isSelected 
                                ? "bg-blue-600 text-white font-black text-xs px-2.5 py-1 rounded-md shadow-lg scale-105"
                                : isWinner
                                ? "bg-emerald-600/90 text-white font-extrabold text-[10px] px-1.5 py-0.5 rounded shadow backdrop-blur-sm"
                                : "bg-black/75 text-white/90 font-bold text-[10px] px-1.5 py-0.5 rounded shadow backdrop-blur-sm"
                            }`}
                          >
                            {price} kr
                          </div>
                        )}

                        {/* Recommendation badge */}
                        {isWinner && (
                          <div className={`absolute -top-2.5 -right-2 bg-emerald-500 text-white rounded-full p-0.5 shadow-md ${isSelected ? 'scale-110' : ''}`}>
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

          {/* Multi-Step Progressive Loading Bottom Sheet */}
          {loading && (
            <div 
              className="w-full bg-slate-50 flex flex-col overflow-hidden relative z-30 rounded-t-[2.5rem] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)]"
              style={{
                height: `${sheetHeight}%`,
                transition: isDraggingSheet ? 'none' : 'height 0.35s cubic-bezier(0.2, 0.9, 0.3, 1)'
              }}
            >
              <div className="p-4 pt-2 bg-white rounded-t-[2.5rem] flex-1 flex flex-col h-full shadow-sm overflow-hidden text-slate-800">
                <div 
                  onPointerDown={(e) => startDrag(e.clientY)}
                  onClick={toggleSheetSnap}
                  className="mx-auto w-full pt-1 pb-2 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none group"
                >
                  <div className="w-12 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-400 transition-colors" />
                </div>
                
                <div className="flex justify-between items-center px-2 mb-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-lg tracking-tight">Analyzing Shelf</span>
                    <span className="inline-block w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
                  </div>
                  <span className="text-[11px] font-bold bg-cyan-100 text-cyan-800 px-3 py-1 rounded-full animate-pulse">
                    Gemini Vision
                  </span>
                </div>

                {/* Interactive Multi-Step Checklist Card */}
                <div className="mx-2 mb-4 p-4 bg-slate-900 text-white rounded-2xl shadow-md border border-slate-800 space-y-3">
                  {/* Step 1 */}
                  <div className="flex items-center gap-3 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-semibold text-emerald-300">Photo captured & processed</span>
                  </div>

                  {/* Step 2 */}
                  <div className="flex items-center gap-3 text-xs">
                    {loadingStep >= 1 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin shrink-0" />
                    )}
                    <span className={`font-semibold ${loadingStep >= 1 ? 'text-emerald-300' : 'text-cyan-200'}`}>
                      {loadingStep >= 1 ? 'Shelves and packages located' : 'Locating shelves and packages...'}
                    </span>
                  </div>

                  {/* Step 3 */}
                  <div className="flex items-center gap-3 text-xs">
                    {loadingStep >= 2 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : loadingStep === 1 ? (
                      <div className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-600 shrink-0" />
                    )}
                    <span className={`font-medium ${loadingStep >= 2 ? 'text-emerald-300' : loadingStep === 1 ? 'text-cyan-200' : 'text-slate-500'}`}>
                      {loadingStep >= 2 ? 'Danish terms & DKK prices read' : 'Reading Danish terms & DKK prices...'}
                    </span>
                  </div>

                  {/* Step 4 */}
                  <div className="flex items-center gap-3 text-xs">
                    {loadingStep >= 3 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : loadingStep === 2 ? (
                      <div className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-600 shrink-0" />
                    )}
                    <span className={`font-medium ${loadingStep >= 3 ? 'text-emerald-300' : loadingStep === 2 ? 'text-cyan-200' : 'text-slate-500'}`}>
                      {loadingStep >= 3 ? 'Dietary preferences matched' : 'Matching your dietary preferences...'}
                    </span>
                  </div>
                </div>
                
                {/* Skeleton Cards preview */}
                <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-3 hide-scrollbar">
                  {[1, 2].map((idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm animate-pulse"
                    >
                      <div className="flex-1 min-w-0 pr-4 space-y-2">
                        <div className="h-4 bg-slate-200 rounded w-3/4" />
                        <div className="h-3 bg-slate-100 rounded w-1/2" />
                      </div>
                      <div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Product List / Details Sheet (Interactive 50% / 100%) */}
          {analysis && !loading && (
            <div 
              className="w-full bg-slate-50 flex flex-col overflow-hidden relative z-30 rounded-t-[2.5rem] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)]"
              style={{
                height: `${sheetHeight}%`,
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
              />
            </div>
          )}
        </div>
      )}

      {/* Actionable Error State Dialog */}
      {error && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center z-[120] px-6 text-center animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
              <AlertTriangle className="w-7 h-7 text-rose-500" />
            </div>
            <h3 className="font-extrabold text-white text-lg tracking-tight mb-2">
              Couldn&apos;t read this shelf clearly
            </h3>
            <p className="text-xs text-slate-300 mb-6 leading-relaxed">
              Try moving closer or taking another shot.
            </p>
            <div className="w-full flex flex-col gap-2.5">
              <button 
                onClick={() => {
                  setError(null);
                  cameraInputRef.current?.click();
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-600/25 transition-all active:scale-95 text-sm flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                Retake Photo
              </button>
              <button 
                onClick={() => {
                  setError(null);
                  reset();
                }}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-semibold py-2.5 rounded-xl transition-all active:scale-95 text-xs"
              >
                Dismiss
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
      />
    </div>
  );
}
