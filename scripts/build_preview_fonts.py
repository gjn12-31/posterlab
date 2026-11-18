"""Build the smaller, common-Chinese web fonts with fontTools and Brotli."""
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1] / "web"
FONTS = ROOT / "public" / "fonts"


def common_characters():
    chars = set(chr(code) for code in range(32, 127))
    # GB2312 punctuation and level-one Chinese characters.
    for row in [0xA1, 0xA3, *range(0xB0, 0xD8)]:
        for column in range(0xA1, 0xFF):
            chars.update(bytes((row, column)).decode("gb2312", errors="ignore"))
    chars.update("–—·×→↑↓↗￥〇霓虹烘焙珈琲黑胶醇甄砺")
    return chars


if __name__ == "__main__":
    chars = common_characters()
    available = set(chars)
    for weight in ("Regular", "Bold"):
        with TTFont(FONTS / f"PosterSans-{weight}.woff2") as font:
            options = subset.Options()
            options.recalc_timestamp = False
            subsetter = subset.Subsetter(options)
            subsetter.populate(text="".join(sorted(chars)))
            subsetter.subset(font)
            available.intersection_update(chr(code) for code in font.getBestCmap())
            font.save(FONTS / f"PosterCommon-{weight}.woff2")
    (ROOT / "src" / "common-glyphs.txt").write_text("".join(sorted(available)), encoding="utf-8")
