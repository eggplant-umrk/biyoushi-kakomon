"""二重チェック用の画像を作る（docs/data-progress.md の「二重チェック」）。

各ページの左端（問題番号・選択肢番号・正答の〇印がある列）だけを切り出し、
数ページずつ横に並べて raw/check/{回}-{k}.png に保存する。本文は含めないので、
1回目の読み取りとは別に「問題番号・選択肢の数・〇印の番号」だけを読み直せる。

あわせて、表紙（1ページ目）の上部を raw/check/{回}-cover.png に保存する（試験日の確認用）。

使い方: python scripts/data/check-strips.py 54
"""
import argparse
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument("exam")
ap.add_argument("--per", type=int, default=6, help="1枚に並べるページ数")
ap.add_argument("--strip", type=float, default=0.27, help="ページ幅に対する切り出し幅（左端から）")
args = ap.parse_args()

out = ROOT / "raw" / "check"
out.mkdir(parents=True, exist_ok=True)
doc = pymupdf.open(ROOT / "raw" / "pdf" / f"{args.exam}.pdf")

# 表紙の上部（試験名と日付）
r = doc[0].rect
cover = doc[0].get_pixmap(dpi=100, clip=pymupdf.Rect(0, 0, r.width, r.height * 0.18), colorspace=pymupdf.csGRAY)
cover.save(out / f"{args.exam}-cover.png")

strips: list[tuple[int, Image.Image]] = []
for i, page in enumerate(doc, start=1):
    if i == 1:
        continue
    r = page.rect
    clip = pymupdf.Rect(r.width * 0.08, r.height * 0.06, r.width * (0.08 + args.strip), r.height * 0.95)
    pix = page.get_pixmap(dpi=110, clip=clip)
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    strips.append((i, img))

for k in range(0, len(strips), args.per):
    group = strips[k : k + args.per]
    w = sum(s.width for _, s in group) + 12 * (len(group) - 1)
    h = max(s.height for _, s in group) + 30
    sheet = Image.new("RGB", (w, h), "white")
    d = ImageDraw.Draw(sheet)
    x = 0
    for page_no, s in group:
        d.text((x + 4, 4), f"p{page_no}", fill="blue")
        sheet.paste(s, (x, 30))
        if x:
            d.line([(x - 6, 0), (x - 6, h)], fill="blue", width=2)
        x += s.width + 12
    path = out / f"{args.exam}-{k // args.per + 1}.png"
    sheet.save(path)
    print(path.relative_to(ROOT).as_posix(), sheet.size)
