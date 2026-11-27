"use client";

import { useState, useEffect } from 'react';
import { HelpCircle, X, Camera, ShoppingCart, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import type { Language } from '../lib/translations';

interface TutorialSlide {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const getSlides = (lang: Language): TutorialSlide[] => {
  if (lang === 'it') {
    return [
      {
        icon: (
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800/60 flex items-center justify-center">
            <Camera className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
        ),
        title: "Inquadra e Scatta",
        description: 'Tocca "Scatta Foto" e inquadra da vicino (30–50 cm) un prodotto o un ripiano. Funziona con 1–4 articoli per volta.',
      },
      {
        icon: (
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800/60 flex items-center justify-center">
            <ShoppingCart className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
        ),
        title: "Risultati Istantanei",
        description: "In 2–3 secondi vedrai i nomi tradotti dal danese, prezzi in DKK/EUR, costo al kg/L, deposito Pant e allergeni.",
      },
      {
        icon: (
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800/60 flex items-center justify-center">
            <SettingsIcon className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
        ),
        title: "Budget e Preferenze",
        description: 'Aggiungi i prodotti al carrello per non sforare il budget e imposta filtri rapidi bio, vegani, senza lattosio o glutine.',
      },
    ];
  }

  if (lang === 'da') {
    return [
      {
        icon: (
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800/60 flex items-center justify-center">
            <Camera className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
        ),
        title: "Peg & Scan",
        description: 'Tryk "Tag Billede" og hold kameraet 30–50 cm fra skiltene. Virker bedst med 1–4 varer ad gangen.',
      },
      {
        icon: (
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800/60 flex items-center justify-center">
            <ShoppingCart className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
        ),
        title: "Resultater med det samme",
        description: "På 2–3 sekunder får du priser i DKK/EUR, reel kilopris, pant og hurtige kostmærker.",
      },
      {
        icon: (
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800/60 flex items-center justify-center">
            <SettingsIcon className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
        ),
        title: "Styr dit budget",
        description: 'Læg varer i kurven med live +/- knapper og brug hurtige kostfiltre til økologi, vegansk eller laktosefri.',
      },
    ];
  }

  return [
    {
      icon: (
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800/60 flex items-center justify-center">
          <Camera className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </div>
      ),
      title: "Point & Scan",
      description: 'Tap "Take Photo" and frame 1–4 items closely (30–50 cm) so price tags stay crisp and readable.',
    },
    {
      icon: (
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800/60 flex items-center justify-center">
          <ShoppingCart className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </div>
      ),
      title: "Instant Comparison",
      description: "In 2–3 seconds you get translated names, DKK/EUR prices, unit price per kg/L, Pant deposits, and dietary tags.",
    },
    {
      icon: (
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800/60 flex items-center justify-center">
          <SettingsIcon className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </div>
      ),
      title: "Track & Personalise",
      description: 'Use live +/- steppers right on scan cards, manage your checklist, and filter allergens automatically.',
    },
  ];
};

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTryDemo?: () => void;
  language?: Language;
}

export default function TutorialModal({ isOpen, onClose, onTryDemo, language = 'en' }: TutorialModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const slides = getSlides(language);

  useEffect(() => {
    if (!isOpen) setCurrentSlide(0);
  }, [isOpen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0 && currentSlide < slides.length - 1) setCurrentSlide(s => s + 1);
      if (diff < 0 && currentSlide > 0) setCurrentSlide(s => s - 1);
    }
    setTouchStartX(null);
  };

  const isLast = currentSlide === slides.length - 1;

  if (!isOpen) return null;

  const labels =
    language === 'it'
      ? { header: 'Come funziona', skip: 'Salta', next: 'Avanti →', gotIt: 'Ho capito', demo: '⚡ Prova Scaffale Demo' }
      : language === 'da'
      ? { header: 'Sådan virker det', skip: 'Spring over', next: 'Næste →', gotIt: 'Forstået', demo: '⚡ Prøv Demohylde' }
      : { header: 'How it works', skip: 'Skip', next: 'Next →', gotIt: 'Got it', demo: '⚡ Try Demo Shelf' };

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-250 text-zinc-900 dark:text-zinc-100 transition-colors">
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            {labels.header}
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 dark:hover:text-white transition-colors active:scale-95"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="px-6 pb-6 pt-4"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex flex-col items-center text-center min-h-[200px] justify-center gap-5">
            {slides[currentSlide].icon}
            <div>
              <h3 className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">
                {slides[currentSlide].title}
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xs">
                {slides[currentSlide].description}
              </p>
            </div>
          </div>

          <div className="flex justify-center gap-2 mt-6 mb-5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentSlide ? 'w-6 bg-emerald-500' : 'w-1.5 bg-zinc-300 dark:bg-zinc-700'
                }`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>

          <div className="flex gap-3">
            {!isLast && (
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-zinc-700 dark:text-zinc-400 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 active:scale-95 transition-all"
              >
                {labels.skip}
              </button>
            )}
            <button
              onClick={() => {
                if (isLast) onClose();
                else setCurrentSlide(s => s + 1);
              }}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all shadow-md"
            >
              {isLast ? labels.gotIt : labels.next}
            </button>
          </div>

          {onTryDemo && (
            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
              <button
                onClick={() => {
                  onClose();
                  onTryDemo();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 dark:bg-emerald-950/80 dark:hover:bg-emerald-900 dark:border-emerald-700/60 dark:text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{labels.demo}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700/80 transition-all active:scale-95 flex-shrink-0"
      aria-label="How it works"
    >
      <HelpCircle className="w-4 h-4" />
    </button>
  );
}
