"use client";

import { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, AlertTriangle, CheckCircle2, ShoppingCart } from 'lucide-react';
import { RawShelfAnalysis, ProductBoundingBox } from '../types/vision';
import { db } from '../lib/db';
import { useSyncEngine } from '../hooks/useSync';
import GroceryDrawer from './GroceryDrawer';

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

  const uploadToApi = async (file: Blob) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    
    const formData = new FormData();
    formData.append("file", file, "capture.jpg");
    formData.append("preferences", JSON.stringify({
      dietary_lifestyle: ["vegetarian"],
      allergens_blacklist: [],
      currency: { primary: "DKK", favorite: "EUR", fixed_rate: 7.46 }
    }));

    try {
      const res = await fetch("http://localhost:8000/api/v1/scan/", {
        method: "POST",
        body: formData
      });
      
      if (!res.ok) throw new Error("Failed to analyze image with API.");
      
      const data: RawShelfAnalysis = await res.json();
      setAnalysis(data);
    } catch (err: any) {
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
    const priceDkk = prod.package_price_dkk || prod.unit_price_dkk;
    const priceEur = parseFloat(convertDKKtoEUR(priceDkk));
    
    await db.groceryList.add({
      uuid: crypto.randomUUID(),
      name: prod.label,
      danish_term: prod.danish_term,
      price_dkk: priceDkk,
      price_eur: priceEur,
      is_checked: false,
      sync_status: 'pending',
      created_at: Date.now()
    });
    
    setSelectedBox(null); // Close tooltip on success
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
      <div className="relative flex-1 w-full h-full bg-slate-900">
        {!imageUri ? (
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <img src={imageUri} alt="Scanned Shelf" className="absolute inset-0 w-full h-full object-cover" />
        )}

        {/* Bounding Boxes */}
        {analysis && analysis.detected_products.map((prod, idx) => {
          const [ymin, xmin, ymax, xmax] = prod.box_2d;
          const top = (ymin / 1000) * 100;
          const left = (xmin / 1000) * 100;
          const height = ((ymax - ymin) / 1000) * 100;
          const width = ((xmax - xmin) / 1000) * 100;
          
          const isWinner = idx === analysis.recommended_product_index;
          const borderColor = isWinner ? "border-green-500" : "border-slate-300";
          const bgColor = isWinner ? "bg-green-500" : "bg-slate-800";
          const zIndex = selectedBox === idx ? 60 : 50;

          return (
            <div 
              key={idx}
              onClick={() => setSelectedBox(selectedBox === idx ? null : idx)}
              className={`absolute border-[3px] rounded-lg shadow-lg cursor-pointer transition-colors ${borderColor}`}
              style={{ top: `${top}%`, left: `${left}%`, width: `${width}%`, height: `${height}%`, zIndex }}
            >
              {isWinner && (
                <div className="absolute -top-3 -left-3 bg-green-500 text-white rounded-full p-1 shadow-md">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}

              <div className={`absolute -top-4 -right-4 text-white text-[10px] sm:text-xs font-bold px-2 py-1 rounded-full shadow-md ${bgColor}`}>
                {prod.unit_price_dkk} kr/{prod.unit}
              </div>

              {selectedBox === idx && (
                <div 
                  className="absolute top-[105%] left-1/2 -translate-x-1/2 mt-2 w-56 bg-white/95 backdrop-blur-md text-black p-4 rounded-2xl shadow-2xl z-[100] text-sm animate-in fade-in slide-in-from-top-2 border border-slate-200"
                  onClick={(e) => e.stopPropagation()} // Prevent closing when interacting inside
                >
                  <h4 className="font-extrabold leading-tight text-slate-900">{prod.label}</h4>
                  <p className="text-xs text-slate-500 mb-3 font-medium">{prod.danish_term}</p>
                  
                  <div className="flex justify-between items-center bg-slate-100/80 p-2.5 rounded-xl mb-3 border border-slate-200/50">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Price</span>
                      <span className="font-bold text-slate-800">{prod.package_price_dkk || prod.unit_price_dkk} kr</span>
                    </div>
                    <div className="h-6 w-px bg-slate-300" />
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] uppercase font-bold text-blue-400">approx</span>
                      <span className="font-black text-blue-600">€{convertDKKtoEUR(prod.package_price_dkk || prod.unit_price_dkk)}</span>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {prod.is_organic && <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">Organic</span>}
                    {prod.is_lactose_free && <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-bold">Lactose-free</span>}
                    {prod.is_plant_based && <span className="bg-green-100 text-green-900 text-[10px] px-2 py-0.5 rounded-full font-bold">Vegan</span>}
                  </div>
                  
                  {(prod.protein_g_per_100g || prod.fat_percentage || prod.sugar_g_per_100g) && (
                    <div className="mt-3 text-[10px] border-t border-slate-200 pt-3 grid grid-cols-3 gap-1 text-center">
                      {prod.protein_g_per_100g !== null && (
                        <div className="flex flex-col">
                          <span className="text-slate-400 uppercase font-bold">Protein</span>
                          <span className="font-black text-slate-700">{prod.protein_g_per_100g}g</span>
                        </div>
                      )}
                      {prod.fat_percentage !== null && (
                        <div className="flex flex-col">
                          <span className="text-slate-400 uppercase font-bold">Fat</span>
                          <span className="font-black text-slate-700">{prod.fat_percentage}%</span>
                        </div>
                      )}
                      {prod.sugar_g_per_100g !== null && (
                        <div className="flex flex-col">
                          <span className="text-slate-400 uppercase font-bold">Sugar</span>
                          <span className="font-black text-slate-700">{prod.sugar_g_per_100g}g</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  <button 
                    onClick={() => handleAddToList(prod)}
                    className="mt-4 w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-xl active:scale-95 transition-transform flex items-center justify-center gap-2"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Add to List
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-white z-[100]">
            <Loader2 className="w-12 h-12 animate-spin mb-4 text-green-400" />
            <p className="font-medium animate-pulse">Analyzing shelves with Gemini...</p>
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
      </div>

      {/* Bottom Controls */}
      <div className="h-32 bg-slate-950 w-full rounded-t-[2.5rem] flex items-center justify-around px-6 absolute bottom-0 z-40 border-t border-slate-800">
        {!imageUri ? (
          <>
            <label className="flex flex-col items-center justify-center text-slate-400 cursor-pointer p-3 hover:text-white transition-colors">
              <Upload className="w-6 h-6 mb-1" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Upload</span>
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
          </>
        ) : (
          <button 
            onClick={reset}
            className="bg-white text-slate-900 px-8 py-3.5 rounded-full font-black shadow-xl active:scale-95 transition-transform w-full max-w-[200px]"
          >
            New Scan
          </button>
        )}
      </div>

      {/* Grocery List Drawer overlay */}
      <GroceryDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
}
