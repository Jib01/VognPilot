"use client";

import { X, Moon, Sun, Monitor, Languages, ShieldCheck, Coins } from "lucide-react";
import React from "react";
import { getTranslation } from "../lib/translations";

export interface UserPreferences {
  theme: "dark" | "light" | "system";
  language: "en" | "it";
  dietary: {
    vegetarian: boolean;
    vegan: boolean;
    organic: boolean;
    lactoseFree: boolean;
    glutenFree: boolean;
  };
  currency: "DKK" | "EUR";
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  preferences: UserPreferences;
  onUpdatePreferences: (newPrefs: UserPreferences) => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  preferences,
  onUpdatePreferences,
}: Props) {
  if (!isOpen) return null;

  const t = getTranslation(preferences.language);

  const handleThemeChange = (theme: "dark" | "light" | "system") => {
    const updated: UserPreferences = { ...preferences, theme };
    onUpdatePreferences(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("vognpilot_theme", theme);
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      } else if (theme === "light") {
        document.documentElement.classList.remove("dark");
      } else {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.classList.toggle("dark", isDark);
      }
    }
  };

  const handleLanguageChange = (language: "en" | "it") => {
    const updated: UserPreferences = { ...preferences, language };
    onUpdatePreferences(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("vognpilot_language", language);
    }
  };

  const handleCurrencyChange = (currency: "DKK" | "EUR") => {
    const updated: UserPreferences = { ...preferences, currency };
    onUpdatePreferences(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("vognpilot_currency", currency);
    }
  };

  const toggleDietary = (key: keyof UserPreferences["dietary"]) => {
    const updated: UserPreferences = {
      ...preferences,
      dietary: {
        ...preferences.dietary,
        [key]: !preferences.dietary[key],
      },
    };
    onUpdatePreferences(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("vognpilot_dietary", JSON.stringify(updated.dietary));
    }
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 transition-colors"
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white/95 dark:bg-zinc-900/90">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {t.settings}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 active:scale-95 transition-all"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 hide-scrollbar">
          {/* Theme Option */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2.5 block">
              {t.appearance}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "dark", label: t.dark, icon: Moon },
                { id: "light", label: t.light, icon: Sun },
                { id: "system", label: t.system, icon: Monitor },
              ].map(({ id, label, icon: Icon }) => {
                const isSelected = preferences.theme === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleThemeChange(id as "dark" | "light" | "system")}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 shadow-xs"
                        : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <Icon className="w-5 h-5 mb-1.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Currency Option */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> {t.primaryCurrency}
              </span>
              <span className="text-[10px] text-zinc-400 font-normal">1 € ≈ 7.46 DKK</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "DKK", label: "DKK (kr)", sub: "Dansk krone" },
                { id: "EUR", label: "EUR (€)", sub: "Euro" },
              ].map(({ id, label, sub }) => {
                const isSelected = preferences.currency === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleCurrencyChange(id as "DKK" | "EUR")}
                    className={`flex flex-col items-start p-3 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 shadow-xs"
                        : "border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <span className="font-bold text-sm">{label}</span>
                    <span className="text-[10px] text-zinc-400">{sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language Option */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2.5 flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> {t.language}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "en", label: "English", sub: "Default" },
                { id: "it", label: "Italiano", sub: "Italian" },
              ].map(({ id, label, sub }) => {
                const isSelected = preferences.language === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleLanguageChange(id as "en" | "it")}
                    className={`flex flex-col items-start p-3 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 shadow-xs"
                        : "border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <span className="font-bold text-sm">{label}</span>
                    <span className="text-[10px] text-zinc-400">{sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dietary Constraints & Allergens */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> {t.dietaryConstraints}
            </label>
            <div className="space-y-2">
              {[
                { key: "vegetarian", label: t.vegetarian, danish: "Vegetarisk", icon: "🥗" },
                { key: "vegan", label: t.vegan, danish: "Vegansk / Plantebaseret", icon: "🌱" },
                { key: "organic", label: t.organic, danish: "Økologisk (Ø-mærke)", icon: "🌿" },
                { key: "lactoseFree", label: t.lactoseFree, danish: "Laktosefri", icon: "🥛" },
                { key: "glutenFree", label: t.glutenFree, danish: "Glutenfri", icon: "🌾" },
              ].map(({ key, label, danish, icon }) => {
                const checked = preferences.dietary[key as keyof UserPreferences["dietary"]];
                return (
                  <div
                    key={key}
                    onClick={() => toggleDietary(key as keyof UserPreferences["dietary"])}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{icon}</span>
                      <div>
                        <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100">{label}</p>
                        <p className="text-[11px] text-zinc-400">{danish}</p>
                      </div>
                    </div>
                    <div
                      className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
                        checked ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                          checked ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/90 flex justify-end">
          <button
            onClick={onClose}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition-all active:scale-95 text-sm shadow-md"
          >
            {t.done}
          </button>
        </div>
      </div>
    </div>
  );
}
