"use client";

import { X, Moon, Sun, Monitor, Languages, ShieldCheck, Coins } from "lucide-react";
import React from "react";

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
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden border border-slate-200 dark:border-slate-800"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/70 dark:bg-slate-900/70">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-200/60 dark:bg-slate-800 active:scale-95 transition-all"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 hide-scrollbar">
          {/* Theme Option */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 block">
              Appearance
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "dark", label: "Dark", icon: Moon },
                { id: "light", label: "Light", icon: Sun },
                { id: "system", label: "System", icon: Monitor },
              ].map(({ id, label, icon: Icon }) => {
                const isSelected = preferences.theme === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleThemeChange(id as "dark" | "light" | "system")}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shadow-sm"
                        : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
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
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5" /> Primary Currency
              </span>
              <span className="text-[10px] lowercase text-slate-400 font-normal">1 € ≈ 7.46 DKK</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "DKK", label: "DKK (kr)", sub: "Danish Krone" },
                { id: "EUR", label: "EUR (€)", sub: "Euro" },
              ].map(({ id, label, sub }) => {
                const isSelected = preferences.currency === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleCurrencyChange(id as "DKK" | "EUR")}
                    className={`flex flex-col items-start p-3 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shadow-sm"
                        : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <span className="font-bold text-sm">{label}</span>
                    <span className="text-[10px] text-slate-400">{sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language Option */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5" /> Language
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
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shadow-sm"
                        : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <span className="font-bold text-sm">{label}</span>
                    <span className="text-[10px] text-slate-400">{sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dietary Constraints & Allergens */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Dietary Constraints & Allergens
            </label>
            <div className="space-y-2">
              {[
                { key: "vegetarian", label: "Vegetarian", danish: "Vegetarisk", icon: "🥗" },
                { key: "vegan", label: "Vegan", danish: "Vegansk / Plantebaseret", icon: "🌱" },
                { key: "organic", label: "Organic", danish: "Økologisk (Ø-mærke)", icon: "🌿" },
                { key: "lactoseFree", label: "Lactose-Free", danish: "Laktosefri", icon: "🥛" },
                { key: "glutenFree", label: "Gluten-Free", danish: "Glutenfri", icon: "🌾" },
              ].map(({ key, label, danish, icon }) => {
                const checked = preferences.dietary[key as keyof UserPreferences["dietary"]];
                return (
                  <div
                    key={key}
                    onClick={() => toggleDietary(key as keyof UserPreferences["dietary"])}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{icon}</span>
                      <div>
                        <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{label}</p>
                        <p className="text-[11px] text-slate-400">{danish}</p>
                      </div>
                    </div>
                    <div
                      className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
                        checked ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
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
            <p className="text-[11px] text-slate-400 mt-2 italic">
              Active preferences are automatically checked by Gemini when scanning supermarket shelves.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex justify-end">
          <button
            onClick={onClose}
            className="w-full bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all active:scale-95 text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
