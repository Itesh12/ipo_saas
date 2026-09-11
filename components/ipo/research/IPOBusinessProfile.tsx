"use client";

import React from "react";
import { IPOBusinessProfileRow, IPORow } from "@/features/ipo/types/ipo.types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Building2, Globe2 } from "lucide-react";

interface IPOBusinessProfileProps {
  ipo: IPORow;
  profile: IPOBusinessProfileRow | null;
}

export function IPOBusinessProfile({ ipo, profile }: IPOBusinessProfileProps) {
  const overview = profile?.company_overview || ipo.about_company;

  return (
    <Card className="border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <CardHeader className="py-4 px-6 bg-[var(--bg-surface-elevated)]/30 border-b border-[var(--border-subtle)] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[var(--brand-primary)]" />
          <CardTitle className="text-base">Business Model & Operations</CardTitle>
        </div>
        {profile?.industry && (
          <Badge variant="secondary" size="sm">
            Sector: {profile.industry}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Company Overview */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            About {ipo.company_name}
          </h4>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            {overview || `${ipo.company_name} is an active market issuer. Complete operating history and business overview will be populated from official regulatory filings.`}
          </p>
        </div>

        {/* Business Model & Operations */}
        {profile?.business_model && (
          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]/60">
            <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Operating & Revenue Model
            </h4>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              {profile.business_model}
            </p>
          </div>
        )}

        {/* Products & Services Grid */}
        {profile?.products_services && profile.products_services.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]/60">
            <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Core Products & Offerings
            </h4>
            <div className="flex flex-wrap gap-2">
              {profile.products_services.map((item, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-medium"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Geographic Presence & Footprint */}
        {profile?.geographic_presence && (
          <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]/60">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              <Globe2 className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
              <span>Geographical Footprint</span>
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              {profile.geographic_presence}
            </p>
          </div>
        )}

        <div className="pt-2 border-t border-[var(--border-subtle)]/40 flex justify-between items-center text-[11px] text-[var(--text-muted)]">
          <span>Source: {profile?.source || "Official SEBI RHP Filing"}</span>
          {profile?.as_of && <span>As of: {new Date(profile.as_of).toLocaleDateString("en-IN")}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
