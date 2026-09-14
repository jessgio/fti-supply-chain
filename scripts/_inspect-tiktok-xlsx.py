import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

p = Path(r"c:\Users\jessi\OneDrive\Documents\FTI TikTok\FTI TikTok Jul 2026.xlsx")
with zipfile.ZipFile(p) as z:
    text = z.read("xl/worksheets/sheet2.xml").decode("utf-8", errors="replace")

# All cell refs (column, row_attr, value)
cells = re.findall(
    r'<c r="([A-Z]+)(\d+)"[^>]*(?: t="([^"]*)")?[^>]*><v>(.*?)</v></c>',
    text,
)
print("total cells", len(cells))
row_nums = Counter(int(r) for _, r, _, _ in cells)
print("unique excel row attrs", len(row_nums))
print("row attr min/max", min(row_nums), max(row_nums))
print("top row attrs", row_nums.most_common(10))

cols = sorted({c for c, _, _, _ in cells}, key=lambda x: (len(x), x))
print("columns", len(cols), cols[:10], "...", cols[-5:])

# Group by column: ordered values
by_col: dict[str, list[str]] = defaultdict(list)
for col, _row, _t, val in cells:
    by_col[col].append(val)

lengths = {c: len(v) for c, v in by_col.items()}
print("len per col sample", {c: lengths[c] for c in cols[:8]})
print("all lens equal?", len(set(lengths.values())) == 1, set(list(lengths.values())[:5]))

# Show header + desc + first data for key cols
for c in ["A", "B", "G", "J", "M", "O"]:
    vals = by_col[c][:5]
    print(f"col {c}: {vals}")
