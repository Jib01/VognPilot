"use client";

import { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, AlertTriangle, CheckCircle2, ShoppingCart } from 'lucide-react';
import { RawShelfAnalysis, ProductBoundingBox } from '../types/vision';
import { db } from '../lib/db';
import { useSyncEngine } from '../hooks/useSync';
import GroceryDrawer from './GroceryDrawer';

import { ProductBottomSheet } from './ProductBottomSheet';

export default function CameraScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RawShelfAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Interactions
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [snap, setSnap] = useState<number | string | null>(0.25);

  // Initialize offline sync engine
  useSyncEngine();

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
    }, 'image/jpeg', 0.8);
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
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const maxDim = 1600;
        
        if (width > height && width > maxDim) {
          height *= maxDim / width;
          width = maxDim;
        } else if (height > maxDim) {
          width *= maxDim / height;
          height = maxDim;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/jpeg', 0.8);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(fileOrBlob);
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

      const res = await fetch("http://localhost:8000/api/v1/scan/", {
        method: "POST",
        body: formData
      });
      
      if (!res.ok) {
        const errorData = await res.text();
        throw new Error(`Server Error (${res.status}): ${errorData}`);
      }
      
      const data: RawShelfAnalysis = await res.json();
      setAnalysis(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Network error. Make sure FastAPI is running.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setImageUri(null);
    setAnalysis(null);
    setSelectedBox(null);
    setError(null);
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
          
          {loading && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white z-[100]">
              <Loader2 className="w-12 h-12 animate-spin mb-4 text-green-400" />
              <p className="font-medium animate-pulse">Analyzing shelves with Gemini...</p>
            </div>
          )}
        </div>
      ) : (
        <div className="relative w-full bg-black flex-shrink-0 flex flex-col items-center justify-start max-h-[55dvh] z-20 shadow-xl border-b border-slate-800">
          <div className="relative inline-flex max-w-full max-h-[55dvh]">
            <img src={imageUri} alt="Scanned Shelf" className="max-w-full max-h-[55dvh] w-auto h-auto object-contain block" />
            
            <div className="absolute inset-0 pointer-events-none">
              {/* Bounding Boxes */}
              {analysis && analysis.detected_products.map((prod, idx) => {
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
                    onClick={() => setSelectedBox(isSelected ? null : idx)}
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
          </div>
          
          {loading && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white z-[100]">
              <Loader2 className="w-12 h-12 animate-spin mb-4 text-green-400" />
              <p className="font-medium animate-pulse">Analyzing shelves with Gemini...</p>
            </div>
          )}
        </div>
      )}
      {/* Product List / Details Panel */}
      {imageUri && analysis && (
        <div className="flex-1 w-full bg-slate-50 flex flex-col overflow-hidden relative z-30">
          <ProductBottomSheet 
            analysis={analysis}
            selectedBox={selectedBox}
            onSelectProduct={setSelectedBox}
            onAddToList={handleAddToList}
            onNewScan={reset}
            convertDKKtoEUR={convertDKKtoEUR}
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
