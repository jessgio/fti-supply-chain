"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types/database";

function routeForRole(role: UserRole | null): string {
  if (role === "sales_marketing") return "/dashboard/commercial";
  if (role === "supply_chain" || role === "admin") return "/dashboard/inventory";
  return "/dashboard";
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice(
            "Account created. Check your email to confirm, then sign in.",
          );
          setMode("signin");
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      let role: UserRole | null = null;
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        role = (profile?.role as UserRole) ?? null;
      }

      router.push(redirect || routeForRole(role));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Badge className="mb-2 w-fit bg-emerald-100 text-emerald-800">
            From This Island
          </Badge>
          <CardTitle className="text-xl">
            {mode === "signin" ? "Sign in" : "Create account"}
          </CardTitle>
          <CardDescription>
            Supply chain command center — sales, marketing, and operations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <label className="block space-y-1">
                <span className="text-sm font-medium text-stone-700">
                  Full name
                </span>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-sm font-medium text-stone-700">Email</span>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@fromthisisland.com"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-stone-700">
                Password
              </span>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>

            {error && <p className="text-sm text-rose-600">{error}</p>}
            {notice && <p className="text-sm text-emerald-700">{notice}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "Please wait..."
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-stone-500">
            {mode === "signin" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  className="font-medium text-emerald-700 hover:underline"
                  onClick={() => setMode("signup")}
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="font-medium text-emerald-700 hover:underline"
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
          <p className="mt-3 text-center text-xs text-stone-400">
            New accounts start with view-only access. An admin grants supply
            chain or sales &amp; marketing permissions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-stone-500">
          Loading…
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
