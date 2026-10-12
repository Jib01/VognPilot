"use client";

import { useState, useRef, useEffect } from 'react';
import { Upload, AlertTriangle, CheckCircle2, ShoppingCart } from 'lucide-react';
import { RawShelfAnalysis, ProductBoundingBox } from '../types/vision';
import { db } from '../lib/db';
import { useSyncEngine } from '../hooks/useSync';
import GroceryDrawer from './GroceryDrawer';

import { ProductBottomSheet } from './ProductBottomSheet';
import { API_URL } from '../lib/api';

const SCAN_STEPS = [
  "Inquadratura scaffale in corso...",
  "Rilevamento prodotti e prezzi DKK...",
  "Verifica preferenze dietetiche...",
  "Generazione dettagli..."
];

export default function CameraScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RawShelfAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // Interactions
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Draggable bottom sheet height (percentage of viewport: 18% = peek, 50% = half, 86% = full)
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
      // Pulling down (positive delta) decreases height, pulling up increases height
      const nextHeight = Math.min(86, Math.max(18, dragStartHeight.current - deltaPercent));
      setSheetHeight(nextHeight);
    };

    const onPointerUp = () => {
      setIsDraggingSheet(false);
      setSheetHeight((current) => {
        if (current < 32) return 18;
        if (current > 68) return 86;
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
      if (prev < 32) return 50;
      if (prev < 68) return 86;
      return 50;
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

  // Rotate loading step messages every 2.2s during analysis
  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStep((prev) => (prev + 1) % SCAN_STEPS.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [loading]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const captureAndScan = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(videoRef.current, 0, 0);
    
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setImageUri(URL.createObjectURL(blob));
      if (stream) stream.getTracks().forEach(track => track.stop());
      await uploadToApi(blob);
    }, 'image/jpeg', 0.95);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setImageUri(URL.createObjectURL(file));
      if (stream) stream.getTracks().forEach(track => track.stop());
      uploadToApi(file);
    }
  };

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
    
    try {
      const optimizedBlob = await compressAndResizeImage(file);
      const formData = new FormData();
      formData.append("file", optimizedBlob, "capture.jpg");
      formData.append("preferences", JSON.stringify({
        dietary_lifestyle: ["vegetarian"],
        allergens_blacklist: [],
        currency: { primary: "DKK", favorite: "EUR", fixed_rate: 7.46 }
      }));

      const res = await fetch(`${API_URL}/api/v1/scan/`, {
        method: "POST",
        body: formData
      });
      
      if (!res.ok) {
        const errorData = await res.text();
        throw new Error(`Server Error (${res.status}): ${errorData}`);
      }
      
      const data: RawShelfAnalysis = await res.json();
      setAnalysis(data);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Network error. Make sure FastAPI is running.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setImageUri(null);
    setAnalysis(null);
    setSelectedBox(null);
    setError(null);
    setSheetHeight(50);
    startCamera();
  };

  const convertDKKtoEUR = (dkk: number) => (dkk / 7.46).toFixed(2);

  const handleAddToList = async (prod: ProductBoundingBox) => {
    const priceDkk = prod.package_price_dkk || prod.unit_price_dkk || 0;
    const priceEur = parseFloat(convertDKKtoEUR(priceDkk));
    
    // Dexie unindexed field workaround
    const allItems = await db.groceryList.toArray();
    const existing = allItems.find(i => i.name === prod.label);
    
    if (existing && existing.id) {
       await db.groceryList.update(existing.id, {
          quantity: (existing.quantity || 1) + 1,
          sync_status: 'pending'
       });
    } else {
       await db.groceryList.add({
         uuid: crypto.randomUUID(),
         name: prod.label,
         danish_term: prod.danish_term,
         price_dkk: priceDkk,
         price_eur: priceEur,
         quantity: 1,
         is_checked: false,
         sync_status: 'pending',
         created_at: Date.now()
       });
    }
    
    setSelectedBox(null);
  };

  return (
    <div className="relative w-full max-w-md mx-auto h-[100dvh] bg-black overflow-hidden flex flex-col font-sans">
      
      {/* Top Bar Area */}
      <div className="absolute top-0 left-0 w-full p-4 z-50 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <h1 className="text-white font-bold text-xl tracking-tight drop-shadow-md">VognPilot</h1>
        <div className="flex items-center gap-3">
          <div className="bg-slate-800/80 text-xs text-white px-3 py-1.5 rounded-full backdrop-blur-md border border-slate-700 font-medium">
            DKK → EUR
          </div>
          <button 
            onClick={() => setIsDrawerOpen(true)} 
            className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-full shadow-xl transition-colors active:scale-95"
          >
            <ShoppingCart className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Camera / Image Viewport */}
      {!imageUri ? (
        <div className="relative flex-1 w-full bg-slate-900 overflow-hidden rounded-b-3xl">
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        </div>
      ) : (
        <div 
          className="relative w-full bg-black flex-shrink-0 flex flex-col items-center justify-center overflow-hidden z-20 shadow-xl border-b border-slate-800"
          style={{
            height: `${100 - sheetHeight}%`,
            transition: isDraggingSheet ? 'none' : 'height 0.35s cubic-bezier(0.2, 0.9, 0.3, 1)'
          }}
        >
          <div className="relative inline-flex max-w-full max-h-full items-center justify-center">
            <img 
              src={imageUri} 
              alt="Scanned Shelf" 
              className={`max-w-full max-h-full w-auto h-auto object-contain block transition-opacity duration-300 ${loading ? 'opacity-75' : 'opacity-100'}`} 
            />
            
            {/* Dark overlay & blur during scanning */}
            {loading && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[0.5px]" />
            )}

            {/* Cyber Laser Scanner and HUD during loading */}
            {loading && (
              <>
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  <div 
                    className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-scan-laser z-30"
                    style={{
                      boxShadow: "0 0 16px 3px rgba(6, 182, 212, 0.95), 0 0 32px 6px rgba(16, 185, 129, 0.65)"
                    }}
                  >
                    <div className="absolute inset-x-0 -top-7 h-7 bg-gradient-to-b from-transparent via-cyan-400/15 to-cyan-400/30" />
                    <div className="absolute inset-x-0 top-1 h-7 bg-gradient-to-b from-cyan-400/30 via-cyan-400/15 to-transparent" />
                  </div>
                </div>

                {/* Viewfinder Corners */}
                <div className="absolute top-2.5 left-2.5 w-5 h-5 border-t-2 border-l-2 border-cyan-400 rounded-tl pointer-events-none z-30 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                <div className="absolute top-2.5 right-2.5 w-5 h-5 border-t-2 border-r-2 border-cyan-400 rounded-tr pointer-events-none z-30 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                <div className="absolute bottom-2.5 left-2.5 w-5 h-5 border-b-2 border-l-2 border-cyan-400 rounded-bl pointer-events-none z-30 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                <div className="absolute bottom-2.5 right-2.5 w-5 h-5 border-b-2 border-r-2 border-cyan-400 rounded-br pointer-events-none z-30 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />

                {/* Floating Rotating Message Badge */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 bg-slate-950/85 backdrop-blur-md rounded-full border border-cyan-500/50 shadow-2xl flex items-center gap-2 max-w-[90%] pointer-events-none">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                  </span>
                  <p className="text-xs font-medium text-cyan-50 tracking-wide truncate">
                    {SCAN_STEPS[loadingStep]}
                  </p>
                </div>
              </>
            )}

            {/* Bounding Boxes */}
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
                  const borderColor = isSelected ? "border-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.3)]" : (isWinner ? "border-green-500 shadow-lg" : "border-white/60");
                  const zIndex = isSelected ? 60 : 50;

                  return (
                    <div 
                      key={idx}
                      onClick={() => handleSelectBox(isSelected ? null : idx)}
                      className={`absolute border-[3px] rounded-lg cursor-pointer transition-all pointer-events-auto ${borderColor}`}
                      style={{ top: `${top}%`, left: `${left}%`, width: `${width}%`, height: `${height}%`, zIndex }}
                    >
                      {isWinner && (
                        <div className="absolute -top-3 -left-3 bg-green-500 text-white rounded-full p-1 shadow-md">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Loading Skeleton Bottom Sheet */}
      {imageUri && loading && (
        <div 
          className="w-full bg-slate-50 flex flex-col overflow-hidden relative z-30 rounded-t-[2.5rem] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)]"
          style={{
            height: `${sheetHeight}%`,
            transition: isDraggingSheet ? 'none' : 'height 0.35s cubic-bezier(0.2, 0.9, 0.3, 1)'
          }}
        >
          <div className="p-4 pt-2 bg-white rounded-t-[2.5rem] flex-1 flex flex-col h-full shadow-sm overflow-hidden">
            <div 
              onPointerDown={(e) => startDrag(e.clientY)}
              onClick={toggleSheetSnap}
              className="mx-auto w-full pt-1 pb-2 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none -mt-1 group"
            >
              <div className="w-12 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-400 transition-colors" />
              <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                {sheetHeight <= 25 ? <span>Trascina su ↑</span> : sheetHeight >= 70 ? <span>Trascina giù ↓</span> : <span>Trascina ↕</span>}
              </div>
            </div>
            
            <div className="flex justify-between items-center px-2 mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 text-lg tracking-tight">Rilevamento prodotti</span>
                <span className="inline-block w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
              </div>
              <span className="text-[11px] font-bold bg-cyan-100 text-cyan-800 px-3 py-1 rounded-full animate-pulse">
                Analisi AI...
              </span>
            </div>
            
            <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-3 hide-scrollbar">
              {[1, 2, 3].map((idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm animate-pulse"
                >
                  <div className="flex-1 min-w-0 pr-4 space-y-2">
                    <div className="h-4 bg-slate-200 rounded w-3/4" />
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                    <div className="flex items-baseline gap-2 pt-1">
                      <div className="h-5 bg-slate-200 rounded w-16" />
                      <div className="h-4 bg-blue-100 rounded w-10" />
                    </div>
                  </div>
                  <div className="w-11 h-11 bg-slate-100 rounded-xl shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Product List / Details Panel */}
      {imageUri && analysis && !loading && (
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
            sheetSnap={sheetHeight <= 25 ? 'peek' : sheetHeight >= 70 ? 'full' : 'half'}
            onDragStart={(e) => startDrag(e.clientY)}
            onToggleSnap={toggleSheetSnap}
          />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-[100] px-6 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
          <p className="font-bold mb-2 text-xl">Connection Error</p>
          <p className="text-sm text-slate-300 mb-6">{error}</p>
          <button onClick={() => setError(null)} className="bg-white text-black px-6 py-2 rounded-full font-bold">
            Dismiss
          </button>
        </div>
      )}
      
      {!imageUri && (
        <div className="h-32 bg-slate-950 w-full rounded-t-[2.5rem] flex items-center justify-around px-6 relative shrink-0 z-40 border-t border-slate-800">
          <label className="flex flex-col items-center justify-center text-slate-400 cursor-pointer p-3 hover:text-white transition-colors">
            <Upload className="w-6 h-6 mb-1" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Galleria</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>
          
          <button 
            onClick={captureAndScan}
            disabled={loading}
            className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-[0_0_0_4px_rgba(255,255,255,0.2)] active:scale-90 transition-transform"
          >
            <div className="w-[3.25rem] h-[3.25rem] border-4 border-slate-950 rounded-full" />
          </button>
          
          <div className="flex flex-col items-center justify-center text-slate-600 p-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 mb-1"><path d="M10 22h4"/><path d="M14 2h-4"/><path d="m14 18-4-4"/><path d="m10 6 4 4"/></svg>
            <span className="text-[10px] font-bold uppercase tracking-wider">Flash</span>
          </div>
        </div>
      )}

      {/* Grocery List Drawer overlay */}
      <GroceryDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
}
