"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface SectionItem {
  id: string;
  label: string;
}

const SECTIONS: SectionItem[] = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "business", label: "Business" },
  { id: "financials", label: "Financials" },
  { id: "valuation", label: "Valuation & Peers" },
  { id: "structure", label: "Structure & Promoters" },
  { id: "strengths-risks", label: "Strengths & Risks" },
  { id: "gmp", label: "GMP Trend" },
  { id: "subscription", label: "Subscription" },
  { id: "allotment", label: "Allotment" },
  { id: "score", label: "IPO Score" },
  { id: "documents", label: "Documents" },
  { id: "news", label: "News" },
];

export function IPONavSticky() {
  const [activeSection, setActiveSection] = useState<string>("overview");

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 120;
      for (const section of SECTIONS) {
        const el = document.getElementById(section.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -90;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <nav
      aria-label="IPO Research Navigation"
      className="sticky top-16 z-30 w-full bg-[var(--bg-surface)]/95 backdrop-blur-md border-y border-[var(--border-subtle)] shadow-xs"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-1 overflow-x-auto py-2.5 scrollbar-none no-scrollbar">
          {SECTIONS.map((section) => {
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                type="button"
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 cursor-pointer",
                  isActive
                    ? "bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
                )}
              >
                {section.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
