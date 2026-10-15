"""量出主创正面外圈转动的分界半径，写回轮廓文件里的 spin.r。

    uv run --with numpy --with pillow python measure_spin.py <正面图> <正面轮廓 JSON>

外圈转动时，分界圆两侧的画面会错开；分界圆落在沿圆周几乎一样的地方（例如一圈素面的银环）时，
错开也看不出接缝。脚本在勋章外半径的 0.80 到 0.95 倍之间逐半像素取圆，取圆周上颜色的角向标准差
（圆的内外各 1.5 像素一起平均），选标准差最小的半径。圆心沿用轮廓里已有的 spin.x、spin.y。
"""

import json
import sys

import numpy as np
from PIL import Image


def measure(image_path: str, outline_path: str) -> float:
    rgb = np.asarray(Image.open(image_path).convert("RGB")).astype(np.float64) / 255
    height, width, _ = rgb.shape
    data = json.load(open(outline_path))
    spin = data["spin"]
    cx, cy = spin["x"] * width, spin["y"] * height
    xs = [point[0] for point in data["outline"]]
    outer = (max(xs) - min(xs)) / 2 * width
    angles = np.linspace(0, 2 * np.pi, 2880, endpoint=False)
    best, best_score = None, float("inf")
    for radius in np.arange(outer * 0.80, outer * 0.95, 0.5):
        rings = []
        for offset in (-1.5, 0.0, 1.5):
            r = radius + offset
            x = np.clip(np.round(cx + r * np.cos(angles)).astype(int), 0, width - 1)
            y = np.clip(np.round(cy + r * np.sin(angles)).astype(int), 0, height - 1)
            rings.append(rgb[y, x])
        score = np.mean(rings, axis=0).std(axis=0).mean()
        if score < best_score:
            best, best_score = radius, score
    spin["r"] = round(float(best) / width, 4)
    json.dump(data, open(outline_path, "w"), separators=(",", ":"))
    return spin["r"]


if __name__ == "__main__":
    print(measure(sys.argv[1], sys.argv[2]))
