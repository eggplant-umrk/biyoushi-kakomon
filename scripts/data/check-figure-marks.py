"""図の中の正答の〇印を消した跡が、切り出した図（public/images）に残っていないかを調べる（SPEC §14）。

公式PDFは正答に赤茶色の〇印が付いた版で、図の中に〇印がある問題は、切り出すときに画像処理で消している。
消し方が足りないと、薄い輪・点線・線の欠けが残り、図を見ただけで正答が分かってしまう（第54回 問50、第52回 問41・53 で起きた）。

調べ方:
  1. PDF のページを 300dpi で描き、色のついた画素（＝〇印）の場所を求める
  2. 切り出した図がページのどこに当たるかを、テンプレートマッチングで求める（切り出しの座標は記録していないため）
  3. 〇印のあった帯（輪）の明るさ・ざらつきを、そのすぐ内側・外側と比べる。差があれば「跡あり」
     - 明るさの差: 帯の平均 − まわりの平均（白地に薄い輪が残る場合）
     - 濃い画素の差: 帯の中の「まわりより濃い画素」の割合（網点の上に点線が残る場合）
  4. --fix を付けると、跡のある図を直す：帯の画素を、まわりの同じ模様（紙の白・網点）の画素で埋め直す。
     〇印と重なっていた黒い線・文字は残す（PDF のその場所が黒い画素）

結果は data-src/figure-marks.json に書く。確認用の画像（処理前後と、明るさを上げた拡大）を raw/marks/ に書き、
docs/ocr-review.html（node scripts/build-data.ts で生成）で見比べられる。raw/ はコミットしない。

使い方:
    python scripts/data/check-figure-marks.py            # 調べるだけ
    python scripts/data/check-figure-marks.py --fix      # 跡のある図を直してから、もう一度調べる
    python scripts/data/check-figure-marks.py --only 52-41 --image old.webp   # 別の画像ファイルで試す（検出の確認用）
"""
import argparse
import io
import json
import re
from pathlib import Path

import cv2
import numpy as np
import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DPI = 300
COLOR_THRESHOLD = 28  # crop-figure.py と同じ。RGB の最大と最小の差がこれより大きい画素を「色つき」とみなす
# 跡ありとみなすしきい値（第54回 問50、第52回 問41・53 の修正前の画像で検出でき、修正後は検出されない値）
BRIGHT_DIFF = 0.6  # 帯とまわりの、明るさの差（0〜255）。白い紙の上では、1階調に満たない差でも明るさを上げると輪として見える
DARK_RATIO = 0.035  # 帯の中で、まわりより明らかに濃い画素の割合（まわりの同じ割合を引いたもの）
# 〇印が網点などの模様の上にあるとき（模様をならした値で比べる）
TEX_RATIO = 0.3  # ならした明るさの差・ざらつきの差が、まわりのざらつき（局所の標準偏差）のこの割合以上なら跡あり


def affected_figures():
    """data-src/exam-*.txt から、図の中の〇印を画像処理で消した問題（!ocr に「画像処理で消した」とある問題）の図を集める"""
    out = []
    for path in sorted((ROOT / "data-src").glob("exam-*.txt")):
        exam = int(re.search(r"exam-(\d+)", path.name).group(1))
        cur = None
        for line in path.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^==\s*(\d+)\s+p(\d+)\s+ans=(\d)", line)
            if m:
                cur = {"exam": exam, "no": int(m.group(1)), "page": int(m.group(2)), "answer": int(m.group(3)), "images": [], "erased": False}
                out.append(cur)
            elif cur and line.startswith("!img "):
                cur["images"].append(line.split()[1])
            elif cur and line.startswith("!ocr ") and "画像処理で消した" in line:
                cur["erased"] = True
    figs = []
    for q in out:
        if q["erased"]:
            for img in q["images"]:
                figs.append({"id": Path(img).stem, "exam": q["exam"], "no": q["no"], "page": q["page"], "answer": q["answer"], "image": f"public/images/{img}"})
    return figs


_pages = {}


def render_page(exam, page):
    key = (exam, page)
    if key not in _pages:
        doc = pymupdf.open(ROOT / "raw" / "pdf" / f"{exam}.pdf")
        pix = doc[page - 1].get_pixmap(dpi=DPI)
        rgb = np.asarray(Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB"))
        _pages[key] = rgb
    return _pages[key]


def locate(page_gray, img_gray):
    """切り出した図が、ページ（300dpi）のどこに、何倍で当たるかを求める。(倍率, x, y, 一致度) を返す"""
    h, w = img_gray.shape
    scales = [1.0] if w < 900 else [round(s, 3) for s in np.arange(0.40, 1.001, 0.01)]
    best = (-1, 1.0, 0, 0)
    f = 0.25
    templ = cv2.resize(img_gray, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    for s in scales:
        pg = cv2.resize(page_gray, None, fx=s * f, fy=s * f, interpolation=cv2.INTER_AREA)
        if pg.shape[0] < templ.shape[0] or pg.shape[1] < templ.shape[1]:
            continue
        res = cv2.matchTemplate(pg, templ, cv2.TM_CCOEFF_NORMED)
        _, v, _, loc = cv2.minMaxLoc(res)
        if v > best[0]:
            best = (v, s, loc[0] / f, loc[1] / f)
    # 倍率と位置を細かく合わせる
    _, s0, x0, y0 = best
    fine = best
    for s in ([s0] if len(scales) == 1 else [round(v, 4) for v in np.arange(s0 - 0.012, s0 + 0.0121, 0.002)]):
        pg = cv2.resize(page_gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        px, py = int(x0 * s / s0), int(y0 * s / s0)
        m = 40
        xa, ya = max(0, px - m), max(0, py - m)
        xb, yb = min(pg.shape[1], px + w + m), min(pg.shape[0], py + h + m)
        win = pg[ya:yb, xa:xb]
        if win.shape[0] < h or win.shape[1] < w:
            continue
        res = cv2.matchTemplate(win, img_gray, cv2.TM_CCOEFF_NORMED)
        _, v, _, loc = cv2.minMaxLoc(res)
        if v > fine[0]:
            fine = (v, s, xa + loc[0], ya + loc[1])
    v, s, x, y = fine
    return s, int(round(x)), int(round(y)), float(v)


def analyse(fig, image_path=None):
    path = Path(image_path) if image_path else ROOT / fig["image"]
    img = np.asarray(Image.open(path).convert("RGB"))
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape
    page = render_page(fig["exam"], fig["page"])
    page_gray = cv2.cvtColor(page, cv2.COLOR_RGB2GRAY)
    s, x, y, score = locate(page_gray, gray)
    # ページの、図に当たる範囲（図と同じ大きさに縮める）
    cw, ch = int(round(w / s)), int(round(h / s))
    x0, y0 = int(round(x / s)), int(round(y / s))
    crop = page[y0 : y0 + ch, x0 : x0 + cw]
    crop = cv2.resize(crop, (w, h), interpolation=cv2.INTER_AREA)
    c = crop.astype(int)
    # 〇印は赤茶色。スキャンの色のにじみ（網点や線のふちに出る、青や緑寄りの色）と区別するため、赤が強い画素だけを〇印とみなす
    color = ((c.max(axis=2) - c.min(axis=2)) > COLOR_THRESHOLD) & (c[:, :, 0] - c[:, :, 2] > 30) & (c[:, :, 0] - c[:, :, 1] > 12)
    crop_gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    k3 = np.ones((3, 3), np.uint8)
    mark = cv2.dilate(color.astype(np.uint8), k3, iterations=1)
    # 小さな色の点（スキャンのごみ）を除く
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mark, 8)
    keep = np.zeros_like(mark)
    if n > 1:
        # 〇印は1つ。いちばん大きい色のかたまりと、その外枠に重なるかたまり（途切れた輪の残り）だけを〇印とみなす。
        # 離れた所の小さな色（線のふちの色のにじみなど）は入れない
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        bx, by, bw, bh = (int(stats[big, k]) for k in (cv2.CC_STAT_LEFT, cv2.CC_STAT_TOP, cv2.CC_STAT_WIDTH, cv2.CC_STAT_HEIGHT))
        for i in range(1, n):
            x_, y_, w_, h_, area = (int(v) for v in stats[i])
            overlap = x_ < bx + bw + 8 and x_ + w_ > bx - 8 and y_ < by + bh + 8 and y_ + h_ > by - 8
            if area >= 60 and (i == big or overlap):
                keep[labels == i] = 1
    mark = keep
    res = {"id": fig["id"], "exam": fig["exam"], "no": fig["no"], "image": fig["image"], "match": round(score, 3), "scale": round(s, 4), "markPixels": int(mark.sum())}
    ctx = {"img": img, "gray": gray, "crop": crop, "crop_gray": crop_gray, "mark": mark}
    if mark.sum() == 0 or score < 0.6:
        if score >= 0.6:
            # この図には〇印がない（同じ問題の別の図に〇印がある）
            res.update({"status": "nomark"})
        else:
            res.update({"status": "unknown", "reason": "ページの中で図の位置を特定できなかった"})
        return res, ctx
    band = cv2.dilate(mark, k3, iterations=1).astype(bool)
    near = cv2.dilate(mark, k3, iterations=9).astype(bool) & ~cv2.dilate(mark, k3, iterations=4).astype(bool)
    # 黒い線・文字・網点の粒（PDF で濃い画素とそのふち）は比べない。紙の白や、網点のすき間どうしを比べる
    stroke = cv2.dilate((crop_gray < 140).astype(np.uint8), k3, iterations=2).astype(bool)
    g = gray.astype(float)
    b = g[band & ~stroke]
    nb = g[near & ~stroke]
    ys, xs = np.nonzero(mark)
    box = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    if float(np.median(crop_gray[near])) <= 200:
        # 〇印が網点などの模様の上にある（白い地がほとんどない）。模様をならした明るさと、ざらつき（局所の標準偏差）を、
        # 帯とまわりで比べる。まわりごと黒い所（太い線）は比べない
        solid = cv2.dilate((cv2.blur(crop_gray, (7, 7)) < 80).astype(np.uint8), k3, iterations=3).astype(bool)
        m = cv2.blur(g, (7, 7))
        sd = np.sqrt(np.maximum(cv2.blur(g * g, (7, 7)) - m * m, 0))
        tb, tn = band & ~solid, near & ~solid
        if tb.sum() < 30 or tn.sum() < 30:
            res.update({"status": "unknown", "reason": "比べる画素が足りない"})
            return res, ctx
        bright = float(m[tb].mean() - m[tn].mean())
        rough = float(sd[tb].mean() - sd[tn].mean())
        # 模様の濃淡の幅（まわりのざらつき）に対する割合で判定する。模様の上では、数階調の差は見えない
        amp = float(sd[tn].mean())
        residue = abs(bright) >= TEX_RATIO * amp or abs(rough) >= TEX_RATIO * amp
        res.update({"status": "residue" if residue else "clean", "mode": "texture", "brightDiff": round(bright, 2), "roughDiff": round(rough, 2), "markBox": box})
        ctx.update({"band": band, "near": near, "stroke": solid})
        return res, ctx
    bright = float(np.median(b) - np.median(nb)) if abs(float(b.mean() - nb.mean())) < 0.5 else float(b.mean() - nb.mean())
    # まわりの「濃い側の端」（下位2%）より濃い画素の割合
    lo = np.percentile(nb, 2) - 6
    dark = float((b < lo).mean() - (nb < lo).mean())
    residue = abs(bright) >= BRIGHT_DIFF or dark >= DARK_RATIO
    res.update({"status": "residue" if residue else "clean", "mode": "plain", "brightDiff": round(bright, 2), "darkRatio": round(dark, 4), "markBox": box})
    ctx.update({"band": band, "near": near, "stroke": stroke})
    return res, ctx


def fix(ctx):
    """〇印のまわりを、PDF の元の図から作り直す。直した画像（RGB）を返す。

    以前の処理（色のついた画素をまわりの平均で埋める、範囲を白くする）の跡ごと捨てて、PDF の図に戻し、
    〇印の画素だけを埋め直す：
      - 〇印の画素を紙の色にする
      - 〇印と交わっていた黒い線は、つなぎ直す
    〇印が網点などの模様の上にあるときは、自動では直さない（None を返す。手作業で直す）。
    作り直すのは〇印のまわりだけで、境目はぼかしてなじませる。ほかの部分は元の画像のまま。
    """
    img = ctx["img"]
    gray = ctx["gray"]
    crop_gray = ctx["crop_gray"]
    mark = ctx["mark"]
    h, w = gray.shape
    k3 = np.ones((3, 3), np.uint8)
    hole = cv2.dilate(mark, k3, iterations=2)
    near = cv2.dilate(mark, k3, iterations=10).astype(bool) & ~hole.astype(bool)
    # 〇印のまわりが白い紙のときだけ直す。網点などの模様の上にある〇印は、自動ではうまく埋められない
    # （塗り伸ばすとぼけた帯になり、離れた所の模様を写すと継ぎ目が出る）ので、手作業で直す
    if float(np.median(crop_gray[near])) <= 200:
        return None
    if True:
        # 〇印の画素を紙の色にする。まわりから塗り伸ばす方法（inpaint）は、すぐ内側の文字の黒がにじみ出るので使わない
        light = crop_gray[near & (crop_gray > 200)]
        paper = int(np.median(light)) if len(light) else 255
        recon = crop_gray.copy()
        # 〇印のふちの、色の薄いにじみ（赤みが少し残る画素）も〇印に含める
        c = ctx["crop"].astype(int)
        fringe = (cv2.dilate(mark, k3, iterations=3) > 0) & (c[:, :, 0] - c[:, :, 2] > 10) & (c[:, :, 0] - c[:, :, 1] > 4)
        hole = ((hole > 0) | fringe).astype(np.uint8)
        # 〇印の内側にも、色のにじみで地が少し暗くなった所がある。〇印で囲まれた範囲の明るい画素（文字・線でない所）も埋め直す
        hull = np.zeros_like(mark)
        pts_ = cv2.findNonZero(mark)
        cv2.fillConvexPoly(hull, cv2.convexHull(pts_), 1)
        hull = cv2.dilate(hull, k3, iterations=6)
        refill = (hole > 0) | ((hull > 0) & (crop_gray >= 200))
        # 紙の色は一様ではない（スキャンのむら・ざらつきがある）。一色で塗ると、明るさを上げたときに平らな面として見えるので、
        # まわりの紙の画素の値を無作為に並べて埋める
        far = (cv2.dilate(hull, k3, iterations=14) > 0) & (cv2.dilate(hull, k3, iterations=3) == 0) & (np.abs(crop_gray.astype(int) - paper) <= 3)
        pool = crop_gray[far]
        if len(pool) < 50:
            pool = np.array([paper], dtype=np.uint8)
        rng = np.random.default_rng(12345)
        # 〇印のすぐ内側の文字（かっこ など）を削らない：色みのない黒い画素と、そのふちの灰色の画素は元のまま残す
        chroma = c.max(axis=2) - c.min(axis=2)
        ink = (crop_gray < 140) & (chroma < 25)
        edge = (cv2.dilate(ink.astype(np.uint8), k3, iterations=1) > 0) & (chroma < 15) & (crop_gray < 235)
        refill &= ~(ink | edge)
        recon[refill] = rng.choice(pool, size=int(refill.sum()))
        # 〇印と交わっていた黒い線は、つなぎ直す：〇印の下が黒く（赤と黒が重なった画素）、
        # しかも〇印の両側に同じ向きの黒い線がある所だけを線とみなす（インクのかすれ・濃い点は線にしない）
        dark = ((crop_gray < 110) & (hole == 0)).astype(np.uint8)
        bridge = np.zeros_like(dark)
        n_ = 17
        kernels = [np.ones((1, n_), np.uint8), np.ones((n_, 1), np.uint8), np.eye(n_, dtype=np.uint8), np.fliplr(np.eye(n_, dtype=np.uint8))]
        for k in kernels:
            bridge |= cv2.morphologyEx(dark, cv2.MORPH_CLOSE, k)
        # 〇印のふち（赤が濃い所）を線と取り違えないよう、はっきり黒い画素だけにする
        bridge = (bridge > 0) & (hole > 0) & (crop_gray < 70)
        # 〇印に先が重なっていた線・矢印（〇印の外の黒い線から、はっきり黒い画素が続いている所）も残す
        black = (hole > 0) & (crop_gray < 75)
        grow = (cv2.dilate(dark, k3, iterations=1) > 0) & black
        for _ in range(6):
            grow = (cv2.dilate(grow.astype(np.uint8), k3, iterations=1) > 0) & black
        keep_dark = bridge | grow
        recon[keep_dark] = crop_gray[keep_dark]
    # 作り直す範囲：〇印の外枠を広げた四角（以前の処理で白くした範囲も含める）。境目はぼかす
    ys, xs = np.nonzero(mark)
    m = 45
    x0, y0, x1, y1 = max(0, xs.min() - m), max(0, ys.min() - m), min(w, xs.max() + 1 + m), min(h, ys.max() + 1 + m)
    alpha = np.zeros((h, w), np.float32)
    alpha[y0:y1, x0:x1] = 1.0
    alpha = cv2.GaussianBlur(alpha, (0, 0), 5)
    alpha[cv2.dilate(hull, k3, iterations=4) > 0] = 1.0
    # PDF から作った図と、いまの図の、紙の明るさのわずかな差を合わせる
    ring = (alpha > 0.02) & (alpha < 0.98)
    if ring.sum() > 50:
        shift = float(np.median(gray[ring].astype(float) - recon[ring].astype(float)))
        recon = np.clip(recon.astype(float) + shift, 0, 255)
    out = img.astype(np.float32) * (1 - alpha[..., None]) + np.repeat(recon.astype(np.float32)[..., None], 3, axis=2) * alpha[..., None]
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def write_review_images(fig, ctx, res, tag):
    """確認用の画像を raw/marks/ に書く：PDF の元の図（〇印あり）、処理後の図、それぞれの〇印のあたりを拡大して明るさを上げたもの"""
    d = ROOT / "raw" / "marks"
    d.mkdir(parents=True, exist_ok=True)
    Image.fromarray(ctx["crop"]).save(d / f"{fig['id']}-original.png")
    Image.fromarray(ctx["img"]).save(d / f"{fig['id']}-{tag}.png")
    if "markBox" not in res:
        return
    x0, y0, x1, y1 = res["markBox"]
    m = 30
    h, w = ctx["gray"].shape
    x0, y0, x1, y1 = max(0, x0 - m), max(0, y0 - m), min(w, x1 + m), min(h, y1 + m)
    zoom = max(1, min(4, 480 // max(1, (x1 - x0))))
    g = cv2.cvtColor(ctx["img"], cv2.COLOR_RGB2GRAY).astype(float)[y0:y1, x0:x1]
    # 明るい側を強調（白地の薄い輪）と、全体のコントラストを上げたもの（網点の上の点線）
    hi = np.clip((g - 232) * 11, 0, 255).astype(np.uint8)
    lo_, hi_ = np.percentile(g, 1), np.percentile(g, 99)
    con = np.clip((g - lo_) / max(1.0, hi_ - lo_) * 255, 0, 255).astype(np.uint8)
    for name, a in (("bright", hi), ("contrast", con)):
        im = Image.fromarray(a).resize(((x1 - x0) * zoom, (y1 - y0) * zoom), Image.NEAREST)
        im.save(d / f"{fig['id']}-{tag}-{name}.png")
    orig = Image.fromarray(ctx["crop"][y0:y1, x0:x1]).resize(((x1 - x0) * zoom, (y1 - y0) * zoom), Image.NEAREST)
    orig.save(d / f"{fig['id']}-original-zoom.png")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true", help="跡のある図を直す")
    ap.add_argument("--only", help="この図だけ調べる（例: 52-41）")
    ap.add_argument("--image", help="--only と一緒に使う。public/images の代わりにこの画像を調べる（結果は保存しない）")
    args = ap.parse_args()
    figs = [f for f in affected_figures() if not args.only or f["id"] == args.only]
    results = []
    for fig in figs:
        res, ctx = analyse(fig, args.image)
        if args.image:
            print(json.dumps(res, ensure_ascii=False))
            continue
        res["fixed"] = False
        write_review_images(fig, ctx, res, "before")
        if args.fix and res["status"] == "residue":
            before = {k: res[k] for k in ("brightDiff", "darkRatio", "roughDiff") if k in res}
            out = fix(ctx)
            if out is None:
                res["note"] = "〇印が模様の上にあるので、自動では直さない（手作業で直す）"
            else:
                Image.fromarray(out).save(ROOT / fig["image"], "WEBP", quality=92, method=6)
                res, ctx = analyse(fig)
                res["fixed"] = True
                res["before"] = before
        write_review_images(fig, ctx, res, "after")
        results.append(res)
        print(f"{res['id']}: {res['status']}" + (f"（明るさの差 {res['brightDiff']}、{'ざらつきの差 ' + str(res['roughDiff']) if res.get('mode') == 'texture' else '濃い画素 ' + str(res['darkRatio'])}）" if "brightDiff" in res else f"（{res.get('reason', 'この図に〇印はない')}）") + ("　→ 直した" if res.get("fixed") else ""))
    if not args.image and not args.only:
        (ROOT / "data-src" / "figure-marks.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        n = sum(1 for r in results if r["status"] == "residue")
        print(f"図 {len(results)}枚：跡あり {n}、跡なし {sum(1 for r in results if r['status'] == 'clean')}、〇印のない図 {sum(1 for r in results if r['status'] == 'nomark')}、判定できず {sum(1 for r in results if r['status'] == 'unknown')}")
        # 跡が残っている・判定できない図があれば、終了コード 1（直したあとの確認に使う）
        if any(r["status"] in ("residue", "unknown") for r in results):
            raise SystemExit(1)


if __name__ == "__main__":
    main()
