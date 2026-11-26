"use client";

import { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  AlertTriangle,
  CheckCircle2,
  ShoppingCart,
  Settings,
  Sparkles,
  Circle,
  Plus,
  Minus,
  Trash2,
  Target,
  Pencil,
  X,
  RefreshCw,
  HelpCircle,
  Clock,
  ListChecks,
  Check,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScanResult, ProductCard } from '../types/vision';
import { db, GroceryItem } from '../lib/db';
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

type ActiveTab = 'scan' | 'cart';
type ScanStep = 'idle' | 'scanning' | 'results';

interface RecentScanEntry {
  id: string;
  timestamp: number;
  imageUri: string;
  base64: string | null;
  result: ScanResult;
}

interface ErrorModalState {
  code: 'TIMEOUT_TOO_DENSE' | 'NO_PRODUCTS_FOUND' | 'QUOTA_EXCEEDED' | 'AUTH_ERROR' | 'NETWORK_ERROR' | 'SERVER_ERROR';
  title: string;
  message: string;
}

export default function CameraScanner() {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Navigation & scan state
  const [activeTab, setActiveTab] = useState<ActiveTab>('scan');
  const [scanStep, setScanStep] = useState<ScanStep>('idle');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [lastBase64, setLastBase64] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [targetItem, setTargetItem] = useState<string | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScanEntry[]>([]);

  // Scanning feedback
  const [loadingStep, setLoadingStep] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isSlowScan, setIsSlowScan] = useState(false);
  const [errorModal, setErrorModal] = useState<ErrorModalState | null>(null);

  // Cart quick-add & inline price editing
  const [quickInput, setQuickInput] = useState('');
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [tempItemPrice, setTempItemPrice] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isBudgetDialogOpen, setIsBudgetDialogOpen] = useState(false);
  const [tempBudget, setTempBudget] = useState('200');

  // Live cart data from Dexie
  const allDbItems = useLiveQuery(() => db.groceryList.orderBy('id').reverse().toArray()) || [];
  const inCartItems = allDbItems.filter(i => (i.status || 'in_cart') === 'in_cart');
  const todoItems = allDbItems.filter(i => i.status === 'todo');

  const productsTotalDKK = inCartItems.reduce((acc, item) => acc + ((item.price_dkk || 0) * (item.quantity || 1)), 0);
  const pantTotalDKK = inCartItems.reduce((acc, item) => acc + ((item.pant_fee_dkk || 0) * (item.quantity || 1)), 0);
  const totalDKK = productsTotalDKK + pantTotalDKK;
  const totalInCartCount = inCartItems.reduce((acc, item) => acc + (item.quantity || 1), 0);

  const [budgetTarget, setBudgetTarget] = useState<number>(200);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedBudget = localStorage.getItem('vognpilot_budget');
      if (savedBudget) {
        const val = parseFloat(savedBudget) || 200;
        setBudgetTarget(val);
        setTempBudget(val.toString());
      }
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
        console.warn('Failed to parse preferences:', err);
      }
    }
  }, []);

  const t = getTranslation(preferences.language);

  // Apply theme dynamically to <html>
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const applyTheme = () => {
        const theme = preferences.theme;
        const isDark =
          theme === 'dark'
            ? true
            : theme === 'light'
            ? false
            : window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', isDark);
      };
      applyTheme();
      if (preferences.theme === 'system') {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', applyTheme);
        return () => mediaQuery.removeEventListener('change', applyTheme);
      }
    }
  }, [preferences.theme]);

  useSyncEngine();

  // Scanning progress & live timer
  useEffect(() => {
    if (scanStep !== 'scanning') {
      setLoadingStep(0);
      setElapsedSec(0);
      setIsSlowScan(false);
      return;
    }
    setLoadingStep(0);
    setElapsedSec(0);
    setIsSlowScan(false);

    const t1 = setTimeout(() => setLoadingStep(1), 900);
    const t2 = setTimeout(() => setLoadingStep(2), 1800);
    const tSlow = setTimeout(() => setIsSlowScan(true), 5000);
    const timer = setInterval(() => setElapsedSec(s => +(s + 0.1).toFixed(1)), 100);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(tSlow);
      clearInterval(timer);
    };
  }, [scanStep]);

  const activeDietaryList: string[] = [];
  if (preferences.dietary.vegetarian) activeDietaryList.push('vegetarian');
  if (preferences.dietary.vegan) activeDietaryList.push('vegan');
  if (preferences.dietary.organic) activeDietaryList.push('organic');
  if (preferences.dietary.lactoseFree) activeDietaryList.push('lactose_free');
  if (preferences.dietary.glutenFree) activeDietaryList.push('gluten_free');

  // Compress image to max 896px with 0.72 JPEG quality for sharp price-tag OCR & fast upload
  const compressImage = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const max = 896;
        if (width > height && width > max) {
          height = (height * max) / width;
          width = max;
        } else if (height > max) {
          width = (width * max) / height;
          height = max;
        }
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
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = reject;
      img.src = url;
    });

  const executeScan = async (base64: string, previewUri?: string) => {
    setActiveTab('scan');
    setScanStep('scanning');
    setErrorModal(null);
    setScanResult(null);

    const cacheKey = `vogn_scan_v2_${preferences.language}_${activeDietaryList.join('-')}_${targetItem || ''}_${base64.length}_${base64.slice(0, 24)}_${base64.slice(-24)}`;
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed: ScanResult = JSON.parse(cached);
          setScanResult(parsed);
          setScanStep('results');
          return;
        } catch {
          // ignore cache error
        }
      }
    }

    try {
      const res = await fetch('/api/v1/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          mimeType: 'image/jpeg',
          language: preferences.language,
          targetItem: targetItem || undefined,
          preferences: {
            dietary_lifestyle: activeDietaryList,
            currency: { primary: preferences.currency, fixed_rate: 7.46 },
          },
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => null);
        const code = errorJson?.error_code || (
          res.status === 429 ? 'QUOTA_EXCEEDED' :
          res.status === 408 ? 'TIMEOUT_TOO_DENSE' :
          res.status === 422 ? 'NO_PRODUCTS_FOUND' :
          res.status === 401 ? 'AUTH_ERROR' : 'SERVER_ERROR'
        );
        handleStructuredError(code, errorJson?.message);
        setScanStep('idle');
        return;
      }

      const data: ScanResult = await res.json();

      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
        } catch {
          // ignore storage quota
        }
      }

      const finalUri = previewUri || imageUri || '/icon-512.svg';
      setScanResult(data);
      setScanStep('results');
      setRecentScans(prev => [
        {
          id: `${Date.now()}`,
          timestamp: Date.now(),
          imageUri: finalUri,
          base64,
          result: data,
        },
        ...prev.slice(0, 4),
      ]);
    } catch (err: unknown) {
      console.error('[Scanner]', err);
      const errObj = err as { name?: string; message?: string };
      const isAbort = errObj?.name === 'TimeoutError' || errObj?.name === 'AbortError';
      if (isAbort) {
        handleStructuredError('TIMEOUT_TOO_DENSE');
      } else {
        handleStructuredError('NETWORK_ERROR', errObj?.message);
      }
      setScanStep('idle');
    }
  };

  const handleStructuredError = (code: string, serverMsg?: string) => {
    switch (code) {
      case 'TIMEOUT_TOO_DENSE':
        setErrorModal({ code: 'TIMEOUT_TOO_DENSE', title: t.errorTimeoutTitle, message: t.errorTimeoutMsg });
        break;
      case 'NO_PRODUCTS_FOUND':
        setErrorModal({ code: 'NO_PRODUCTS_FOUND', title: t.errorNoProductsTitle, message: t.errorNoProductsMsg });
        break;
      case 'QUOTA_EXCEEDED':
        setErrorModal({ code: 'QUOTA_EXCEEDED', title: t.errorQuotaTitle, message: t.errorQuotaMsg });
        break;
      case 'AUTH_ERROR':
        setErrorModal({ code: 'AUTH_ERROR', title: t.errorAuthTitle, message: serverMsg || t.errorAuthMsg });
        break;
      default:
        setErrorModal({ code: 'NETWORK_ERROR', title: t.errorNetworkTitle, message: serverMsg || t.errorNetworkMsg });
    }
  };

  const scanImage = async (file: Blob, previewUrl: string) => {
    try {
      const base64DataUrl = await compressImage(file);
      const base64 = base64DataUrl.split(',')[1] || base64DataUrl;
      setLastBase64(base64);
      executeScan(base64, previewUrl);
    } catch (err) {
      console.error('[Scanner] Image prep failed:', err);
      handleStructuredError('NETWORK_ERROR', preferences.language === 'it' ? 'Impossibile leggere il file immagine.' : 'Could not read image file.');
    }
  };

  const handleInstantDemoScan = () => {
    setActiveTab('scan');
    setScanStep('scanning');
    setErrorModal(null);
    setImageUri('/icon-512.svg');

    setTimeout(() => {
      const isIt = preferences.language === 'it';
      const demoResult: ScanResult = {
        is_demo_fallback: true,
        notice: t.demoShelfNotice,
        copilot_tip: isIt
          ? "Arla Bio (14.50 kr/L) rispetta i filtri bio ed è il più conveniente rispetto alle alternative."
          : "Arla Organic (14.50 kr/L) matches organic preferences and offers the best daily value.",
        decision_reason: isIt
          ? "Arla Bio (14.50 kr/L) offre il miglior equilibrio tra prezzo/litro e qualità biologica."
          : "Arla Organic (14.50 kr/L) offers the best price-per-liter and organic certification.",
        is_blurry_or_obscured: false,
        recommended_product_index: 0,
        latency_ms: 250,
        detected_products: [
          {
            label: isIt ? "Arla Latte Parzialmente Scremato Bio 1L" : "Arla Organic Semi-Skimmed Milk 1L",
            danish_term: "Arla Økologisk Letmælk 1L",
            package_price_dkk: 14.50,
            unit_price_dkk: 14.50,
            unit_measure: "L",
            pant_fee_dkk: null,
            multipack_offer: null,
            fat_percentage: 1.5,
            sugar_g_per_100g: 4.7,
            protein_g_per_100g: 3.5,
            is_organic: true,
            is_lactose_free: false,
            is_plant_based: false,
            is_gluten_free: true,
            matches_constraints: !preferences.dietary.lactoseFree && !preferences.dietary.vegan,
            dietary_warning: preferences.dietary.lactoseFree
              ? (isIt ? "Contiene lattosio" : "Contains lactose")
              : preferences.dietary.vegan
              ? (isIt ? "Non vegano" : "Not vegan")
              : null,
            summary: isIt ? "Latte fresco biologico danese ricco di calcio" : "Danish fresh organic semi-skimmed milk",
          },
          {
            label: isIt ? "Faxe Kondi Soda Limone/Lime 33cl" : "Faxe Kondi Lemon/Lime Soda 330ml",
            danish_term: "Faxe Kondi 33cl",
            package_price_dkk: 8.50,
            unit_price_dkk: 25.75,
            unit_measure: "L",
            pant_fee_dkk: 1.0,
            multipack_offer: "Ta' 3 for 20 kr",
            fat_percentage: 0,
            sugar_g_per_100g: 8.9,
            protein_g_per_100g: 0,
            is_organic: false,
            is_lactose_free: true,
            is_plant_based: true,
            is_gluten_free: true,
            matches_constraints: !preferences.dietary.organic,
            dietary_warning: null,
            summary: isIt ? "Classica bevanda danese agli agrumi con Pant A (+1 kr)" : "Classic Danish lemon soda with returnable Pant A (+1 kr)",
          },
          {
            label: isIt ? "Pågen Girelle alla Cannella 260g" : "Pågen Cinnamon Swirls 260g",
            danish_term: "Pågen Gifflar Kanel 260g",
            package_price_dkk: 22.00,
            unit_price_dkk: 84.60,
            unit_measure: "kg",
            pant_fee_dkk: null,
            multipack_offer: null,
            fat_percentage: 12.0,
            sugar_g_per_100g: 22.0,
            protein_g_per_100g: 6.5,
            is_organic: false,
            is_lactose_free: false,
            is_plant_based: false,
            is_gluten_free: false,
            matches_constraints: !preferences.dietary.glutenFree && !preferences.dietary.vegan,
            dietary_warning: preferences.dietary.glutenFree
              ? (isIt ? "Contiene glutine" : "Contains gluten")
              : null,
            summary: isIt ? "Dolcetti nordici alla cannella ideali per la colazione" : "Iconic Nordic cinnamon mini pastry rolls",
          },
          {
            label: isIt ? "Lurpak Burro Salato Spalmabile 200g" : "Lurpak Salted Spreadable Butter 200g",
            danish_term: "Lurpak Smørbar 200g",
            package_price_dkk: 26.95,
            unit_price_dkk: 134.75,
            unit_measure: "kg",
            pant_fee_dkk: null,
            multipack_offer: null,
            fat_percentage: 80.0,
            sugar_g_per_100g: 0.7,
            protein_g_per_100g: 0.6,
            is_organic: false,
            is_lactose_free: false,
            is_plant_based: false,
            is_gluten_free: true,
            matches_constraints: !preferences.dietary.lactoseFree && !preferences.dietary.vegan,
            dietary_warning: preferences.dietary.lactoseFree
              ? (isIt ? "Contiene lattosio" : "Contains lactose")
              : null,
            summary: isIt ? "Autentico burro salato spalmabile danese da panna fresca" : "Authentic Danish churned salted spreadable butter",
          },
        ],
      };
      setScanResult(demoResult);
      setScanStep('results');
    }, 250);
  };

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      const previewUrl = URL.createObjectURL(file);
      setImageUri(previewUrl);
      scanImage(file, previewUrl);
    }
    e.target.value = '';
  };

  const resetToScanHome = () => {
    setActiveTab('scan');
    setScanStep('idle');
    setScanResult(null);
    setImageUri(null);
    setErrorModal(null);
    setTargetItem(null);
  };

  const convertDKKtoEUR = (dkk: number) => (dkk / 7.46).toFixed(2);

  const makeUuid = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

  const handleAddToList = async (prod: ProductCard) => {
    const priceDkk = prod.package_price_dkk || prod.unit_price_dkk || 0;
    const priceEur = parseFloat(convertDKKtoEUR(priceDkk));
    const pantFee = prod.pant_fee_dkk || 0;
    const allItems = await db.groceryList.toArray();
    const existing = allItems.find(i => (i.status || 'in_cart') === 'in_cart' && i.name === prod.label);

    if (existing?.id) {
      await db.groceryList.update(existing.id, { quantity: (existing.quantity || 1) + 1, sync_status: 'pending' });
    } else {
      await db.groceryList.add({
        uuid: makeUuid(),
        name: prod.label,
        danish_term: prod.danish_term,
        price_dkk: priceDkk,
        price_eur: priceEur,
        pant_fee_dkk: pantFee,
        quantity: 1,
        is_checked: false,
        status: 'in_cart',
        sync_status: 'pending',
        created_at: Date.now(),
      });
    }

    // If user was scanning specifically for a checklist item, remove it from 'todo'
    if (targetItem) {
      const todoMatch = allItems.find(
        i => i.status === 'todo' && i.name.toLowerCase() === targetItem.toLowerCase()
      );
      if (todoMatch?.id) {
        await db.groceryList.delete(todoMatch.id);
      }
      setTargetItem(null);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = quickInput.trim();
    if (!raw) return;

    // Parse optional trailing price e.g. "Pane 18" or "Milk 14.50 kr"
    const priceMatch = raw.match(/^(.*?)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:kr|dkk|€)?$/i);
    if (priceMatch && priceMatch[1].trim().length > 0) {
      const name = priceMatch[1].trim();
      const priceDkk = parseFloat(priceMatch[2].replace(',', '.')) || 0;
      await db.groceryList.add({
        uuid: makeUuid(),
        name,
        danish_term: '',
        price_dkk: priceDkk,
        price_eur: parseFloat(convertDKKtoEUR(priceDkk)),
        pant_fee_dkk: 0,
        quantity: 1,
        is_checked: false,
        status: 'in_cart',
        sync_status: 'pending',
        created_at: Date.now(),
      });
    } else {
      // No price -> add to "To Buy (Checklist)"
      await db.groceryList.add({
        uuid: makeUuid(),
        name: raw,
        danish_term: '',
        price_dkk: 0,
        price_eur: 0,
        pant_fee_dkk: 0,
        quantity: 1,
        is_checked: false,
        status: 'todo',
        sync_status: 'pending',
        created_at: Date.now(),
      });
    }
    setQuickInput('');
  };

  const moveTodoToCart = async (item: GroceryItem) => {
    if (!item.id) return;
    await db.groceryList.update(item.id, { status: 'in_cart', is_checked: false, sync_status: 'pending' });
  };

  const launchScanForTodo = (itemName: string) => {
    setTargetItem(itemName);
    setActiveTab('scan');
    setScanStep('idle');
    cameraInputRef.current?.click();
  };

  const updateQty = async (id: number, current: number, delta: number) => {
    await db.groceryList.update(id, { quantity: Math.max(1, current + delta), sync_status: 'pending' });
  };

  const removeItem = async (id: number) => {
    await db.groceryList.delete(id);
  };

  const toggleItem = async (id: number, checked: boolean) => {
    await db.groceryList.update(id, { is_checked: !checked, sync_status: 'pending' });
  };

  const startPriceEdit = (item: GroceryItem) => {
    if (!item.id) return;
    setEditingPriceId(item.id);
    setTempItemPrice(item.price_dkk > 0 ? item.price_dkk.toString() : '');
  };

  const savePriceEdit = async (id: number) => {
    const num = Math.max(0, parseFloat(tempItemPrice.replace(',', '.')) || 0);
    await db.groceryList.update(id, {
      price_dkk: num,
      price_eur: parseFloat(convertDKKtoEUR(num)),
      sync_status: 'pending',
    });
    setEditingPriceId(null);
  };

  const handleClearCart = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    for (const item of inCartItems) {
      if (item.id != null) await db.groceryList.delete(item.id);
    }
    setConfirmClear(false);
  };

  const saveBudget = () => {
    const num = Math.max(10, parseFloat(tempBudget) || 200);
    setBudgetTarget(num);
    localStorage.setItem('vognpilot_budget', num.toString());
    setIsBudgetDialogOpen(false);
  };

  const budgetPercent = Math.min((totalDKK / budgetTarget) * 100, 100);
  const isOverBudget = totalDKK > budgetTarget;
  const activeDietaryCount = activeDietaryList.length;

  const formatCartPrice = (dkk: number) =>
    preferences.currency === 'EUR' ? `€${(dkk / 7.46).toFixed(2)}` : `${dkk.toFixed(2)} kr`;

  return (
    <div className="relative w-full max-w-md mx-auto h-[100dvh] bg-zinc-50 text-zinc-900 dark:bg-[#0b0b0e] dark:text-zinc-100 overflow-hidden flex flex-col font-sans select-none transition-colors">

      {/* Hidden file inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} />
      <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleCapture} />

      {/* ─── HEADER ─── */}
      <header className="h-14 w-full px-4 z-50 flex justify-between items-center bg-white/95 dark:bg-[#0b0b0e]/95 backdrop-blur-md border-b border-zinc-200 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-2 cursor-pointer whitespace-nowrap flex-shrink-0" onClick={resetToScanHome}>
          <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shadow-xs">
            <span className="text-white font-black text-base">V</span>
          </div>
          <h1 className="font-extrabold text-lg tracking-tight text-zinc-900 dark:text-zinc-100">VognPilot</h1>
        </div>

        <div className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
          <HelpButton onClick={() => setIsTutorialOpen(true)} />

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700/80 transition-all active:scale-95 relative flex-shrink-0"
            aria-label={t.settings}
          >
            <Settings className="w-4 h-4" />
            {activeDietaryCount > 0 ? (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white dark:ring-zinc-900" />
            ) : null}
          </button>

          {/* Header Cart Button -> always switches to Cart Tab */}
          <button
            onClick={() => setActiveTab('cart')}
            className={`px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-extrabold flex-shrink-0 active:scale-95 transition-all cursor-pointer border shadow-xs ${
              activeTab === 'cart'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
            }`}
            aria-label={t.shoppingList}
          >
            <ShoppingCart className={`w-3.5 h-3.5 ${activeTab === 'cart' ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
            <span>
              {preferences.currency === 'EUR'
                ? `€${(totalDKK / 7.46).toFixed(1)}`
                : `${totalDKK.toFixed(0)} kr`}
            </span>
          </button>
        </div>
      </header>

      {/* ─── COMPACT LIVE BUDGET STRIP (Hidden only while scanning/viewing results) ─── */}
      {!(activeTab === 'scan' && scanStep !== 'idle') ? (
        <div className="px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/60 shrink-0">
          <div className="flex justify-between items-center mb-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              <Target className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              {t.budget}
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-extrabold ${isOverBudget ? 'text-rose-500 dark:text-rose-400' : 'text-zinc-900 dark:text-zinc-100'}`}>
                {preferences.currency === 'EUR'
                  ? `€${(totalDKK / 7.46).toFixed(1)} / €${(budgetTarget / 7.46).toFixed(0)}`
                  : `${totalDKK.toFixed(0)} / ${budgetTarget} kr`}
              </span>
              <button
                onClick={() => { setTempBudget(budgetTarget.toString()); setIsBudgetDialogOpen(true); }}
                className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-900/60 px-2 py-0.5 rounded-full flex items-center gap-1 active:scale-95"
              >
                <Pencil className="w-2.5 h-2.5" /> {t.editBudget}
              </button>
            </div>
          </div>
          <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${isOverBudget ? 'bg-rose-500' : budgetPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${budgetPercent}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: SCANNER & RESULTS                                          */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'scan' && (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* IDLE HOME OF SCANNER */}
          {scanStep === 'idle' && (
            <div className="flex-1 overflow-y-auto hide-scrollbar px-4 py-4 space-y-4 pb-24">

              {/* Active checklist target indicator */}
              {targetItem ? (
                <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs">
                  <span className="font-bold text-emerald-800 dark:text-emerald-300">
                    🎯 {t.lookingForLabel} <span className="underline">{targetItem}</span>
                  </span>
                  <button
                    onClick={() => setTargetItem(null)}
                    className="text-emerald-700 dark:text-emerald-400 font-bold hover:underline"
                  >
                    {t.clearTarget}
                  </button>
                </div>
              ) : null}

              {/* Hero Scan Card */}
              <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xs space-y-4">
                <div>
                  <h2 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                    {t.scanHeroTitle}
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                    {t.scanHeroSub}
                  </p>
                </div>

                <div className="flex gap-2.5">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm shadow-md shadow-emerald-950/20 transition-all active:scale-[0.98]"
                  >
                    <Camera className="w-5 h-5" />
                    {t.takePhoto}
                  </button>
                  <button
                    onClick={() => galleryInputRef.current?.click()}
                    className="px-4 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-2xl flex items-center justify-center gap-1.5 font-bold text-xs transition-all active:scale-[0.98]"
                    aria-label={t.gallery}
                  >
                    <Upload className="w-4 h-4" />
                    <span>{t.gallery}</span>
                  </button>
                </div>

                {/* Active dietary profile badges */}
                {activeDietaryCount > 0 ? (
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900/50 text-xs text-emerald-800 dark:text-emerald-300 font-semibold active:scale-[0.99] transition-all"
                  >
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {activeDietaryCount} {activeDietaryCount > 1 ? t.activeFiltersPlural : t.activeFilters}
                    </span>
                    <span className="text-[10px] underline opacity-80">{t.editBudget}</span>
                  </button>
                ) : null}
              </div>

              {/* Quick Checklist Targets (from To Buy list) */}
              {todoItems.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 dark:text-zinc-400 px-1">
                    <ListChecks className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{t.checklistBannerTitle}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {todoItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => launchScanForTodo(item.name)}
                        className="px-3 py-1.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500 dark:hover:border-emerald-500 text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
                      >
                        <Camera className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>{item.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Recent Scans Strip */}
              {recentScans.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 dark:text-zinc-400 px-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{t.recentScansTitle}</span>
                  </div>
                  <div className="space-y-2">
                    {recentScans.map(entry => (
                      <button
                        key={entry.id}
                        onClick={() => {
                          setImageUri(entry.imageUri);
                          setLastBase64(entry.base64);
                          setScanResult(entry.result);
                          setScanStep('results');
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/60 transition-all active:scale-[0.99] text-left shadow-xs"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={entry.imageUri}
                          alt="Recent scan"
                          className="w-11 h-11 rounded-xl object-cover border border-zinc-200 dark:border-zinc-800 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-extrabold text-zinc-900 dark:text-zinc-100 truncate">
                            {entry.result.detected_products.map(p => p.label).join(' · ')}
                          </p>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                            {t.productsFound(entry.result.detected_products.length)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="pt-2 flex justify-center">
                  <button
                    onClick={() => setIsTutorialOpen(true)}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{t.howItWorks}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SCANNING PROGRESS */}
          {scanStep === 'scanning' && imageUri && (
            <div className="flex-1 flex flex-col overflow-hidden bg-black">
              <div className="relative flex-1 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUri} alt="Scanning" className="w-full h-full object-cover opacity-60" />
                <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-scan-laser opacity-90 pointer-events-none" />
              </div>

              <div className="bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 p-4 pb-6 shrink-0 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 text-base">{t.analyzingShelf}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {elapsedSec.toFixed(1)}s
                  </span>
                </div>

                {isSlowScan ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 p-2 rounded-xl mb-3 flex items-center gap-1.5">
                    <span>⏱️</span> {t.analyzingDenseShelf}
                  </p>
                ) : null}

                <div className="space-y-2.5">
                  {[
                    { label: t.photoProcessed, done: true },
                    { label: t.locatingProducts, done: loadingStep >= 1, active: loadingStep === 0 },
                    { label: t.translatingLabels, done: loadingStep >= 2, active: loadingStep === 1 },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      {step.done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : step.active ? (
                        <div className="w-4 h-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-zinc-400 dark:text-zinc-700 shrink-0" />
                      )}
                      <span className={step.done ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : step.active ? 'text-zinc-800 dark:text-zinc-300 font-medium' : 'text-zinc-400 dark:text-zinc-500'}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SCAN RESULTS */}
          {scanStep === 'results' && scanResult && imageUri && (
            <div className="flex-1 overflow-hidden">
              <ScanResultSheet
                scan={scanResult}
                imageUri={imageUri}
                imageBase64={lastBase64}
                cartItems={allDbItems}
                onAddToList={handleAddToList}
                onUpdateCartQty={updateQty}
                onRemoveCartItem={removeItem}
                onNewScan={resetToScanHome}
                onViewCart={() => setActiveTab('cart')}
                convertDKKtoEUR={convertDKKtoEUR}
                language={preferences.language}
                primaryCurrency={preferences.currency}
                dietaryFilters={activeDietaryList}
              />
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: SMART CART & SHOPPING LIST                                 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'cart' && (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Quick-Add Bar */}
          <form onSubmit={handleQuickAdd} className="px-3 pt-3 pb-2 shrink-0 flex gap-2">
            <input
              type="text"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder={t.quickAddPlaceholder}
              className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 shadow-xs"
            />
            <button
              type="submit"
              disabled={!quickInput.trim()}
              className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1 active:scale-95 transition-all shrink-0 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>{t.quickAddButton}</span>
            </button>
          </form>

          <div className="flex-1 overflow-y-auto hide-scrollbar px-3 py-2 space-y-4 pb-24">

            {/* SECTION 1: IN TROLLEY */}
            {inCartItems.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    {t.sectionInCart} ({totalInCartCount})
                  </span>
                  <button
                    onClick={handleClearCart}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-lg transition-colors ${
                      confirmClear
                        ? 'bg-rose-600 text-white'
                        : 'text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400'
                    }`}
                  >
                    {confirmClear ? t.confirmClearCart : t.clearCart}
                  </button>
                </div>

                {inCartItems.map(item => {
                  const qty = item.quantity || 1;
                  const rowTotal = ((item.price_dkk || 0) + (item.pant_fee_dkk || 0)) * qty;
                  const pantFee = Number(item.pant_fee_dkk || 0);
                  const isEditingPrice = editingPriceId === item.id;

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center p-3 rounded-2xl border transition-all ${
                        item.is_checked
                          ? 'bg-zinc-100/60 border-zinc-200/50 opacity-60 dark:bg-zinc-950/30 dark:border-zinc-800/40'
                          : 'bg-white border-zinc-200 shadow-xs dark:bg-zinc-900 dark:border-zinc-800'
                      }`}
                    >
                      <button onClick={() => toggleItem(item.id!, item.is_checked)} className="mr-3 active:scale-90 transition-transform flex-shrink-0">
                        {item.is_checked ? (
                          <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-500" />
                        ) : (
                          <Circle className="w-6 h-6 text-zinc-400 dark:text-zinc-600" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0 pr-2">
                        <p className={`font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate ${item.is_checked ? 'line-through text-zinc-400 dark:text-zinc-500' : ''}`}>
                          {item.name}
                        </p>
                        {Boolean(item.danish_term) ? (
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{item.danish_term}</p>
                        ) : null}

                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {/* Qty controls */}
                          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
                            <button onClick={() => updateQty(item.id!, qty, -1)} className="px-2 py-0.5 active:bg-zinc-200 dark:active:bg-zinc-700 rounded-l-lg text-zinc-600 dark:text-zinc-300">
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-black text-zinc-800 dark:text-zinc-200 w-5 text-center">{qty}</span>
                            <button onClick={() => updateQty(item.id!, qty, 1)} className="px-2 py-0.5 active:bg-zinc-200 dark:active:bg-zinc-700 rounded-r-lg text-zinc-600 dark:text-zinc-300">
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Tappable Price (Inline Edit) */}
                          {isEditingPrice ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                savePriceEdit(item.id!);
                              }}
                              className="flex items-center gap-1"
                            >
                              <input
                                type="number"
                                step="0.01"
                                inputMode="decimal"
                                autoFocus
                                value={tempItemPrice}
                                onChange={(e) => setTempItemPrice(e.target.value)}
                                className="w-16 px-2 py-0.5 text-xs font-bold bg-zinc-50 dark:bg-zinc-950 border border-emerald-500 rounded-lg focus:outline-none"
                                placeholder="kr"
                              />
                              <button
                                type="submit"
                                className="p-1 bg-emerald-600 text-white rounded-lg active:scale-95"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            </form>
                          ) : (
                            <button
                              onClick={() => startPriceEdit(item)}
                              title={t.editPrice}
                              className="text-xs font-black text-zinc-800 dark:text-zinc-200 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60"
                            >
                              <span>{item.price_dkk > 0 ? formatCartPrice(rowTotal) : t.noPriceYet}</span>
                              <Pencil className="w-2.5 h-2.5 opacity-60" />
                            </button>
                          )}

                          {pantFee > 0 ? (
                            <span className="text-[10px] text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded font-semibold">+{pantFee} {t.returnable}</span>
                          ) : null}
                        </div>
                      </div>

                      <button onClick={() => removeItem(item.id!)} className="p-1.5 text-zinc-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 active:scale-90 transition-colors flex-shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}

                {/* Subtotal footer */}
                <div className="pt-2.5 pb-1 px-1 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{typeof t.itemCount === 'function' ? t.itemCount(inCartItems.length) : `${inCartItems.length} items`}</span>
                  <div className="text-right">
                    {pantTotalDKK > 0 ? <span className="block text-emerald-600 dark:text-emerald-400 font-semibold">+{pantTotalDKK.toFixed(2)} kr Pant</span> : null}
                    <span className="font-extrabold text-zinc-900 dark:text-zinc-100 text-sm">
                      {preferences.currency === 'EUR' ? `≈ €${(totalDKK / 7.46).toFixed(2)}` : `${totalDKK.toFixed(2)} kr`}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* SECTION 2: TO BUY CHECKLIST */}
            {todoItems.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 px-1 text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <ListChecks className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{t.sectionTodo} ({todoItems.length})</span>
                </div>
                {todoItems.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs"
                  >
                    <button
                      onClick={() => moveTodoToCart(item)}
                      className="text-zinc-400 hover:text-emerald-600 dark:text-zinc-500 dark:hover:text-emerald-400 active:scale-90 transition-all shrink-0"
                      title={t.addToCart}
                    >
                      <Circle className="w-5 h-5" />
                    </button>
                    <span className="flex-1 text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate">
                      {item.name}
                    </span>
                    <button
                      onClick={() => launchScanForTodo(item.name)}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/70 dark:hover:bg-emerald-900/70 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all shrink-0"
                    >
                      <Camera className="w-3 h-3" />
                      <span>{t.scanThisItem}</span>
                    </button>
                    <button onClick={() => removeItem(item.id!)} className="p-1 text-zinc-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400 active:scale-90 transition-colors shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {/* EMPTY CART STATE */}
            {inCartItems.length === 0 && todoItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-14 space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-400 dark:text-zinc-600">
                  <ShoppingCart className="w-8 h-8" />
                </div>
                <p className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm">{t.emptyList}</p>
                <p className="text-xs px-6 text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-xs">{t.emptyListSub}</p>
                <button
                  onClick={() => setActiveTab('scan')}
                  className="mt-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{t.tabScan}</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ─── PERSISTENT BOTTOM 2-TAB NAVIGATION BAR ─── */}
      {!(activeTab === 'scan' && scanStep !== 'idle') ? (
        <nav className="h-16 px-4 pb-safe bg-white/95 dark:bg-[#0b0b0e]/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 grid grid-cols-2 gap-2 items-center shrink-0 z-40">
          <button
            onClick={() => setActiveTab('scan')}
            className={`h-11 rounded-2xl flex items-center justify-center gap-2 text-xs font-extrabold transition-all active:scale-95 ${
              activeTab === 'scan'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>{t.tabScan}</span>
          </button>

          <button
            onClick={() => setActiveTab('cart')}
            className={`h-11 rounded-2xl flex items-center justify-center gap-2 text-xs font-extrabold transition-all active:scale-95 ${
              activeTab === 'cart'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>
              {t.tabCart}
              {totalInCartCount > 0 ? ` (${totalInCartCount})` : ''}
            </span>
          </button>
        </nav>
      ) : null}

      {/* ─── SMART ERROR MODAL ─── */}
      {errorModal ? (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[120] px-6 animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center text-zinc-900 dark:text-zinc-100 transition-colors">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center mb-4">
              <AlertTriangle className="w-7 h-7 text-rose-500 dark:text-rose-400" />
            </div>
            <h3 className="font-extrabold text-lg mb-2">{errorModal.title}</h3>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed px-1">
              {errorModal.message}
            </p>
            <div className="w-full flex flex-col gap-2.5">
              {errorModal.code === 'TIMEOUT_TOO_DENSE' && (
                <button
                  onClick={() => { setErrorModal(null); cameraInputRef.current?.click(); }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-sm shadow-md"
                >
                  <Camera className="w-4 h-4" /> {t.frameCloser}
                </button>
              )}

              {errorModal.code === 'NO_PRODUCTS_FOUND' && (
                <button
                  onClick={() => { setErrorModal(null); cameraInputRef.current?.click(); }}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-sm shadow-md"
                >
                  <Camera className="w-4 h-4" /> {t.retakePhoto}
                </button>
              )}

              {errorModal.code === 'QUOTA_EXCEEDED' && (
                <>
                  <button
                    onClick={() => {
                      setErrorModal(null);
                      if (lastBase64) executeScan(lastBase64);
                      else cameraInputRef.current?.click();
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-sm shadow-md"
                  >
                    <RefreshCw className="w-4 h-4" /> {t.retry}
                  </button>
                  <button
                    onClick={() => {
                      setErrorModal(null);
                      handleInstantDemoScan();
                    }}
                    className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:hover:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-700/60 font-bold py-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {t.loadDemoShelf}
                  </button>
                </>
              )}

              {(errorModal.code === 'NETWORK_ERROR' || errorModal.code === 'SERVER_ERROR') && (
                <>
                  {lastBase64 ? (
                    <button
                      onClick={() => {
                        setErrorModal(null);
                        executeScan(lastBase64);
                      }}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-sm shadow-md"
                    >
                      <RefreshCw className="w-4 h-4" /> {t.retrySend}
                    </button>
                  ) : null}
                  <button
                    onClick={() => { setErrorModal(null); cameraInputRef.current?.click(); }}
                    className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-200 font-bold py-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all text-xs border border-zinc-200 dark:border-zinc-700"
                  >
                    <Camera className="w-4 h-4" /> {t.retakePhoto}
                  </button>
                </>
              )}

              {errorModal.code !== 'QUOTA_EXCEEDED' && (
                <button
                  onClick={() => setErrorModal(null)}
                  className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 font-semibold py-2.5 rounded-xl active:scale-95 transition-all text-xs border border-zinc-200 dark:border-zinc-700"
                >
                  {t.dismiss}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Budget Dialog */}
      {isBudgetDialogOpen && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 shadow-2xl text-zinc-900 dark:text-zinc-100 space-y-4 animate-in zoom-in-95 duration-150 transition-colors">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base">{t.setBudget}</h3>
              <button onClick={() => setIsBudgetDialogOpen(false)} className="p-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 dark:hover:text-white active:scale-95">
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
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  {p} kr
                </button>
              ))}
            </div>
            <div className="flex items-center bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2.5 focus-within:border-emerald-500 transition-colors">
              <input
                type="number" inputMode="numeric" value={tempBudget}
                onChange={e => setTempBudget(e.target.value)}
                className="w-full bg-transparent text-zinc-900 dark:text-zinc-100 font-extrabold text-base focus:outline-none"
                placeholder="200"
              />
              <span className="text-xs font-bold text-zinc-400 ml-2">kr</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setIsBudgetDialogOpen(false)} className="flex-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold py-2.5 rounded-xl text-xs border border-zinc-200 dark:border-zinc-700 active:scale-95">{t.cancel}</button>
              <button onClick={saveBudget} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-xs active:scale-95">{t.save}</button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} preferences={preferences} onUpdatePreferences={setPreferences} />

      {/* Tutorial Modal */}
      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
        onTryDemo={handleInstantDemoScan}
        language={preferences.language}
      />
    </div>
  );
}
