"use client";

import React, { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useToast } from "@/components/ui/Toast";
import { User, Mail, Shield, Palette, Save } from "lucide-react";

export default function SettingsPage() {
  const { theme } = useTheme();
  const { showToast } = useToast();
  const [name, setName] = useState("Investor User");
  const [email] = useState("investor@example.com");
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      showToast({
        type: "success",
        title: "Settings updated",
        message: "Your profile information has been saved.",
      });
    }, 400);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <PageHeader
        title="Account & Preferences"
        description="Manage your profile information, multi-theme appearance, and security credentials."
      />

      {/* Appearance Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-[var(--brand-primary)]" />
            <CardTitle>Appearance & Theme</CardTitle>
          </div>
          <CardDescription>
            Choose your preferred interface theme. Current active theme is <strong className="capitalize">{theme}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)]/40">
            <div>
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Theme Preset
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Select between Light, Dark, Midnight, and Professional modes.
              </div>
            </div>
            <ThemeSwitcher variant="segmented" />
          </div>
        </CardContent>
      </Card>

      {/* Profile Info Form */}
      <form onSubmit={handleSaveProfile}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[var(--brand-primary)]" />
              <CardTitle>Profile Details</CardTitle>
            </div>
            <CardDescription>
              Basic investor profile information.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Full Name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              leftElement={<User className="w-4 h-4" />}
            />

            <Input
              label="Email Address"
              type="email"
              value={email}
              disabled
              helperText="Email is bound to your Supabase authentication account."
              leftElement={<Mail className="w-4 h-4" />}
            />
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSaving}
              leftIcon={<Save className="w-3.5 h-3.5" />}
            >
              Save Profile
            </Button>
          </CardFooter>
        </Card>
      </form>

      {/* Security Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--status-success)]" />
            <CardTitle>Security & Privacy Architecture</CardTitle>
          </div>
          <CardDescription>
            Our commitment to zero-credential storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-[var(--text-secondary)] space-y-2">
          <p>
            • All database operations are secured via PostgreSQL Row Level Security (RLS) ensuring strict tenant isolation.
          </p>
          <p>
            • We never request, collect, or store UPI PINs, net banking passwords, or broker trading credentials.
          </p>
          <p>
            • All sessions are managed with encrypted HTTP-only cookies and automatic token refreshes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
