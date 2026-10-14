"use client";

import { useState, useEffect } from 'react';
import { HelpCircle, X, Camera, ShoppingCart, Settings as SettingsIcon } from 'lucide-react';

interface TutorialSlide {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const slides: TutorialSlide[] = [
  {
    icon: (
      <div className="w-16 h-16 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center">
        <Camera className="w-8 h-8 text-emerald-400" />
      </div>
    ),
    title: "Point & Scan",
    description: "Tap \"Scan Product\" and point your camera at any shelf or price tag. Works with 1 item or an entire shelf section.",
  },
  {
    icon: (
      <div className="w-16 h-16 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center">
        <ShoppingCart className="w-8 h-8 text-emerald-400" />
      </div>
    ),
    title: "Get Results Instantly",
    description: "In 2–3 seconds you'll see translated product names, DKK and EUR prices, Pant deposits, and dietary tags like Organic or Lactose-Free.",
  },
  {
    icon: (
      <div className="w-16 h-16 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center">
        <SettingsIcon className="w-8 h-8 text-emerald-400" />
      </div>
    ),
    title: "Track & Personalise",
    description: "Tap \"Add to Cart\" to track your spend against your budget. In Settings you can set dietary preferences so matching products are highlighted automatically.",
  },
];

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

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

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-250">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">How it works</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Slides */}
        <div
          className="px-6 pb-6 pt-4"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex flex-col items-center text-center min-h-[200px] justify-center gap-5">
            {slides[currentSlide].icon}
            <div>
              <h3 className="text-xl font-extrabold text-zinc-100 tracking-tight mb-2">
                {slides[currentSlide].title}
              </h3>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-xs">
                {slides[currentSlide].description}
              </p>
            </div>
          </div>

          {/* Dot indicators */}
          <div className="flex justify-center gap-2 mt-6 mb-5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentSlide ? 'w-6 bg-emerald-500' : 'w-1.5 bg-zinc-700'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            {!isLast && (
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-zinc-400 bg-zinc-800 border border-zinc-700 active:scale-95 transition-all"
              >
                Skip
              </button>
            )}
            <button
              onClick={() => {
                if (isLast) onClose();
                else setCurrentSlide(s => s + 1);
              }}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all shadow-md"
            >
              {isLast ? "Got it" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Small trigger button to embed in the header
export function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2 text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 hover:bg-zinc-800 rounded-xl border border-zinc-700/80 transition-all active:scale-95 flex-shrink-0"
      aria-label="How it works"
    >
      <HelpCircle className="w-4 h-4" />
    </button>
  );
}
