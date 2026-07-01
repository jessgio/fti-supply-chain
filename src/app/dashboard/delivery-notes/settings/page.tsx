"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/dashboard/page-shell";
import type { DeliveryNoteSettings } from "@/types/database";

export default function DeliveryNoteSettingsPage() {
  const [settings, setSettings] = useState<DeliveryNoteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/delivery-notes/settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load settings.");
      setSettings(data.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/delivery-notes/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings.");
      setSettings(data.settings);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell className="max-w-3xl">
      <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/delivery-notes/catalog"
          className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Secondary Packaging DN Catalog
        </Link>
        <h1 className="text-2xl font-semibold text-stone-900">Cosmax recipient defaults</h1>
        <p className="mt-1 text-sm text-stone-600">
          These details appear in the SHIP TO (recipient) block on every delivery note PDF.
          The external form&apos;s Penerima field overrides the recipient name per submission.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recipient details</CardTitle>
          <CardDescription>
            Default Cosmax distribution center information for delivery note PDFs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center text-stone-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading settings…
            </div>
          ) : !settings ? (
            <p className="text-sm text-red-600">{error ?? "Settings not found."}</p>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-stone-700">Company</span>
                <Input
                  value={settings.recipient_company}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev ? { ...prev, recipient_company: e.target.value } : prev,
                    )
                  }
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-stone-700">Default PIC name</span>
                <Input
                  value={settings.recipient_pic_name ?? ""}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev ? { ...prev, recipient_pic_name: e.target.value || null } : prev,
                    )
                  }
                  placeholder="Used when no Penerima is set on the form"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-stone-700">Address</span>
                <textarea
                  value={settings.recipient_address}
                  onChange={(e) =>
                    setSettings((prev) =>
                      prev ? { ...prev, recipient_address: e.target.value } : prev,
                    )
                  }
                  rows={4}
                  required
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-stone-700">Phone</span>
                  <Input
                    value={settings.recipient_phone ?? ""}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, recipient_phone: e.target.value || null } : prev,
                      )
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-stone-700">Email</span>
                  <Input
                    type="email"
                    value={settings.recipient_email ?? ""}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, recipient_email: e.target.value || null } : prev,
                      )
                    }
                  />
                </label>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
              {saved && (
                <p className="text-sm text-emerald-700">Settings saved successfully.</p>
              )}

              <Button type="submit" disabled={saving} className="self-start">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save settings
                  </>
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      </div>
    </PageShell>
  );
}
