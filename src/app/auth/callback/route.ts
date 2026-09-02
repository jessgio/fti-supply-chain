import { NextResponse } from "next/server";
import { defaultRouteForRole } from "@/lib/auth";
import { isAllowedLoginEmail } from "@/lib/auth-domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

function safeNextPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  return value;
}

function redirectToLogin(origin: string, error: "domain" | "auth") {
  const url = new URL("/login", origin);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (!code) {
    return redirectToLogin(origin, "auth");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirectToLogin(origin, "auth");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAllowedLoginEmail(user?.email)) {
    await supabase.auth.signOut();
    if (user?.id) {
      try {
        const admin = createAdminClient();
        await admin.auth.admin.deleteUser(user.id);
      } catch {
        // Session is already cleared; leftover users stay blocked by domain checks.
      }
    }
    return redirectToLogin(origin, "domain");
  }

  let destination = next;
  if (!destination && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    destination = defaultRouteForRole((profile?.role as UserRole) ?? null);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const base =
    !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin;

  return NextResponse.redirect(`${base}${destination ?? "/dashboard"}`);
}
