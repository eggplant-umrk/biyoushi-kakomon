"""過去問 PDF をページ画像（PNG）にする（SPEC §6.1 手順2）。pdftoppm -r 200 -png の代わり。

Windows でも追加のバイナリなしで動くよう、PyMuPDF（pip install pymupdf）を使う。

使い方:
    python scripts/pdf-to-png.py                # raw/pdf/*.pdf → raw/pages/{PDF名}-{ページ番号3桁}.png
    python scripts/pdf-to-png.py --dpi 300 raw/pdf/54.pdf
"""
import argparse
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent


def convert(pdf: Path, out_dir: Path, dpi: int) -> int:
    out_dir.mkdir(parents=True, exist_ok=True)
    with pymupdf.open(pdf) as doc:
        for i, page in enumerate(doc, start=1):
            pix = page.get_pixmap(dpi=dpi, alpha=False)
            pix.save(out_dir / f"{pdf.stem}-{i:03d}.png")
        return doc.page_count


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdfs", nargs="*", type=Path, help="変換する PDF（省略時は raw/pdf/*.pdf）")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--out", type=Path, default=ROOT / "raw" / "pages")
    args = ap.parse_args()
    pdfs = args.pdfs or sorted((ROOT / "raw" / "pdf").glob("*.pdf"))
    if not pdfs:
        raise SystemExit("PDF が見つかりません（raw/pdf/）")
    for pdf in pdfs:
        n = convert(pdf, args.out, args.dpi)
        print(f"{pdf.name}: {n} ページ")


if __name__ == "__main__":
    main()
