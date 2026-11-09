"""PWA アイコンを public/icons/favicon.svg から PNG で生成する（PyMuPDF を使用）。

使い方: python scripts/make-icons.py
"""
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "public" / "icons"
svg = (ICONS / "favicon.svg").read_text(encoding="utf-8")


def render(svg_text: str, size: int, out: Path) -> None:
    doc = pymupdf.open(stream=svg_text.encode("utf-8"), filetype="svg")
    page = doc[0]
    zoom = size / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=True)
    pix.save(out)
    print(f"wrote {out.relative_to(ROOT)} ({pix.width}x{pix.height})")


render(svg, 192, ICONS / "icon-192.png")
render(svg, 512, ICONS / "icon-512.png")
# apple-touch-icon / maskable は角丸なし・全面塗り（OS 側で切り抜かれるため）
full = svg.replace('rx="112"', 'rx="0"')
render(full, 180, ICONS / "apple-touch-icon.png")
# maskable は中央 80% が安全領域なので、内容を縮めて余白を確保する
maskable = full.replace(
    '<rect x="120"', '<g transform="translate(51.2 51.2) scale(0.8)"><rect x="120"'
).replace("</svg>", "</g></svg>")
render(maskable, 512, ICONS / "icon-maskable-512.png")
