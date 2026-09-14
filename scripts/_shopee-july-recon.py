"""One-off: Shopee July 2026 recognized sales vs Jubelio SHOPEE."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

SHOPEE_DIR = Path(r"c:\Users\jessi\OneDrive\Documents\FTI Shopee")
OUT_DIR = Path(r"C:\Users\jessi\.cursor\projects\c-Users-jessi-Projects-fti-supply-chain")
VAT = 1.11
EXCLUDE_STATUS = {"batal", "belum bayar", "pembatalan diajukan"}


def parse_idr(value: object) -> float:
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
        # Indonesian thousand-dots: 149.000 / 97.800
        parts = raw.split(".")
        if len(parts) > 1 and all(p.isdigit() for p in parts):
            raw = "".join(parts)
    try:
        return float(raw)
    except ValueError:
        return 0.0


def parse_qty(value: object) -> float:
    raw = str("" if value is None else value).strip().replace(".", "").replace(",", ".")
    try:
        return float(raw) if raw else 0.0
    except ValueError:
        return 0.0


def load_shopee() -> pd.DataFrame:
    files = sorted(SHOPEE_DIR.glob("Order.all.20260701_20260731_part_*_of_3.xlsx"))
    frames = [pd.read_excel(path, dtype=str) for path in files]
    df = pd.concat(frames, ignore_index=True)
    df.columns = [str(c).strip() for c in df.columns]
    df["order_no"] = df["No. Pesanan"].astype(str).str.strip()
    df["status"] = df["Status Pesanan"].astype(str).str.strip()
    df["sku"] = df["Nomor Referensi SKU"].astype(str).str.strip()
    df["qty"] = df["Jumlah"].map(parse_qty)
    df["harga_awal"] = df["Harga Awal"].map(parse_idr)
    df["diskon_penjual"] = df["Diskon Dari Penjual"].map(parse_idr)
    df["voucher_penjual"] = df["Voucher Ditanggung Penjual"].map(parse_idr)
    df["returned_qty"] = df.get("Returned quantity", pd.Series("0", index=df.index)).map(parse_qty)
    df["gross"] = df["harga_awal"] * df["qty"]
    df["after_line_disc"] = df["gross"] - df["diskon_penjual"]
    return df


def recognized(df: pd.DataFrame) -> pd.DataFrame:
    keep = ~df["status"].str.casefold().isin(EXCLUDE_STATUS)
    out = df.loc[keep].copy()
    voucher = out.groupby("order_no", sort=False)["voucher_penjual"].first()
    line_tot = out.groupby("order_no", sort=False)["after_line_disc"].transform("sum")
    line_n = out.groupby("order_no", sort=False)["after_line_disc"].transform("size")
    order_voucher = out["order_no"].map(voucher)
    share = pd.Series(0.0, index=out.index)
    positive = line_tot > 0
    share.loc[positive] = out.loc[positive, "after_line_disc"] / line_tot.loc[positive]
    share.loc[~positive] = 1.0 / line_n.loc[~positive]
    out["alloc_voucher"] = share * order_voucher
    out["pre_tax"] = out["after_line_disc"] - out["alloc_voucher"]
    out["post_tax"] = out["pre_tax"] / VAT
    return out


def main() -> None:
    raw = load_shopee()
    rec = recognized(raw)
    by_sku = (
        rec.groupby("sku", dropna=False)
        .agg(
            qty=("qty", "sum"),
            returned_qty=("returned_qty", "sum"),
            orders=("order_no", "nunique"),
            lines=("sku", "size"),
            gross=("gross", "sum"),
            diskon_penjual=("diskon_penjual", "sum"),
            alloc_voucher=("alloc_voucher", "sum"),
            pre_tax=("pre_tax", "sum"),
            post_tax=("post_tax", "sum"),
        )
        .reset_index()
        .sort_values("post_tax", ascending=False)
    )
    summary = {
        "raw_lines": int(len(raw)),
        "raw_orders": int(raw["order_no"].nunique()),
        "status_counts": raw["status"].value_counts().to_dict(),
        "recognized_lines": int(len(rec)),
        "recognized_orders": int(rec["order_no"].nunique()),
        "qty": float(rec["qty"].sum()),
        "returned_qty": float(rec["returned_qty"].sum()),
        "gross": float(rec["gross"].sum()),
        "diskon_penjual": float(rec["diskon_penjual"].sum()),
        "voucher_penjual": float(rec.groupby("order_no")["voucher_penjual"].first().sum()),
        "pre_tax": float(rec["pre_tax"].sum()),
        "post_tax": float(rec["post_tax"].sum()),
        "skus": int(by_sku["sku"].nunique()),
    }
    out_json = OUT_DIR / "shopee-july-2026-recognized.json"
    by_sku.to_json(OUT_DIR / "shopee-july-2026-by-sku.json", orient="records")
    out_json.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print("wrote", out_json)


if __name__ == "__main__":
    main()
