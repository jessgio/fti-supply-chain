"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
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
import {
  DeliveryNoteModuleHeader,
  type DeliveryNoteModule,
} from "@/components/delivery-note/delivery-note-module-header";

export interface PackagingDnSettingsFields {
  recipient_company: string;
  recipient_address: string;
  recipient_pic_name: string | null;
  recipient_phone: string | null;
  recipient_email: string | null;
}

export interface PackagingDnSettingsPageProps {
  module: DeliveryNoteModule;
  description: string;
  cardDescription: string;
  picPlaceholder?: string;
  settingsUrl: string;
}

export function PackagingDnSettingsPage({
  module,
  description,
  cardDescription,
  picPlaceholder = "e.g. Pak Erwin Hadi",
  settingsUrl,
}: PackagingDnSettingsPageProps) {
  const [settings, setSettings] = useState<PackagingDnSettingsFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(settingsUrl);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load settings.");
      setSettings(data.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }, [settingsUrl]);

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
      const res = await fetch(settingsUrl, {
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
        <DeliveryNoteModuleHeader
          module={module}
          page="settings"
          title="Recipient Settings"
          description={description}
        />

        <Card>
          <CardHeader>
            <CardTitle>Recipient details</CardTitle>
            <CardDescription>{cardDescription}</CardDescription>
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
              <form onSubmit={(e) => void handleSave(e)} className="flex flex-col gap-4">
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
                        prev
                          ? { ...prev, recipient_pic_name: e.target.value || null }
                          : prev,
                      )
                    }
                    placeholder={picPlaceholder}
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
                          prev
                            ? { ...prev, recipient_phone: e.target.value || null }
                            : prev,
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
                          prev
                            ? { ...prev, recipient_email: e.target.value || null }
                            : prev,
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
