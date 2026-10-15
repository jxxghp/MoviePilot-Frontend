"""从透明底的正面原图生成顶栏佩戴标识用的小图。

按不透明区域（alpha > 8）裁掉留白，补成正方形并居中，再用 Lanczos 一次缩到 96×96。
页面以 32 CSS 像素显示，96 像素足够三倍屏，避免浏览器从 1200 像素大图缩小时发糊、闪烁。

用法：badge.py <正面 PNG> <输出 WebP>
"""

import sys

from PIL import Image

SIZE = 96
ALPHA_FLOOR = 8


def main(source: str, target: str) -> None:
    image = Image.open(source).convert("RGBA")
    mask = image.getchannel("A").point(lambda value: 255 if value > ALPHA_FLOOR else 0)
    box = mask.getbbox()
    if box is None:
        raise SystemExit(f"{source} 没有不透明区域")
    image = image.crop(box)
    side = max(image.width, image.height)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
    square.resize((SIZE, SIZE), Image.Resampling.LANCZOS).save(target, "WEBP", lossless=True, method=6)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
