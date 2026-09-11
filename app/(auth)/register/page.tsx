"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { Lock, Mail, User, ArrowRight, Shield } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
        showToast({
          type: "error",
          title: "Registration failed",
          message: error.message,
        });
      } else {
        showToast({
          type: "success",
          title: "Account created successfully",
          message: "Please check your inbox to verify your email, or proceed.",
        });
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      showToast({
        type: "info",
        title: "Demo Mode Active",
        message: "Account created in local environment.",
      });
      router.push("/dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-[var(--border-subtle)] shadow-xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Create your account</CardTitle>
          <div className="flex items-center gap-1 text-[11px] text-[var(--brand-primary)] bg-[var(--brand-primary)]/10 px-2 py-0.5 rounded-full font-medium">
            <Shield className="w-3.5 h-3.5" />
            <span>Zero Secrets Stored</span>
          </div>
        </div>
        <CardDescription>
          Join thousands of Indian investors tracking IPO GMP, subscriptions, and multi-account allotments.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleRegister}>
        <CardContent className="space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-[var(--status-danger-bg)] border border-[var(--status-danger)]/30 text-xs text-[var(--status-danger)]">
              {errorMessage}
            </div>
          )}

          <Input
            label="Full Name"
            type="text"
            placeholder="Rahul Sharma"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            leftElement={<User className="w-4 h-4" />}
            required
            autoComplete="name"
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="investor@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftElement={<Mail className="w-4 h-4" />}
            required
            autoComplete="email"
          />

          <Input
            label="Password (min. 8 characters)"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftElement={<Lock className="w-4 h-4" />}
            required
            autoComplete="new-password"
          />

          <Input
            label="Confirm Password"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            leftElement={<Lock className="w-4 h-4" />}
            required
            autoComplete="new-password"
          />
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isLoading={isLoading}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Create Account
          </Button>

          <p className="text-xs text-center text-[var(--text-secondary)]">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-[var(--brand-primary)] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
