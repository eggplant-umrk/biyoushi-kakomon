"""読み取り用に、各ページの余白を除いた画像を raw/crops/{回}-{nnn}.png に作る。

- 余白は固定の割合で除き、PDF から直接レンダリングする。白紙判定だけ低解像度（50dpi）で行う。
- ほぼ白紙のページ（扉・裏表紙など）はスキップする。
- 横幅が WIDTH px になるように拡大縮小する（本文の文字が読める大きさ）。

使い方: python scripts/data/crop-pages.py 54 [--width 1200]
"""
import argparse
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]

ap = argparse.ArgumentParser()
ap.add_argument("exam")
ap.add_argument("--width", type=int, default=1200)
args = ap.parse_args()

out = ROOT / "raw" / "crops"
out.mkdir(parents=True, exist_ok=True)
doc = pymupdf.open(ROOT / "raw" / "pdf" / f"{args.exam}.pdf")

for i, page in enumerate(doc, start=1):
    name = f"{args.exam}-{i:03d}.png"
    dpi = 50
    pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
    w, h, s = pix.width, pix.height, pix.samples
    mx, my = int(w * 0.03), int(h * 0.02)
    xs, ys, dark = [], [], 0
    for y in range(my, h - my):
        row = s[y * w + mx : y * w + w - mx]
        cnt = sum(1 for v in row if v < 140)
        if cnt > 1:
            ys.append(y)
            dark += cnt
    for x in range(mx, w - mx):
        col = s[x + my * w : x + (h - my) * w : w]
        if sum(1 for v in col if v < 140) > 1:
            xs.append(x)
    ratio = dark / (w * h)
    if ratio < 0.0009 or not xs or not ys:
        print(f"{name}: skip (ink {ratio:.4f})")
        continue
    # 余白は固定で除く（文字が薄いページで本文を欠かさないよう、自動判定は使わない）
    r = page.rect
    clip = pymupdf.Rect(r.width * 0.08, r.height * 0.015, r.width * 0.92, r.height * 0.975)
    zoom = args.width / clip.width
    p2 = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip, colorspace=pymupdf.csGRAY)
    p2.save(out / name)
    print(f"{name}: {p2.width}x{p2.height} (ink {ratio:.4f})")
