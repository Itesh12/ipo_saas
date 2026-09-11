"use client";

import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { Theme, ThemePreference, THEME_STORAGE_KEY, DEFAULT_THEME } from "@/config/themes";

interface ThemeContextType {
  theme: Theme;
  preference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getInitialPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
    if (stored && ["light", "dark", "midnight", "professional", "system"].includes(stored)) {
      return stored;
    }
  } catch {
    // Ignore storage read errors
  }
  return "system";
}

function subscribeToMediaChange(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getSystemThemeSnapshot(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getSystemThemeServerSnapshot(): Theme {
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(getInitialPreference);
  const systemTheme = useSyncExternalStore(
    subscribeToMediaChange,
    getSystemThemeSnapshot,
    getSystemThemeServerSnapshot
  );

  const activeTheme: Theme = preference === "system" ? systemTheme : preference;

  // Sync active theme to DOM data-theme attribute & storage
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", activeTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Ignore localStorage write errors
    }
  }, [activeTheme, preference]);

  const setThemePreference = (pref: ThemePreference) => {
    setPreference(pref);
  };

  return (
    <ThemeContext.Provider value={{ theme: activeTheme, preference, setThemePreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
