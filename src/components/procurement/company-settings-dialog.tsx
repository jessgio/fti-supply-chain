"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CompanySettings } from "@/types/database";

export function CompanySettingsDialog({ onClose }: { onClose: () => void }) {
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [picName, setPicName] = useState("");
  const [picEmail, setPicEmail] = useState("");
  const [picPhone, setPicPhone] = useState("");
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoVersion, setLogoVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/procurement/company-settings");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        if (!active) return;
        const s = data.settings as CompanySettings;
        setCompanyName(s.company_name);
        setAddress(s.address ?? "");
        setPicName(s.pic_name ?? "");
        setPicEmail(s.pic_email ?? "");
        setPicPhone(s.pic_phone ?? "");
        setLogoPath(s.logo_path ?? null);
      } catch (err) {
        if (active)
          setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  async function handleLogoUpload(file: File) {
    setLogoBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/procurement/company-settings/logo", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to upload logo");
      setLogoPath(data.settings.logo_path ?? null);
      setLogoVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleLogoRemove() {
    setLogoBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/procurement/company-settings/logo", {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove logo");
      setLogoPath(null);
      setLogoVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove logo");
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/procurement/company-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName,
          address: address || null,
          pic_name: picName || null,
          pic_email: picEmail || null,
          pic_phone: picPhone || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Company information"
      description="Shown on purchase order PDFs as the buyer."
    >
      {loading ? (
        <p className="text-sm text-stone-500">Loading...</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="text-sm font-medium text-stone-700">
              Company logo
            </span>
            <p className="text-xs text-stone-500">
              Shown at the top of purchase order PDFs. PNG or JPEG, max 2 MB.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {logoPath ? (
                <Image
                  src={`/api/procurement/company-settings/logo?v=${logoVersion}`}
                  alt="Company logo"
                  width={160}
                  height={48}
                  unoptimized
                  className="h-12 max-w-[160px] rounded border border-stone-200 bg-white object-contain p-1"
                />
              ) : (
                <div className="flex h-12 w-32 items-center justify-center rounded border border-dashed border-stone-300 bg-stone-50 text-xs text-stone-400">
                  No logo
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  disabled={logoBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleLogoUpload(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={logoBusy}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {logoBusy ? "Uploading..." : logoPath ? "Replace" : "Upload"}
                </Button>
                {logoPath && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={logoBusy}
                    onClick={() => void handleLogoRemove()}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-stone-700">
              Company name
            </span>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-stone-700">Address</span>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, city, country"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-sm font-medium text-stone-700">PIC name</span>
              <Input
                value={picName}
                onChange={(e) => setPicName(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-stone-700">PIC email</span>
              <Input
                type="email"
                value={picEmail}
                onChange={(e) => setPicEmail(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-stone-700">PIC phone</span>
              <Input
                value={picPhone}
                onChange={(e) => setPicPhone(e.target.value)}
              />
            </label>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !companyName.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}