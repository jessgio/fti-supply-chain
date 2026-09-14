import json
from pathlib import Path

import pandas as pd

OUT = Path(r"C:\Users\jessi\.cursor\projects\c-Users-jessi-Projects-fti-supply-chain")
m = pd.read_json(OUT / "shopee-july-2026-sku-gaps.json")
matched = m[
    (m.bucket == "matched")
    & (m.shopee_qty > 0)
    & (m.jub_qty > 0)
    & (m.shopee_post_tax > 1000)
].copy()

matched["jub_x_111"] = matched.jub_net * 1.11
matched["shopee_div_111"] = matched.shopee_post_tax / 1.11
matched["ratio_jub_vs_shopee"] = matched.jub_net / matched.shopee_post_tax
matched["ratio_jub111_vs_shopee"] = matched.jub_x_111 / matched.shopee_post_tax
matched["ratio_jub_vs_shopee_div"] = matched.jub_net / matched.shopee_div_111

s_post = matched.shopee_post_tax.sum()
j = matched.jub_net.sum()
print("Headline:")
print(f"  Shopee post-tax: {s_post:,.0f}")
print(f"  Jubelio:         {j:,.0f}")
print(f"  Jubelio x 1.11:  {j * 1.11:,.0f}")
print(f"  Shopee / 1.11:   {s_post / 1.11:,.0f}")
print(f"  Jubelio / Shopee:          {j / s_post:.4f}  (1/1.11={1 / 1.11:.4f})")
print(f"  (Jubelio x 1.11) / Shopee: {j * 1.11 / s_post:.4f}")
print(f"  Jubelio / (Shopee/1.11):   {j / (s_post / 1.11):.4f}")
print()
print("SKU-level (Jubelio x 1.11) / Shopee post-tax:")
print(matched.ratio_jub111_vs_shopee.describe())
print("median", float(matched.ratio_jub111_vs_shopee.median()))
print()
print("SKU-level Jubelio / (Shopee/1.11):")
print(matched.ratio_jub_vs_shopee_div.describe())
print("median", float(matched.ratio_jub_vs_shopee_div.median()))
print()
matched["gap_after"] = matched.jub_x_111 - matched.shopee_post_tax
top = matched.assign(abs_gap=matched.gap_after.abs()).sort_values(
    "abs_gap", ascending=False
).head(12)
print("Top gaps after Jubelio x 1.11:")
for _, r in top.iterrows():
    print(
        f"  {r.sku}: shopee={r.shopee_post_tax:,.0f} "
        f"jub*1.11={r.jub_x_111:,.0f} gap={r.gap_after:,.0f} "
        f"ratio={r.ratio_jub111_vs_shopee:.3f}"
    )

# How much of original gap does undoing 1.11 close?
orig_gap = s_post - j
new_gap = abs(j * 1.11 - s_post)
print()
print(f"Original gap: {orig_gap:,.0f}")
print(f"Gap after Jubelio x 1.11: {j * 1.11 - s_post:,.0f} (abs {new_gap:,.0f})")
print(f"Closed: {(1 - new_gap / orig_gap) * 100:.1f}% of original gap")

out = {
    "shopee_post_tax": s_post,
    "jubelio": j,
    "jubelio_x_111": j * 1.11,
    "shopee_div_111": s_post / 1.11,
    "ratio_jub_shopee": j / s_post,
    "ratio_jub111_shopee": j * 1.11 / s_post,
    "median_jub111_shopee": float(matched.ratio_jub111_vs_shopee.median()),
    "orig_gap": orig_gap,
    "gap_after_x111": j * 1.11 - s_post,
}
(OUT / "shopee-july-vat-hypothesis.json").write_text(json.dumps(out, indent=2))
