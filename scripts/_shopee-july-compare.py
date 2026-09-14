"""Compare Shopee recognized July 2026 to Jubelio SHOPEE."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pandas as pd

OUT = Path(r"C:\Users\jessi\.cursor\projects\c-Users-jessi-Projects-fti-supply-chain")
RECON = Path(r"C:\Users\jessi\Projects\fti-supply-chain\scripts\_shopee-july-recon.py")


def load_recon_module():
    spec = importlib.util.spec_from_file_location("recon", RECON)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    m = load_recon_module()
    raw = m.load_shopee()
    rec = m.recognized(raw)
    jub = pd.read_json(OUT / "jubelio-shopee-july.json")

    shopee = (
        rec.groupby("sku", dropna=False)
        .agg(
            shopee_qty=("qty", "sum"),
            returned_qty=("returned_qty", "sum"),
            shopee_post_tax=("post_tax", "sum"),
            shopee_pre_tax=("pre_tax", "sum"),
            shopee_lines=("sku", "size"),
            shopee_orders=("order_no", "nunique"),
        )
        .reset_index()
    )

    merged = shopee.merge(jub.rename(columns={"qty": "jub_qty", "net": "jub_net"}), on="sku", how="outer")
    for col in [
        "shopee_qty",
        "returned_qty",
        "shopee_post_tax",
        "shopee_pre_tax",
        "shopee_lines",
        "shopee_orders",
        "jub_qty",
        "jub_net",
    ]:
        merged[col] = merged[col].fillna(0)

    merged["qty_gap"] = merged["shopee_qty"] - merged["jub_qty"]
    merged["net_gap"] = merged["shopee_post_tax"] - merged["jub_net"]
    merged["bucket"] = "matched"
    merged.loc[(merged["shopee_qty"] > 0) & (merged["jub_qty"] == 0), "bucket"] = "shopee_only"
    merged.loc[(merged["jub_qty"] != 0) & (merged["shopee_qty"] == 0), "bucket"] = "jubelio_only"
    merged = merged.sort_values("net_gap", key=lambda s: s.abs(), ascending=False)

    # Alt Shopee bases for headline diagnosis
    rec = rec.copy()
    rec["harga_setelah"] = rec["Harga Setelah Diskon"].map(m.parse_idr)
    rec["diskon_shopee"] = rec["Diskon Dari Shopee"].map(m.parse_idr)
    voucher_shopee = rec.groupby("order_no")["Voucher Ditanggung Shopee"].first().map(m.parse_idr)
    after_seller = rec["after_line_disc"].sum()
    pre_tax = rec["pre_tax"].sum()
    post_tax = rec["post_tax"].sum()
    harga_setelah_gross = (rec["harga_setelah"] * rec["qty"]).sum()

    no_ret = rec[rec["returned_qty"] <= 0]
    ratio = (rec["qty"] - rec["returned_qty"]).clip(lower=0) / rec["qty"].where(rec["qty"] > 0, 1)
    post_tax_net_qty = float((rec["post_tax"] * ratio).sum())

    jub_total = float(jub["net"].sum())
    jub_qty = float(jub["qty"].sum())

    top_gaps = merged.head(25)[
        [
            "sku",
            "bucket",
            "shopee_qty",
            "jub_qty",
            "qty_gap",
            "shopee_post_tax",
            "jub_net",
            "net_gap",
            "returned_qty",
        ]
    ].to_dict(orient="records")

    only_shopee = merged[merged["bucket"] == "shopee_only"].sort_values(
        "shopee_post_tax", ascending=False
    )
    only_jub = merged[merged["bucket"] == "jubelio_only"].sort_values(
        "jub_net", key=lambda s: s.abs(), ascending=False
    )

    qty_close = merged[(merged["bucket"] == "matched") & (merged["qty_gap"].abs() <= 1)]
    value_gap_on_close_qty = float(qty_close["net_gap"].sum())

    summary = {
        "shopee": {
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
            "diskon_shopee_line": float(rec["diskon_shopee"].sum()),
            "voucher_shopee_order": float(voucher_shopee.sum()),
            "after_seller_disc": float(after_seller),
            "pre_tax": float(pre_tax),
            "post_tax": float(post_tax),
            "harga_setelah_x_qty": float(harga_setelah_gross),
            "post_tax_exclude_returned_lines": float(no_ret["post_tax"].sum()),
            "post_tax_scaled_by_net_qty": post_tax_net_qty,
            "skus": int(shopee["sku"].nunique()),
        },
        "jubelio": {
            "qty": jub_qty,
            "net_post_tax": jub_total,
            "skus": int(len(jub)),
        },
        "gap": {
            "qty_shopee_minus_jubelio": float(rec["qty"].sum() - jub_qty),
            "post_tax_shopee_minus_jubelio": float(post_tax - jub_total),
            "post_tax_gap_pct_of_shopee": float((post_tax - jub_total) / post_tax * 100),
            "skus_shopee_only": int(len(only_shopee)),
            "skus_jubelio_only": int(len(only_jub)),
            "net_in_shopee_only": float(only_shopee["shopee_post_tax"].sum()),
            "net_in_jubelio_only": float(only_jub["jub_net"].sum()),
            "value_gap_where_qty_within_1": value_gap_on_close_qty,
            "qty_gap_units_abs_sum": float(merged["qty_gap"].abs().sum()),
        },
        "top_net_gaps": [
            {
                **row,
                "shopee_qty": float(row["shopee_qty"]),
                "jub_qty": float(row["jub_qty"]),
                "qty_gap": float(row["qty_gap"]),
                "shopee_post_tax": float(row["shopee_post_tax"]),
                "jub_net": float(row["jub_net"]),
                "net_gap": float(row["net_gap"]),
                "returned_qty": float(row["returned_qty"]),
            }
            for row in top_gaps
        ],
        "shopee_only_skus": only_shopee.head(20)[
            ["sku", "shopee_qty", "shopee_post_tax"]
        ].to_dict(orient="records"),
        "jubelio_only_skus": only_jub.head(20)[["sku", "jub_qty", "jub_net"]].to_dict(
            orient="records"
        ),
    }

    (OUT / "shopee-july-2026-recon-summary.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    merged.to_json(OUT / "shopee-july-2026-sku-gaps.json", orient="records")
    print(json.dumps({k: summary[k] for k in ("shopee", "jubelio", "gap")}, indent=2))
    print("top 10 gaps:")
    for row in summary["top_net_gaps"][:10]:
        print(
            f"{row['sku']}: qty {row['shopee_qty']:.0f}/{row['jub_qty']:.0f} "
            f"net gap {row['net_gap']:,.0f}"
        )


if __name__ == "__main__":
    main()
