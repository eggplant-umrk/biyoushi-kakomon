"""問題の図を切り出して public/images/{回}/{回}-{番号2桁}[-n].webp に保存する（SPEC §6.1 手順4）。

正答の〇印（赤茶色）は自動で消す。座標は読み取り用画像（raw/crops/{回}-{nnn}.png、crop-pages.py で作成）上のピクセルで指定する。
PDF から 300dpi 相当で切り出し、横幅を最大 900px にして WebP（品質 85）で保存する。

使い方:
    python scripts/data/crop-figure.py 54 22 455 600 785 915 --name 54-47
    （第54回の22ページ目の読み取り用画像の (455,600)-(785,915) を 54-47.webp に保存）
"""
import argparse
import io
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def erase_answer_mark(img: Image.Image, threshold: int) -> int:
    """色のついた画素（と、そのすぐ外側の縁）を、周りの色つきでない画素の平均で埋める。埋めた画素数を返す。"""
    w, h = img.size
    px = img.load()
    mask = set()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if max(r, g, b) - min(r, g, b) > threshold:
                if max(r, g, b) < 85:
                    # 〇印と黒い線が重なった画素は、線として灰色に戻す（線が途切れないように）
                    v = max(r, g, b) // 2
                    px[x, y] = (v, v, v)
                else:
                    mask.add((x, y))
    # にじんだ縁も消すため 1px 広げる（暗い画素＝線は広げた範囲に含めない）
    grown = set(mask)
    for x, y in mask:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                q = (x + dx, y + dy)
                if 0 <= q[0] < w and 0 <= q[1] < h and sum(px[q]) / 3 > 110:
                    grown.add(q)
    todo = grown
    filled = len(todo)
    while todo:
        done = {}
        for x, y in todo:
            acc = [0, 0, 0]
            n = 0
            for dx in (-2, -1, 0, 1, 2):
                for dy in (-2, -1, 0, 1, 2):
                    q = (x + dx, y + dy)
                    if q in todo or not (0 <= q[0] < w and 0 <= q[1] < h):
                        continue
                    c = px[q]
                    acc[0] += c[0]
                    acc[1] += c[1]
                    acc[2] += c[2]
                    n += 1
            if n:
                v = sum(acc) // (3 * n)  # 原本はモノクロなので灰色で埋める
                done[(x, y)] = (v, v, v)
        if not done:
            break
        for q, c in done.items():
            px[q] = c
        todo = todo - done.keys()
    return filled

# crop-pages.py と同じ切り出し範囲・横幅
CROP_X0, CROP_Y0, CROP_X1 = 0.08, 0.015, 0.92
CROP_WIDTH = 1200
MAX_W = 900

ap = argparse.ArgumentParser()
ap.add_argument("exam", type=int)
ap.add_argument("page", type=int, help="ページ番号（1始まり。raw/crops のファイル名の nnn）")
ap.add_argument("x0", type=float)
ap.add_argument("y0", type=float)
ap.add_argument("x1", type=float)
ap.add_argument("y1", type=float)
ap.add_argument("--name", required=True, help="保存名（拡張子なし）。例: 54-47 / 54-47-2")
ap.add_argument(
    "--erase",
    action="append",
    default=[],
    metavar="X0,Y0,X1,Y1",
    help="図の中に描かれた正答の〇印を消す範囲（読み取り用画像の座標）。範囲内の灰色〜白の画素を白にし、黒い文字・線は残す",
)
ap.add_argument("--keep-color", action="store_true", help="色のついた画素（正答の〇印）を消さない")
ap.add_argument("--color-threshold", type=int, default=28, help="RGB の最大と最小の差がこれより大きい画素を「色つき」とみなす")
ap.add_argument("--keep-below", type=int, default=90, help="--erase で残す濃さ（これより暗い画素は残す）")
args = ap.parse_args()

doc = pymupdf.open(ROOT / "raw" / "pdf" / f"{args.exam}.pdf")
page = doc[args.page - 1]
r = page.rect
ox, oy = r.width * CROP_X0, r.height * CROP_Y0
k = (r.width * (CROP_X1 - CROP_X0)) / CROP_WIDTH  # 読み取り用画像 1px あたりの PDF 座標
clip = pymupdf.Rect(ox + args.x0 * k, oy + args.y0 * k, ox + args.x1 * k, oy + args.y1 * k) & r
pix = page.get_pixmap(dpi=300, clip=clip)
img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
scale = pix.width / clip.width  # PDF 座標 → 出力画素
# 原本の問題用紙はモノクロで、正答の〇印だけが赤茶色で描かれている。
# 図の中に〇印がかかっていると答えが見えてしまうので、色のついた画素を白にする
if not args.keep_color:
    erase_answer_mark(img, args.color_threshold)
for spec in args.erase:
    ex0, ey0, ex1, ey1 = (float(v) for v in spec.split(","))
    bx0 = round((ex0 - args.x0) * k * scale)
    by0 = round((ey0 - args.y0) * k * scale)
    bx1 = round((ex1 - args.x0) * k * scale)
    by1 = round((ey1 - args.y0) * k * scale)
    px = img.load()
    for yy in range(max(0, by0), min(img.height, by1)):
        for xx in range(max(0, bx0), min(img.width, bx1)):
            r_, g_, b_ = px[xx, yy]
            if (r_ + g_ + b_) / 3 >= args.keep_below:
                px[xx, yy] = (255, 255, 255)
if img.width > MAX_W:
    img = img.resize((MAX_W, round(img.height * MAX_W / img.width)), Image.LANCZOS)
out = ROOT / "public" / "images" / str(args.exam) / f"{args.name}.webp"
out.parent.mkdir(parents=True, exist_ok=True)
img.save(out, "WEBP", quality=85, method=6)
print(f"{out.relative_to(ROOT).as_posix()} {img.width}x{img.height} {out.stat().st_size // 1024}KB")
