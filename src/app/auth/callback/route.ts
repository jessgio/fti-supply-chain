import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { defaultRouteForRole } from "@/lib/auth";
import { isAllowedLoginEmail } from "@/lib/auth-domain";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";

const NEXT_COOKIE = "fti-oauth-next";

function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  return value;
}

function applyCookies(
  response: NextResponse,
  cookies: { name: string; value: string; options?: Record<string, unknown> }[],
) {
  cookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next =
    safeNextPath(searchParams.get("next")) ??
    safeNextPath(request.cookies.get(NEXT_COOKIE)?.value);

  const loginUrl = new URL("/login", origin);
  if (!code) {
    loginUrl.searchParams.set("error", "auth");
    return NextResponse.redirect(loginUrl);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    loginUrl.searchParams.set("error", "auth");
    return NextResponse.redirect(loginUrl);
  }

  const pendingCookies: {
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }[] = [];

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }[],
      ) {
        pendingCookies.push(...cookiesToSet);
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    loginUrl.searchParams.set("error", "auth");
    return applyCookies(NextResponse.redirect(loginUrl), pendingCookies);
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
    loginUrl.searchParams.set("error", "domain");
    const denied = applyCookies(NextResponse.redirect(loginUrl), pendingCookies);
    denied.cookies.delete(NEXT_COOKIE);
    return denied;
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

  const response = applyCookies(
    NextResponse.redirect(`${base}${destination ?? "/dashboard"}`),
    pendingCookies,
  );
  response.cookies.delete(NEXT_COOKIE);
  return response;
}
