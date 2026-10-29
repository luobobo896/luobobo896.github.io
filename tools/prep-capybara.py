#!/usr/bin/env python3
"""把水豚实拍图裁成站点用的三个 WebP。

为什么有这个脚本：`assets/capybara/*.webp` 不是来路不明的成品图，而是从
Wikimedia Commons 的 File:Capybara portrait.jpg（CC BY 2.0）裁切 + 压出来的。
参数写在这里，任何人跑一遍都能得到同一套视觉，改参数也看得见改了什么。

用法（两步，舞台图要 alpha）：
    swiftc -O tools/cutout.swift -o /tmp/cutout
    /tmp/cutout SOURCE.jpg /tmp/cut.png
    python3 tools/prep-capybara.py SOURCE.jpg assets/capybara /tmp/cut.png

流水线：径向遮罩高斯模糊压暗背景（主体亮度 1.0 / 背景 0.55）→ 饱和度 0.88
      → 缩放 → WebP。两张头像先做居中方形裁切（CC BY 的「已裁切」指这一步）。
      舞台图走另一条：`cutout.swift` 用 macOS Vision 的
      VNGenerateForegroundInstanceMaskRequest 抠出主体（毛边保留半透明），
      这里按 alpha 包围盒裁到主体外留 STAGE_PAD 的气口，缩到 320 宽存 RGBA WebP
      —— 背景是透明的，落进舞台才有「站在地面上」而不是「贴一张方图」。
      没有第三个参数就沿用旧做法（整幅缩，无 alpha），只用于对比。
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

SIZES = (("head-48.webp", 48), ("head-vig-96.webp", 96))
STAGE = ("stage-320.webp", 320)
BLUR_RADIUS = 56
BG_BRIGHTNESS = 0.55
SATURATION = 0.88
QUALITY = 78
STAGE_QUALITY = 80
STAGE_PAD = 16


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
    if len(argv) not in (3, 4):
        print("用法：prep-capybara.py SOURCE.jpg OUTDIR [CUT.png]", file=sys.stderr)
        return 2

    src, outdir = Path(argv[1]), Path(argv[2])
    cut = Path(argv[3]) if len(argv) == 4 else None
    if not src.is_file():
        print(f"源图不存在：{src}", file=sys.stderr)
        return 2
    outdir.mkdir(parents=True, exist_ok=True)

    # 遮罩在母版上算一次（模糊半径 56 是相对母版像素的），再缩到各个尺寸
    master = Image.open(src).convert("RGB")
    base = vignette(cover_square(master))
    for name, size in SIZES:
        im = base.resize((size, size), Image.LANCZOS)
        im = ImageEnhance.Color(im).enhance(SATURATION)
        dst = outdir / name
        im.save(dst, "WEBP", quality=QUALITY, method=6)
        print(f"{dst}  {dst.stat().st_size} B  {size}x{size}")

    # 舞台图：有抠像图就按 alpha 包围盒裁主体、留气口，缩到 320 宽存 RGBA
    name, width = STAGE
    if cut is not None and cut.is_file():
        stage = Image.open(cut).convert("RGBA")
        box = stage.getchannel("A").getbbox()
        if box:
            pad = STAGE_PAD
            stage = stage.crop((
                max(0, box[0] - pad), max(0, box[1] - pad),
                min(stage.width, box[2] + pad), min(stage.height, box[3] + pad),
            ))
        stage = stage.resize((width, round(width * stage.height / stage.width)), Image.LANCZOS)
    else:
        # 没有抠像图：整幅缩到 320 宽（1920×1440 → 320×240），无 alpha，仅用于对比
        stage = vignette(master)
        stage = stage.resize((width, round(width * master.height / master.width)), Image.LANCZOS)
    stage = ImageEnhance.Color(stage).enhance(SATURATION)
    dst = outdir / name
    stage.save(dst, "WEBP", quality=STAGE_QUALITY, method=6)
    print(f"{dst}  {dst.stat().st_size} B  {stage.width}x{stage.height}  alpha={stage.mode}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
