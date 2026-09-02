import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAllowedLoginEmail } from "@/lib/auth-domain";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase is not configured, do not gate routes (local dev fallback).
  if (!url || !anon) return NextResponse.next();

  let response = NextResponse.next({ request });

  type CookieToSet = {
    name: string;
    value: string;
    options?: Record<string, unknown>;
  };

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allowedUser = user && isAllowedLoginEmail(user.email) ? user : null;
  if (user && !allowedUser) {
    await supabase.auth.signOut();
  }

  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";
  const isProtected = pathname.startsWith("/dashboard");

  if (!allowedUser && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", pathname);
    return redirectWithCookies(redirectUrl, response);
  }

  if (allowedUser && isLogin) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return redirectWithCookies(redirectUrl, response);
  }

  return response;
}

function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  return redirect;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
