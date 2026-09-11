"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 4000 }: Omit<ToastItem, "id">) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none p-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border bg-[var(--bg-surface)] shadow-lg animate-in slide-in-from-bottom-5 duration-200",
              toast.type === "success" && "border-[var(--status-success)]/40",
              toast.type === "error" && "border-[var(--status-danger)]/40",
              toast.type === "warning" && "border-[var(--status-warning)]/40",
              toast.type === "info" && "border-[var(--status-info)]/40"
            )}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === "success" && (
                <CheckCircle2 className="w-4 h-4 text-[var(--status-success)]" />
              )}
              {toast.type === "error" && (
                <AlertCircle className="w-4 h-4 text-[var(--status-danger)]" />
              )}
              {toast.type === "warning" && (
                <AlertTriangle className="w-4 h-4 text-[var(--status-warning)]" />
              )}
              {toast.type === "info" && (
                <Info className="w-4 h-4 text-[var(--status-info)]" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h5 className="text-xs font-semibold text-[var(--text-primary)]">
                {toast.title}
              </h5>
              {toast.message && (
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-normal">
                  {toast.message}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="shrink-0 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
