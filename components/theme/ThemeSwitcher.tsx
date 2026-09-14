"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "./ThemeProvider";
import { THEME_LIST, ThemePreference } from "@/config/themes";
import { Sun, Moon, Sparkles, Briefcase, Monitor, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const THEME_ICONS: Record<string, React.ElementType> = {
  light: Sun,
  dark: Moon,
  midnight: Sparkles,
  professional: Briefcase,
  system: Monitor,
};

interface ThemeSwitcherProps {
  variant?: "dropdown" | "compact" | "segmented";
  className?: string;
}

const emptySubscribe = () => () => {};

export function ThemeSwitcher({ variant = "dropdown", className }: ThemeSwitcherProps) {
  const { preference, setThemePreference } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const currentPreference = mounted ? preference : "system";
  const ActiveIcon = THEME_ICONS[currentPreference] || Monitor;

  if (variant === "segmented") {
    return (
      <div
        className={cn(
          "inline-flex p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]",
          className
        )}
      >
        {(["system", "light", "dark", "midnight", "professional"] as ThemePreference[]).map((p) => {
          const Icon = THEME_ICONS[p];
          const isSelected = currentPreference === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setThemePreference(p)}
              className={cn(
                "px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all",
                isSelected
                  ? "bg-[var(--brand-primary)] text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
              )}
              title={`Switch to ${p} theme`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="capitalize">{p}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("relative inline-block text-left", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] focus-ring transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <ActiveIcon className="w-4 h-4 text-[var(--brand-primary)]" />
        <span className="capitalize">{currentPreference}</span>
        <ChevronDown className="w-3 h-3 text-[var(--text-muted)]" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2.5 py-1.5 text-[10px] font-semibold tracking-wider uppercase text-[var(--text-muted)]">
            Appearance
          </div>

          <button
            type="button"
            onClick={() => {
              setThemePreference("system");
              setIsOpen(false);
            }}
            className={cn(
              "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left",
              currentPreference === "system"
                ? "bg-[var(--bg-surface-elevated)] text-[var(--brand-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
            )}
          >
            <div className="flex items-center gap-2.5">
              <Monitor className="w-4 h-4" />
              <div>
                <div className="font-medium">System Preference</div>
                <div className="text-[10px] text-[var(--text-muted)]">Syncs with OS mode</div>
              </div>
            </div>
            {preference === "system" && <Check className="w-3.5 h-3.5" />}
          </button>

          <div className="my-1 border-t border-[var(--border-subtle)]" />

          {THEME_LIST.map((themeItem) => {
            const Icon = THEME_ICONS[themeItem.id];
            const isSelected = preference === themeItem.id;
            return (
              <button
                key={themeItem.id}
                type="button"
                onClick={() => {
                  setThemePreference(themeItem.id);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left",
                  isSelected
                    ? "bg-[var(--bg-surface-elevated)] text-[var(--brand-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4" />
                  <div>
                    <div className="font-medium">{themeItem.label}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{themeItem.description}</div>
                  </div>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
