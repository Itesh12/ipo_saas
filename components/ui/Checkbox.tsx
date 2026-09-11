import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, checked, id, onChange, ...props }, ref) => {
    const checkboxId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <label
        htmlFor={checkboxId}
        className={cn("flex items-start gap-2.5 cursor-pointer select-none", className)}
      >
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            id={checkboxId}
            type="checkbox"
            ref={ref}
            checked={checked}
            onChange={onChange}
            className="peer sr-only"
            {...props}
          />
          <div className="w-4 h-4 rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] transition-all peer-checked:bg-[var(--brand-primary)] peer-checked:border-[var(--brand-primary)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--brand-primary)]" />
          <Check className="absolute w-3 h-3 text-white opacity-0 transition-opacity peer-checked:opacity-100 pointer-events-none stroke-[3]" />
        </div>
        {(label || description) && (
          <div className="text-xs">
            {label && <span className="font-medium text-[var(--text-primary)]">{label}</span>}
            {description && (
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-normal">
                {description}
              </p>
            )}
          </div>
        )}
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";
