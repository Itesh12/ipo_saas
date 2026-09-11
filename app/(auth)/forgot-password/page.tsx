"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { Mail, ArrowLeft, Send } from "lucide-react";

export default function ForgotPasswordPage() {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        showToast({
          type: "error",
          title: "Password reset request failed",
          message: error.message,
        });
      } else {
        setIsSubmitted(true);
        showToast({
          type: "success",
          title: "Reset link dispatched",
          message: "Check your email for instructions to reset your password.",
        });
      }
    } catch {
      setIsSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-[var(--border-subtle)] shadow-xl">
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter the email address associated with your account and we&apos;ll send you a password reset link.
        </CardDescription>
      </CardHeader>

      {isSubmitted ? (
        <CardContent className="space-y-4">
          <div className="p-4 rounded-xl bg-[var(--status-success-bg)] border border-[var(--status-success)]/30 text-xs text-[var(--status-success)] space-y-1">
            <p className="font-semibold">Password reset link sent!</p>
            <p className="text-[var(--text-secondary)]">
              If an account exists for <strong>{email}</strong>, you will receive an email shortly with reset instructions.
            </p>
          </div>
          <Link href="/login">
            <Button variant="outline" className="w-full" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Return to login
            </Button>
          </Link>
        </CardContent>
      ) : (
        <form onSubmit={handleResetRequest}>
          <CardContent className="space-y-4">
            <Input
              label="Account Email Address"
              type="email"
              placeholder="investor@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftElement={<Mail className="w-4 h-4" />}
              required
            />
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isLoading}
              rightIcon={<Send className="w-4 h-4" />}
            >
              Send Reset Link
            </Button>

            <Link
              href="/login"
              className="text-xs text-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </Link>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
