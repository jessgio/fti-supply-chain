"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ALLOWED_LOGIN_DOMAIN } from "@/lib/auth-domain";
import { createClient } from "@/lib/supabase/client";

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function errorMessage(error: string | null): string | null {
  if (!error) return null;
  if (error === "domain") {
    return `Only @${ALLOWED_LOGIN_DOMAIN} Google accounts can sign in.`;
  }
  if (error === "auth" || error === "access_denied" || error === "server_error") {
    return "Google sign-in failed. Please try again with your company account.";
  }
  return "Google sign-in failed. Please try again.";
}

function safeNextPath(value: string | null): string {
  if (
    value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  ) {
    return value;
  }
  return "/dashboard";
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setError(errorMessage(params.get("error")));
  }, []);

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams(window.location.search);
      const next = safeNextPath(params.get("redirect"));
      document.cookie = `fti-oauth-next=${encodeURIComponent(next)}; Path=/; Max-Age=600; SameSite=Lax`;

      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
          queryParams: {
            hd: ALLOWED_LOGIN_DOMAIN,
            prompt: "select_account",
          },
        },
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      if (data.url) {
        window.location.assign(data.url);
        return;
      }

      setError("Google sign-in failed. Please try again.");
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
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
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>
            Supply chain command center — use your @{ALLOWED_LOGIN_DOMAIN}{" "}
            Google account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-rose-600">{error}</p>}

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={loading}
            onClick={handleGoogleSignIn}
          >
            <GoogleIcon />
            {loading ? "Redirecting to Google..." : "Continue with Google"}
          </Button>

          <p className="text-center text-xs text-stone-400">
            Access is limited to @{ALLOWED_LOGIN_DOMAIN}. New accounts start
            with view-only access. An admin grants supply chain or sales &amp;
            marketing permissions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
