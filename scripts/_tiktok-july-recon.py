"""Recognize TikTok July sales and compare to Jubelio Shop|Tokopedia + TOKOPEDIA."""

from __future__ import annotations

import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path

import pandas as pd

TIKTOK_PATH = Path(r"c:\Users\jessi\OneDrive\Documents\FTI TikTok\FTI TikTok Jul 2026.xlsx")
OUT = Path(r"C:\Users\jessi\.cursor\projects\c-Users-jessi-Projects-fti-supply-chain")
VAT = 1.11

# Exclude cancelled / unpaid-style statuses (align with Shopee recon intent).
EXCLUDE_STATUS = {
    "batal",
    "dibatalkan",
    "cancelled",
    "canceled",
    "belum bayar",
    "unpaid",
    "pembatalan diajukan",
}


def col_to_idx(col: str) -> int:
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def load_tiktok_sheet(path: Path) -> pd.DataFrame:
    with zipfile.ZipFile(path) as z:
        # Sheet relationship points at sheet2.xml
        text = z.read("xl/worksheets/sheet2.xml").decode("utf-8", errors="replace")

    cells = re.findall(
        r'<c r="([A-Z]+)(\d+)"[^>]*(?: t="([^"]*)")?[^>]*><v>(.*?)</v></c>',
        text,
    )
    by_row: dict[int, dict[str, str]] = defaultdict(dict)
    for col, row_s, _t, val in cells:
        by_row[int(row_s)][col] = val

    header_row = by_row[1]
    # Stable column order by Excel letter
    cols = sorted(header_row.keys(), key=col_to_idx)
    headers = [header_row[c] for c in cols]

    records = []
    for row_num in sorted(by_row):
        if row_num <= 2:  # 1=header, 2=description
            continue
        rec = {header_row.get(c, c): by_row[row_num].get(c, "") for c in cols}
        records.append(rec)
    return pd.DataFrame(records)


def parse_num(value: object) -> float:
    raw = str("" if value is None else value).strip()
    if not raw or raw in {"-", "nan", "None"}:
        return 0.0
    raw = raw.replace("\u00a0", "").replace(" ", "").replace("Rp", "").replace("rp", "")
    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", "")
    elif "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    else:
        # Plain integers like 299000 — keep as-is. Thousand-dot only if looks ID-style.
        parts = raw.split(".")
        if len(parts) == 2 and len(parts[1]) == 3 and all(p.isdigit() for p in parts):
            # Ambiguous: 299.000 could be 299000. TikTok samples are unpunctuated.
            pass
        if len(parts) > 1 and all(p.isdigit() for p in parts) and all(
            len(p) == 3 for p in parts[1:]
        ):
            raw = "".join(parts)
    try:
        return float(raw)
    except ValueError:
        return 0.0


def main() -> None:
    df = load_tiktok_sheet(TIKTOK_PATH)
    print("rows", len(df), "cols", len(df.columns))
    print("columns:", list(df.columns))
    status_col = "Order Status"
    sku_col = "Seller SKU"
    subtotal_col = "SKU Subtotal Before Discount"
    seller_disc_col = "SKU Seller Discount"

    print("status counts:\n", df[status_col].value_counts(dropna=False).head(20))
    print(
        "sample money",
        df[[sku_col, subtotal_col, seller_disc_col]].head(5).to_dict("records"),
    )

    work = df.copy()
    work["sku"] = work[sku_col].astype(str).str.strip()
    work["status"] = work[status_col].astype(str).str.strip()
    work["subtotal"] = work[subtotal_col].map(parse_num)
    work["seller_disc"] = work[seller_disc_col].map(parse_num)
    work["qty"] = work.get("Quantity", pd.Series("0", index=work.index)).map(parse_num)
    work["pre_tax"] = work["subtotal"] - work["seller_disc"]
    work["post_tax"] = work["pre_tax"] / VAT

    keep = ~work["status"].str.casefold().isin(EXCLUDE_STATUS)
    # Also drop empty status if any
    rec = work.loc[keep].copy()

    by_sku = (
        rec.groupby("sku", dropna=False)
        .agg(
            qty=("qty", "sum"),
            lines=("sku", "size"),
            subtotal=("subtotal", "sum"),
            seller_disc=("seller_disc", "sum"),
            pre_tax=("pre_tax", "sum"),
            post_tax=("post_tax", "sum"),
        )
        .reset_index()
        .sort_values("post_tax", ascending=False)
    )

    summary = {
        "raw_lines": int(len(work)),
        "status_counts": work["status"].value_counts().to_dict(),
        "recognized_lines": int(len(rec)),
        "qty": float(rec["qty"].sum()),
        "subtotal": float(rec["subtotal"].sum()),
        "seller_disc": float(rec["seller_disc"].sum()),
        "pre_tax": float(rec["pre_tax"].sum()),
        "post_tax": float(rec["post_tax"].sum()),
        "skus": int(by_sku["sku"].nunique()),
    }
    (OUT / "tiktok-july-2026-recognized.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    by_sku.to_json(OUT / "tiktok-july-2026-by-sku.json", orient="records")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
