import React from "react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  href?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  subtitle?: string;
}

export function BrandLogo({
  href = "/",
  size = "md",
  className,
  subtitle,
}: BrandLogoProps) {
  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  const textSizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  return (
    <Link
      href={href}
      className={cn("flex items-center gap-2.5 group select-none", className)}
    >
      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[var(--brand-primary)] to-[var(--brand-accent)] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
        <TrendingUp className={iconSizes[size]} />
      </div>
      <div>
        <div className={cn("font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-1.5", textSizes[size])}>
          <span>IPO</span>
          <span className="text-[var(--brand-primary)]">OS</span>
        </div>
        {subtitle ? (
          <div className="text-[10px] uppercase font-semibold tracking-wider text-[var(--text-muted)]">
            {subtitle}
          </div>
        ) : (
          <div className="text-[9px] uppercase font-semibold tracking-widest text-[var(--text-muted)] leading-none">
            Operating System
          </div>
        )}
      </div>
    </Link>
  );
}
