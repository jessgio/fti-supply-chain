"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  isLarkDirectoryEmail,
  LARK_DIRECTORY_EMAIL_DOMAINS,
} from "@/lib/lark/ap-form";
import type { LarkUserDirectoryEntry } from "@/types/database";

const CSV_TEMPLATE =
  "email,open_id,display_name\njessica@fromthisisland.com,ou_xxxxxxxx,Jessica\nfinance@fromthisisland.com,ou_yyyyyyyy,Finance\n";

type CsvRow = {
  email: string;
  open_id: string;
  display_name: string;
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseDirectoryCsv(text: string): {
  rows: CsvRow[];
  error?: string;
} {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], error: "CSV is empty." };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const emailIdx = headers.findIndex(
    (h) => h === "email" || h === "e-mail" || h === "mail",
  );
  const openIdIdx = headers.findIndex(
    (h) =>
      h === "open_id" ||
      h === "openid" ||
      h === "lark_open_id" ||
      h === "ou",
  );
  const nameIdx = headers.findIndex(
    (h) => h === "display_name" || h === "name" || h === "full_name",
  );

  if (emailIdx < 0 || openIdIdx < 0) {
    return {
      rows: [],
      error: "CSV must include email and open_id columns.",
    };
  }

  const rows: CsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const email = (cells[emailIdx] ?? "").trim().toLowerCase();
    const open_id = (cells[openIdIdx] ?? "").trim();
    const display_name =
      nameIdx >= 0 ? (cells[nameIdx] ?? "").trim() : "";
    if (!email && !open_id) continue;
    rows.push({ email, open_id, display_name });
  }

  return { rows };
}

function isValidOpenId(value: string): boolean {
  return /^ou_[a-zA-Z0-9]+$/.test(value);
}

export function LarkUserDirectoryManager({
  initialRows,
}: {
  initialRows: LarkUserDirectoryEntry[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState(initialRows);
  const [email, setEmail] = useState("");
  const [openId, setOpenId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const supabase = createClient();
    const { data, error: loadErr } = await supabase
      .from("lark_user_directory")
      .select("*")
      .order("email", { ascending: true });
    if (loadErr) {
      setError(loadErr.message);
      return;
    }
    setRows((data ?? []) as LarkUserDirectoryEntry[]);
  }

  async function upsertRow(input: CsvRow) {
    const supabase = createClient();
    const payload = {
      email: input.email.toLowerCase(),
      lark_open_id: input.open_id.trim(),
      display_name: input.display_name.trim(),
    };
    const { error: upsertErr } = await supabase
      .from("lark_user_directory")
      .upsert(payload, { onConflict: "email" });
    if (upsertErr) throw new Error(upsertErr.message);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedOpenId = openId.trim();
      if (!isLarkDirectoryEmail(normalizedEmail)) {
        throw new Error(
          `Email must be one of: ${LARK_DIRECTORY_EMAIL_DOMAINS.map((d) => `@${d}`).join(", ")}`,
        );
      }
      if (!isValidOpenId(normalizedOpenId)) {
        throw new Error("open_id must look like ou_...");
      }
      await upsertRow({
        email: normalizedEmail,
        open_id: normalizedOpenId,
        display_name: displayName,
      });
      setEmail("");
      setOpenId("");
      setDisplayName("");
      setMessage("Saved.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(rowEmail: string) {
    if (!window.confirm(`Remove Lark mapping for ${rowEmail}?`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error: delErr } = await supabase
        .from("lark_user_directory")
        .delete()
        .eq("email", rowEmail);
      if (delErr) throw new Error(delErr.message);
      setMessage(`Removed ${rowEmail}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRename(rowEmail: string, nextName: string) {
    const trimmed = nextName.trim();
    const current = rows.find((r) => r.email === rowEmail)?.display_name ?? "";
    if (trimmed === current) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    setRows((prev) =>
      prev.map((r) =>
        r.email === rowEmail ? { ...r, display_name: trimmed } : r,
      ),
    );
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase
        .from("lark_user_directory")
        .update({ display_name: trimmed })
        .eq("email", rowEmail);
      if (updErr) throw new Error(updErr.message);
      setMessage(`Updated name for ${rowEmail}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleDefaultApprover(
    row: LarkUserDirectoryEntry,
    next: boolean,
  ) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error: updErr } = await supabase
        .from("lark_user_directory")
        .update({ is_default_approver: next })
        .eq("lark_open_id", row.lark_open_id);
      if (updErr) throw new Error(updErr.message);
      setRows((prev) =>
        prev.map((r) =>
          r.lark_open_id === row.lark_open_id
            ? { ...r, is_default_approver: next }
            : r,
        ),
      );
      setMessage(
        next
          ? `${row.display_name || row.email} will be pre-selected as an AP approver.`
          : `Removed ${row.display_name || row.email} from default AP approvers.`,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update default approver",
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleCsvFile(file: File) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const text = await file.text();
      const parsed = parseDirectoryCsv(text);
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.rows.length === 0) throw new Error("No data rows found.");

      let saved = 0;
      for (const row of parsed.rows) {
        if (!isLarkDirectoryEmail(row.email)) {
          throw new Error(
            `Invalid email (allowed: ${LARK_DIRECTORY_EMAIL_DOMAINS.map((d) => `@${d}`).join(", ")}): ${row.email}`,
          );
        }
        if (!isValidOpenId(row.open_id)) {
          throw new Error(`Invalid open_id for ${row.email}: ${row.open_id}`);
        }
        await upsertRow(row);
        saved++;
      }
      setMessage(`Imported ${saved} mapping(s).`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSyncFromLark() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/lark/sync-directory", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        scanned?: number;
        matched?: number;
        upserted?: number;
        skippedNoEmail?: number;
        skippedSamples?: string[];
        errors?: string[];
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Sync failed (${res.status})`);
      }
      const extra =
        data.errors && data.errors.length > 0
          ? ` First errors: ${data.errors.join("; ")}`
          : "";
      const samples =
        data.skippedSamples && data.skippedSamples.length > 0
          ? ` Skipped examples: ${data.skippedSamples.join("; ")}`
          : "";
      setMessage(
        `Synced from Lark: scanned ${data.scanned ?? 0}, matched emails ${data.matched ?? 0}, saved ${data.upserted ?? 0}` +
          (data.skippedNoEmail
            ? `, skipped ${data.skippedNoEmail} without usable email`
            : "") +
          `.${extra}${samples}`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lark-user-directory-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-stone-900">
              Sync from Lark
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              Pulls contacts from Lark and saves{" "}
              {LARK_DIRECTORY_EMAIL_DOMAINS.map((d) => `@${d}`).join(" / ")}{" "}
              email → open_id automatically.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSyncFromLark()}
            className="rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
          >
            {busy ? "Syncing…" : "Sync from Lark"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-stone-900">
          Add / update mapping
        </h2>
        <p className="mt-1 text-xs text-stone-500">
          Prefer Sync from Lark above. Manual entry is for fixes or people
          missing from the sync. If someone logs in with an FTI email but uses
          an Aeris Lark account, add both emails with the{" "}
          <span className="font-medium">same open_id</span>.
        </p>
        <form
          onSubmit={handleAdd}
          className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="text-xs font-medium text-stone-600">
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@fromthisisland.com or @aerisbeaute.com"
              className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-stone-600">
            Lark open_id
            <input
              required
              value={openId}
              onChange={(e) => setOpenId(e.target.value)}
              placeholder="ou_..."
              className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-stone-600">
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Optional"
              className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-stone-900">
              Bulk CSV import
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              Columns: email, open_id, display_name (optional)
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={downloadTemplate}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50"
            >
              Download template
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="rounded-md border border-stone-900 px-3 py-1.5 text-xs font-medium text-stone-900 hover:bg-stone-50 disabled:opacity-60"
            >
              Upload CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleCsvFile(file);
              }}
            />
          </div>
        </div>
      </section>

      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-4 py-3">
          <p className="text-sm font-semibold text-stone-900">
            Directory ({rows.length})
          </p>
          <p className="mt-0.5 text-xs text-stone-500">
            Check <span className="font-medium">Default AP</span> for people who
            should be pre-selected as approvers when submitting a PO.
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-stone-500">
            No mappings yet. Add people above or import a CSV.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-stone-100 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">open_id</th>
                  <th className="px-4 py-2 font-medium text-center">
                    Default AP
                  </th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.email}
                    className="border-b border-stone-100 last:border-0"
                  >
                    <td className="px-4 py-2">
                      <input
                        key={`${row.email}:${row.display_name}`}
                        type="text"
                        defaultValue={row.display_name}
                        disabled={busy}
                        placeholder="Add name"
                        aria-label={`Display name for ${row.email}`}
                        className="w-full min-w-[10rem] rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-stone-900 hover:border-stone-300 focus:border-stone-900 focus:bg-white focus:outline-none disabled:opacity-60"
                        onBlur={(e) => {
                          void handleRename(row.email, e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                          if (e.key === "Escape") {
                            e.currentTarget.value = row.display_name;
                            e.currentTarget.blur();
                          }
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">{row.email}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {row.lark_open_id}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={!!row.is_default_approver}
                        disabled={busy}
                        onChange={(e) =>
                          void handleToggleDefaultApprover(
                            row,
                            e.target.checked,
                          )
                        }
                        aria-label={`Default AP approver for ${row.email}`}
                        className="accent-stone-900"
                        title="Pre-select as Lark AP Form approver"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDelete(row.email)}
                        className="text-xs font-medium text-red-700 hover:text-red-900 disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
