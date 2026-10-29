#!/usr/bin/env python3
"""把水豚实拍图裁成站点用的两个 WebP。

为什么有这个脚本：`assets/capybara/*.webp` 不是来路不明的成品图，而是从
Wikimedia Commons 的 File:Capybara portrait.jpg（CC BY 2.0）裁切 + 压出来的。
参数写在这里，任何人跑一遍都能得到同一套视觉，改参数也看得见改了什么。

用法：
    python3 tools/prep-capybara.py SOURCE.jpg assets/capybara

流水线：方形裁切 → 缩放 → 径向遮罩高斯模糊压暗背景（主体亮度 1.0 / 背景 0.55）
      → 饱和度 0.88 → WebP q78。
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

SIZES = (("head-48.webp", 48), ("head-vig-96.webp", 96))
BLUR_RADIUS = 56
BG_BRIGHTNESS = 0.55
SATURATION = 0.88
QUALITY = 78


def cover_square(im: Image.Image) -> Image.Image:
    """居中取最大正方形（CC BY 的「已裁切」指的就是这一步）。"""
    side = min(im.size)
    left = (im.width - side) // 2
    top = (im.height - side) // 2
    return im.crop((left, top, left + side, top + side))


def vignette(im: Image.Image) -> Image.Image:
    """中心保持原亮度，越靠边越暗；遮罩就是径向渐变再高斯模糊 56。"""
    grad = Image.radial_gradient("L").resize(im.size, Image.BICUBIC)
    grad = grad.filter(ImageFilter.GaussianBlur(BLUR_RADIUS))
    dark = ImageEnhance.Brightness(im).enhance(BG_BRIGHTNESS)
    return Image.composite(im, dark, grad.point(lambda v: 255 - v))


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        return 2

    src, outdir = Path(argv[1]), Path(argv[2])
    if not src.is_file():
        print(f"源图不存在：{src}", file=sys.stderr)
        return 2
    outdir.mkdir(parents=True, exist_ok=True)

    # 遮罩在母版上算一次（模糊半径 56 是相对母版像素的），再缩到两个尺寸
    base = vignette(cover_square(Image.open(src).convert("RGB")))
    for name, size in SIZES:
        im = base.resize((size, size), Image.LANCZOS)
        im = ImageEnhance.Color(im).enhance(SATURATION)
        dst = outdir / name
        im.save(dst, "WEBP", quality=QUALITY, method=6)
        print(f"{dst}  {dst.stat().st_size} B  {size}x{size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
