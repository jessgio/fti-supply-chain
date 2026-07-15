"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PoHoverLink } from "@/components/procurement/po-hover-link";
import { PoProductsList } from "@/components/status-updates/po-products-list";
import { StatusUpdateCard } from "@/components/status-updates/status-update-card";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { formatStatusUpdateTime } from "@/lib/status-updates/utils";
import type { Profile, StatusUpdatePoGroup, UserRole } from "@/types/database";

interface StatusUpdatesFeedProps {
  currentUserId?: string | null;
  currentUserRole?: UserRole | null;
}

export function StatusUpdatesFeed({
  currentUserId = null,
  currentUserRole = null,
}: StatusUpdatesFeedProps) {
  const [groups, setGroups] = useState<StatusUpdatePoGroup[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [entityFilter, setEntityFilter] = useState("");
  const searchParams = useSearchParams();
  const highlightNoteId = searchParams.get("note");

  const loadGroups = useCallback(async () => {
    const res = await fetch("/api/status-updates?grouped=1");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to load status updates");
    setGroups(data.groups ?? []);
  }, []);

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);
      setError(null);
      try {
        const [groupsRes, profileRes] = await Promise.all([
          fetch("/api/status-updates?grouped=1"),
          fetch("/api/product-development/profiles"),
        ]);
        const groupsData = await groupsRes.json();
        const profileData = await profileRes.json();
        if (!groupsRes.ok) {
          throw new Error(groupsData.error ?? "Failed to load status updates");
        }
        if (!profileRes.ok) {
          throw new Error(profileData.error ?? "Failed to load profiles");
        }
        setGroups(groupsData.groups ?? []);
        setProfiles(profileData.profiles ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load page");
      } finally {
        setLoading(false);
      }
    }
    void bootstrap();
  }, []);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadGroups();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [loadGroups]);

  const filteredGroups = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return groups
      .map((group) => {
        const updates = group.updates.filter((update) => {
          if (entityFilter) {
            const matchesPrimary = update.entity_type === entityFilter;
            const matchesConnected = (update.connected_refs ?? []).some(
              (ref) => ref.entity_type === entityFilter,
            );
            if (!matchesPrimary && !matchesConnected) return false;
          }
          return true;
        });

        if (updates.length === 0) return null;

        if (!query) {
          return { ...group, updates };
        }

        const productHaystack = [
          ...group.products.flatMap((product) => [
            product.sku_code,
            product.sku_name ?? "",
          ]),
          ...updates.flatMap((update) =>
            (update.associated_products ?? update.scoped_skus ?? []).flatMap(
              (product) => [product.sku_code, product.sku_name ?? ""],
            ),
          ),
        ];

        const haystack = [
          group.po_number,
          group.supplier_name ?? "",
          ...productHaystack,
          ...updates.map((update) => update.body),
          ...updates.map((update) => update.entity_label ?? ""),
          ...(updates.flatMap((update) =>
            (update.connected_refs ?? []).map((ref) => ref.entity_label ?? ""),
          )),
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(query)) return null;
        return { ...group, updates };
      })
      .filter((group): group is StatusUpdatePoGroup => group !== null);
  }, [groups, debouncedSearch, entityFilter]);

  function refresh() {
    void loadGroups();
  }

  useEffect(() => {
    if (!highlightNoteId || loading) return;
    const element = document.getElementById(`status-update-${highlightNoteId}`);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("ring-2", "ring-emerald-400", "ring-offset-2");
    const timeout = window.setTimeout(() => {
      element.classList.remove("ring-2", "ring-emerald-400", "ring-offset-2");
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [highlightNoteId, loading, groups]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle>Updates by purchase order</CardTitle>
              <CardDescription>
                One section per purchase order with its line items listed once.
                Notes apply to the whole PO unless scoped to specific products.
              </CardDescription>
            </div>
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                className="pl-9"
                placeholder="Search PO, supplier, SKU, or note…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              className="h-9 w-auto min-w-[12rem] shrink-0"
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              aria-label="Filter by record type"
            >
              <option value="">All record types</option>
              <option value="po">PO only</option>
              <option value="payment">Payments only</option>
              <option value="shipment">Shipments only</option>
              <option value="inbound">Inbound only</option>
              <option value="delivery_note">Secondary Packaging Inbound only</option>
              <option value="extract_delivery_note">Extract Inbound only</option>
              <option value="primary_packaging_delivery_note">
                Primary Packaging Inbound only
              </option>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          {loading ? (
            <p className="py-8 text-center text-sm text-stone-500">Loading…</p>
          ) : filteredGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <FileText className="h-10 w-10 text-stone-300" />
              <p className="text-sm text-stone-600">
                {groups.length === 0
                  ? "No status updates yet. Use the New update tab to log the first note."
                  : "No purchase orders match your search or filters."}
              </p>
            </div>
          ) : (
            filteredGroups.map((group) => (
              <section
                key={group.po_id}
                className="rounded-lg border border-stone-200 bg-stone-50/50 p-4"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-stone-200 pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <PoHoverLink
                        poId={group.po_id}
                        poNumber={group.po_number}
                        className="text-base font-semibold text-rose-700 hover:underline"
                      />
                      <Link
                        href={`/dashboard/procurement/${group.po_id}`}
                        className="text-xs text-stone-500 hover:text-stone-800"
                      >
                        View PO
                      </Link>
                    </div>
                    <p className="text-sm text-stone-500">
                      {group.supplier_name ?? "No supplier"}
                      {" · "}
                      {group.updates.length} note
                      {group.updates.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <time
                    className="text-xs text-stone-500"
                    dateTime={group.latest_at}
                  >
                    Latest {formatStatusUpdateTime(group.latest_at)}
                  </time>
                </div>
                <PoProductsList products={group.products} />
                <div className="mt-4 space-y-3">
                  {group.updates.map((update) => (
                    <StatusUpdateCard
                      key={update.id}
                      update={update}
                      profiles={profiles}
                      currentUserId={currentUserId}
                      currentUserRole={currentUserRole}
                      poProductCount={group.products.length}
                      onReplyPosted={refresh}
                      onUpdated={refresh}
                      onDeleted={refresh}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
