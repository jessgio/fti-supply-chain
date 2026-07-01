"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { TimelineAdjustmentGantt } from "@/components/timeline-adjustment/timeline-adjustment-gantt";
import {
  TimelineProductsEditor,
  type FormTimelineProduct,
} from "@/components/timeline-adjustment/timeline-products-editor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  formatTimelineDisplayName,
  timelineProductsMatch,
} from "@/lib/timeline-adjustment/products";
import {
  buildTimelineSchedule,
  DEFAULT_LEAD_TIMES,
  formatTimelineDate,
  formatTimelineIso,
  leadTimesFromProductTimeline,
  TIMELINE_PROCESS_DEFS,
  type TimelineAnchor,
  type TimelineLeadTimes,
  type TimelineScheduleProduct,
} from "@/lib/timeline-adjustment/schedule";
import { cn, parseDate } from "@/lib/utils";
import type { ProductTimeline, TimelineProductOption } from "@/types/database";

const LEAD_TIME_FIELDS: {
  key: keyof TimelineLeadTimes;
  label: string;
  parallel?: boolean;
}[] = [
  {
    key: "primary_packaging",
    label: "Primary packaging (incl. shipping)",
    parallel: true,
  },
  { key: "secondary_packaging", label: "Secondary packaging", parallel: true },
  { key: "extract", label: "Extract production", parallel: true },
  { key: "send_to_manufacturer", label: "Send parts to manufacturer" },
  { key: "manufacturer_filling", label: "Manufacturer filling" },
];

interface FormState {
  products: FormTimelineProduct[];
  anchor: TimelineAnchor;
  anchorDate: string;
  leadTimes: TimelineLeadTimes;
}

const EMPTY_FORM: FormState = {
  products: [],
  anchor: "warehouse_delivery",
  anchorDate: "",
  leadTimes: { ...DEFAULT_LEAD_TIMES },
};

function formProductsFromTimeline(timeline: ProductTimeline): FormTimelineProduct[] {
  return timeline.products.map((product) => ({
    productName: product.product_name,
    skuId: product.sku_id,
  }));
}

function formFromTimeline(timeline: ProductTimeline): FormState {
  return {
    products: formProductsFromTimeline(timeline),
    anchor: timeline.anchor,
    anchorDate: timeline.anchor_date,
    leadTimes: leadTimesFromProductTimeline(timeline),
  };
}

function toScheduleProducts(products: FormTimelineProduct[]): TimelineScheduleProduct[] {
  return products.map((product) => ({
    productName: product.productName,
    skuId: product.skuId,
  }));
}

function timelineDisplayName(timeline: ProductTimeline): string {
  return formatTimelineDisplayName(
    timeline.products.map((product) => ({ productName: product.product_name })),
  );
}

function AnchorToggle({
  value,
  onChange,
}: {
  value: TimelineAnchor;
  onChange: (value: TimelineAnchor) => void;
}) {
  const options: { value: TimelineAnchor; label: string; description: string }[] =
    [
      {
        value: "warehouse_delivery",
        label: "Warehouse delivery date",
        description: "Work backwards from when products must arrive",
      },
      {
        value: "start",
        label: "Project start date",
        description: "Work forwards from when production begins",
      },
    ];

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg border px-4 py-3 text-left transition-colors",
              selected
                ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600/30"
                : "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50",
            )}
          >
            <p
              className={cn(
                "text-sm font-medium",
                selected ? "text-emerald-900" : "text-stone-900",
              )}
            >
              {option.label}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">{option.description}</p>
          </button>
        );
      })}
    </div>
  );
}

export function TimelineAdjustmentWorkspace() {
  const [timelines, setTimelines] = useState<ProductTimeline[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<TimelineProductOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | "new">("new");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const loadTimelines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/timeline-adjustment");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load timelines");
      setTimelines(data.timelines ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCatalogProducts = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await fetch("/api/timeline-adjustment/products");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load products");
      setCatalogProducts(data.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTimelines();
    loadCatalogProducts();
  }, [loadTimelines, loadCatalogProducts]);

  function handleSelectTimeline(value: string) {
    setSaveMessage(null);
    setError(null);
    if (value === "new") {
      setSelectedId("new");
      setForm(EMPTY_FORM);
      return;
    }
    const timeline = timelines.find((t) => t.id === value);
    if (!timeline) return;
    setSelectedId(timeline.id);
    setForm(formFromTimeline(timeline));
  }

  function updateLeadTime(key: keyof TimelineLeadTimes, raw: string) {
    const parsed = Number.parseInt(raw, 10);
    setForm((prev) => ({
      ...prev,
      leadTimes: {
        ...prev.leadTimes,
        [key]: Number.isFinite(parsed) && parsed > 0 ? parsed : prev.leadTimes[key],
      },
    }));
  }

  const schedule = useMemo(() => {
    const parsed = parseDate(form.anchorDate);
    if (form.products.length === 0 || !parsed) return null;
    return buildTimelineSchedule({
      products: toScheduleProducts(form.products),
      anchor: form.anchor,
      anchorDate: parsed,
      leadTimes: form.leadTimes,
    });
  }, [form]);

  const anchorLabel =
    form.anchor === "warehouse_delivery"
      ? "Warehouse delivery date"
      : "Project start date";

  const formDisplayName = formatTimelineDisplayName(toScheduleProducts(form.products));

  const isDirty = useMemo(() => {
    if (selectedId === "new") {
      return (
        form.products.length > 0 ||
        form.anchorDate !== "" ||
        JSON.stringify(form.leadTimes) !== JSON.stringify(DEFAULT_LEAD_TIMES)
      );
    }
    const saved = timelines.find((t) => t.id === selectedId);
    if (!saved) return true;
    const savedForm = formFromTimeline(saved);
    return (
      !timelineProductsMatch(
        toScheduleProducts(form.products),
        toScheduleProducts(savedForm.products),
      ) ||
      form.anchor !== savedForm.anchor ||
      form.anchorDate !== savedForm.anchorDate ||
      JSON.stringify(form.leadTimes) !== JSON.stringify(savedForm.leadTimes)
    );
  }, [form, selectedId, timelines]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    try {
      const payload = {
        products: form.products.map((product) => ({
          product_name: product.productName.trim(),
          sku_id: product.skuId,
        })),
        anchor: form.anchor,
        anchor_date: form.anchorDate,
        primary_packaging_days: form.leadTimes.primary_packaging,
        secondary_packaging_days: form.leadTimes.secondary_packaging,
        extract_days: form.leadTimes.extract,
        send_to_manufacturer_days: form.leadTimes.send_to_manufacturer,
        manufacturer_filling_days: form.leadTimes.manufacturer_filling,
      };

      const isNew = selectedId === "new";
      const res = await fetch(
        isNew ? "/api/timeline-adjustment" : `/api/timeline-adjustment/${selectedId}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      const saved: ProductTimeline = data.timeline;
      setTimelines((prev) => {
        const next = prev.filter((t) => t.id !== saved.id);
        next.push(saved);
        next.sort((a, b) => timelineDisplayName(a).localeCompare(timelineDisplayName(b)));
        return next;
      });
      setSelectedId(saved.id);
      setForm(formFromTimeline(saved));
      setSaveMessage("Timeline saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (selectedId === "new") return;
    if (!window.confirm(`Delete timeline for "${formDisplayName}"?`)) return;

    setDeleting(true);
    setError(null);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/timeline-adjustment/${selectedId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");

      setTimelines((prev) => prev.filter((t) => t.id !== selectedId));
      setSelectedId("new");
      setForm(EMPTY_FORM);
      setSaveMessage("Timeline deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  const canSave =
    form.products.length > 0 &&
    form.anchorDate !== "" &&
    Object.values(form.leadTimes).every((v) => v > 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Saved timelines</CardTitle>
          <CardDescription>
            Load a saved timeline or create a new one. Each timeline can include
            multiple products sharing one production schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2">
            <label htmlFor="timeline-select" className="text-sm font-medium text-stone-700">
              Saved timeline
            </label>
            <select
              id="timeline-select"
              value={selectedId}
              onChange={(e) => handleSelectTimeline(e.target.value)}
              disabled={loading}
              className="h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 disabled:opacity-50"
            >
              <option value="new">+ New timeline</option>
              {timelines.map((timeline) => (
                <option key={timeline.id} value={timeline.id}>
                  {timelineDisplayName(timeline)}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSelectTimeline("new")}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
            New
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline inputs</CardTitle>
          <CardDescription>
            Add one or more products, set the anchor date and lead times. All
            products share the same Gantt schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium text-stone-700">Products</p>
            <TimelineProductsEditor
              products={form.products}
              catalogProducts={catalogProducts}
              catalogLoading={catalogLoading}
              onChange={(products) => setForm((prev) => ({ ...prev, products }))}
              anchor={form.anchor}
              anchorDate={form.anchorDate}
              onUseStockoutDate={(date) =>
                setForm((prev) => ({ ...prev, anchorDate: date }))
              }
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-stone-700">Anchor date</p>
            <AnchorToggle
              value={form.anchor}
              onChange={(anchor) => setForm((prev) => ({ ...prev, anchor }))}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="anchor-date" className="text-sm font-medium text-stone-700">
              {anchorLabel}
            </label>
            <Input
              id="anchor-date"
              type="date"
              value={form.anchorDate}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, anchorDate: e.target.value }))
              }
              className="max-w-xs"
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-stone-700">Lead times (days)</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {LEAD_TIME_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <label
                    htmlFor={`lead-${field.key}`}
                    className="text-xs font-medium text-stone-600"
                  >
                    {field.label}
                    {field.parallel && (
                      <span className="ml-1 font-normal text-stone-400">(parallel)</span>
                    )}
                  </label>
                  <Input
                    id={`lead-${field.key}`}
                    type="number"
                    min={1}
                    max={999}
                    value={form.leadTimes[field.key]}
                    onChange={(e) => updateLeadTime(field.key, e.target.value)}
                    className="tabular-nums"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4">
            <Button type="button" onClick={handleSave} disabled={!canSave || saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {selectedId === "new" ? "Save timeline" : "Save changes"}
            </Button>
            {selectedId !== "new" && (
              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                disabled={deleting}
                className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete
              </Button>
            )}
            {isDirty && selectedId !== "new" && !saving && (
              <span className="text-xs text-amber-700">Unsaved changes</span>
            )}
            {saveMessage && (
              <span className="text-xs text-emerald-700">{saveMessage}</span>
            )}
          </div>

          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {form.products.length === 0 || !form.anchorDate ? (
        <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-4 py-10 text-center text-sm text-stone-500">
          Add at least one product and enter {anchorLabel.toLowerCase()} to generate
          the timeline.
        </p>
      ) : schedule ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{schedule.displayName}</CardTitle>
              <CardDescription>
                {schedule.products.length} product
                {schedule.products.length === 1 ? "" : "s"} ·{" "}
                {schedule.totalCalendarDays} calendar days from project start (
                {formatTimelineDate(schedule.projectStart)}) to warehouse delivery (
                {formatTimelineDate(schedule.warehouseDelivery)}).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TimelineAdjustmentGantt schedule={schedule} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Products in this timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                {schedule.products.map((product) => (
                  <li
                    key={`${product.skuId ?? "custom"}-${product.productName}`}
                    className="px-4 py-2.5 text-sm text-stone-800"
                  >
                    {product.productName}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Schedule summary</CardTitle>
              <CardDescription>
                Shared process dates, anchored on{" "}
                {form.anchor === "warehouse_delivery"
                  ? `warehouse delivery (${formatTimelineIso(schedule.warehouseDelivery)})`
                  : `project start (${formatTimelineIso(schedule.projectStart)})`}
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs font-medium uppercase tracking-wide text-stone-500">
                    <th className="pb-3 pr-4 font-medium">Process</th>
                    <th className="pb-3 pr-4 font-medium">Lead time</th>
                    <th className="pb-3 pr-4 font-medium">Start</th>
                    <th className="pb-3 font-medium">End</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {schedule.processes.map((process) => (
                    <tr key={process.id}>
                      <td className="py-3 pr-4 font-medium text-stone-900">
                        {
                          TIMELINE_PROCESS_DEFS.find((d) => d.id === process.id)
                            ?.label ?? process.label
                        }
                        {process.parallel && (
                          <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-stone-500">
                            Parallel
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-stone-600">
                        {process.leadTimeDays} days
                      </td>
                      <td className="py-3 pr-4 tabular-nums text-stone-700">
                        {formatTimelineDate(process.start)}
                      </td>
                      <td className="py-3 tabular-nums text-stone-700">
                        {formatTimelineDate(process.end)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-10 text-center text-sm text-rose-700">
          Enter a valid date to generate the timeline.
        </p>
      )}
    </div>
  );
}
