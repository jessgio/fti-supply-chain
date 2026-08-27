import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/database";

export interface CurrentProfile {
  id: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
}

const WRITE_ROLES: UserRole[] = ["admin", "supply_chain"];
const SUPPLY_CHAIN_ROLES: UserRole[] = ["admin", "supply_chain"];
const COMMERCIAL_WRITE_ROLES: UserRole[] = [
  "admin",
  "supply_chain",
  "sales_marketing",
];

/** Admin-only: Lark user directory management. */
export function canManageLarkUsers(role: UserRole | null | undefined): boolean {
  return role === "admin";
}

function authConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Resolve the signed-in user's profile, or null if not authenticated. */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  if (!authConfigured()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .maybeSingle();

    return {
      id: user.id,
      email: user.email ?? null,
      fullName: data?.full_name ?? null,
      role: (data?.role as UserRole) ?? "viewer",
    };
  } catch {
    return null;
  }
}

/** Default dashboard route per department role. */
export function defaultRouteForRole(role: UserRole | null | undefined): string {
  switch (role) {
    case "sales_marketing":
      return "/dashboard/commercial";
    case "supply_chain":
    case "admin":
      return "/dashboard/inventory";
    default:
      return "/dashboard";
  }
}

/**
 * Guard for write API routes. Returns a NextResponse to short-circuit when the
 * caller is unauthenticated or lacks a write role; returns null when allowed.
 * No-ops (allows) when auth is not configured so local dev keeps working.
 */
export async function requireWriteRole(): Promise<NextResponse | null> {
  if (!authConfigured()) return null;

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json(
      { error: "Your role does not have permission to modify data." },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Guard for read-only API routes. Requires authentication but does not
 * restrict by role — any signed-in user can call the route.
 * No-ops (allows) when auth is not configured so local dev keeps working.
 */
export async function requireReadRole(): Promise<NextResponse | null> {
  if (!authConfigured()) return null;

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return null;
}

/** Guard for commercial S&OP writes (targets, forecast CSV, channel mapping). */
export async function requireCommercialWrite(): Promise<NextResponse | null> {
  if (!authConfigured()) return null;

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!COMMERCIAL_WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json(
      { error: "Your role does not have permission to edit the sales forecast." },
      { status: 403 },
    );
  }
  return null;
}

/** Guard for supply-chain-only modules (packaging, procurement UI). */
export async function requireSupplyChainAccess(): Promise<NextResponse | null> {
  if (!authConfigured()) return null;

  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!SUPPLY_CHAIN_ROLES.includes(profile.role)) {
    return NextResponse.json(
      { error: "Supply chain access required." },
      { status: 403 },
    );
  }
  return null;
}
