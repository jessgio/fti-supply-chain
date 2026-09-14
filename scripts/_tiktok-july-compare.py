import json
from pathlib import Path

import pandas as pd

OUT = Path(r"C:\Users\jessi\.cursor\projects\c-Users-jessi-Projects-fti-supply-chain")
tiktok = pd.read_json(OUT / "tiktok-july-2026-by-sku.json")
jub = pd.read_json(OUT / "jubelio-tiktok-july.json")

merged = tiktok.merge(
    jub.rename(columns={"qty": "jub_qty", "net": "jub_net"}),
    on="sku",
    how="outer",
).fillna(0)

merged["qty_gap"] = merged["qty"] - merged["jub_qty"]
merged["jub_as_pre_vs_tt_pre"] = merged["jub_net"] / merged["pre_tax"].where(
    merged["pre_tax"] > 0, pd.NA
)
merged["jub_div111_vs_tt_post"] = (merged["jub_net"] / 1.11) / merged[
    "post_tax"
].where(merged["post_tax"] > 0, pd.NA)
merged["net_gap_if_jub_div111"] = merged["post_tax"] - merged["jub_net"] / 1.11

matched = merged[(merged["qty"] > 0) & (merged["jub_qty"] > 0) & (merged["pre_tax"] > 1000)]

summary = {
    "tiktok_pre_tax": float(tiktok["pre_tax"].sum()),
    "tiktok_post_tax": float(tiktok["post_tax"].sum()),
    "tiktok_qty": float(tiktok["qty"].sum()),
    "jubelio_net": float(jub["net"].sum()),
    "jubelio_qty": float(jub["qty"].sum()),
    "jubelio_div_111": float(jub["net"].sum() / 1.11),
    "ratio_jub_vs_tiktok_pre": float(jub["net"].sum() / tiktok["pre_tax"].sum()),
    "ratio_jub111_vs_tiktok_post": float(
        (jub["net"].sum() / 1.11) / tiktok["post_tax"].sum()
    ),
    "qty_gap": float(tiktok["qty"].sum() - jub["qty"].sum()),
    "skus_tiktok_only": int(((merged["qty"] > 0) & (merged["jub_qty"] == 0)).sum()),
    "skus_jubelio_only": int(((merged["jub_qty"] != 0) & (merged["qty"] == 0)).sum()),
    "median_jub_vs_pre": float(matched["jub_as_pre_vs_tt_pre"].median()),
    "median_jub111_vs_post": float(matched["jub_div111_vs_tt_post"].median()),
}

top = (
    matched.assign(abs_gap=matched["net_gap_if_jub_div111"].abs())
    .sort_values("abs_gap", ascending=False)
    .head(12)[
        [
            "sku",
            "qty",
            "jub_qty",
            "pre_tax",
            "post_tax",
            "jub_net",
            "net_gap_if_jub_div111",
            "jub_div111_vs_tt_post",
        ]
    ]
    .to_dict(orient="records")
)

out = {"summary": summary, "top_gaps_after_jub_div_111": top}
(OUT / "tiktok-july-2026-recon-summary.json").write_text(
    json.dumps(out, indent=2), encoding="utf-8"
)
print(json.dumps(summary, indent=2))
print("top gaps after Jubelio/1.11:")
for r in top[:8]:
    print(
        f"  {r['sku']}: tt_post={r['post_tax']:,.0f} "
        f"jub/1.11={r['jub_net']/1.11:,.0f} gap={r['net_gap_if_jub_div111']:,.0f} "
        f"ratio={r['jub_div111_vs_tt_post']:.3f}"
    )
