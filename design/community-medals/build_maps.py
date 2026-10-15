"""从去背后的定稿原图算出精绘用的高度图与外形轮廓。

    uv run --with numpy --with scipy --with pillow python build_maps.py <原图目录> <输出目录> [调试目录]

改编自 Cirvel 勋章的同名脚本，适配本套写实首饰：珐琅是有色、带纹理的面板，宝石镶嵌在本体上，
背面是整块金属背板加一块平整刻字板。每张 <键>-<面>.png 输出：
- <键>-<面>-height.webp：灰度高度图，与原图逐像素对齐。轮缘按截面鼓起，表盘（珐琅或刻字板）最低，
  徽记凸出表盘。页面据此做视差与补光。
- <键>-<面>.outline.json：本体外轮廓（坐标为相对整张图的比例，y 向下）；背面另含刻字板 dial
  （中心与宽高），页面据此排版背面刻字。

分层全部从原图里算，不另外出图：另出的图与原图对不齐。给出调试目录时输出各层的着色图便于核对。
"""

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

import os
import sys

# 源目录与输出目录由参数给出；表盘判定阈值可用环境变量微调。
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("source")
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("out")
DEBUG = Path(sys.argv[3]) if len(sys.argv) > 3 else None
SIZE = 1200
DIAL_MAX_MEAN = float(os.environ.get("DIAL_MAX_MEAN", "0.62"))
DIAL_MAX_SPREAD = float(os.environ.get("DIAL_MAX_SPREAD", "0.08"))  # 与面板用的 WebP 同尺寸

# 各层的高度（0–1）。唇边最高处 1，表盘 0.18，徽记在表盘上再凸 0.22，宝石球顶 0.95。
DIAL = 0.18
EMBLEM = 0.22
RIM_BASE = 0.32


def load(path: Path) -> tuple[np.ndarray, np.ndarray]:
    image = Image.open(path).convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS)
    rgba = np.asarray(image).astype(np.float32) / 255
    return rgba[..., :3], rgba[..., 3]


def components(mask: np.ndarray) -> list[np.ndarray]:
    labels, count = ndimage.label(mask)
    parts = [labels == i for i in range(1, count + 1)]
    return sorted(parts, key=lambda part: part.sum(), reverse=True)


def build(path: Path) -> None:
    rgb, alpha = load(path)
    solid = alpha > 0.5
    parts = components(solid)
    body = ndimage.binary_fill_holes(parts[0])
    # 宝石是本体之外最大的一块，太小的是去背残留。
    gem = parts[1] if len(parts) > 1 and parts[1].sum() > SIZE * SIZE * 0.002 else np.zeros_like(body)

    # 表盘：本体里最大的一块平滑的深色区域，补上洞（徽记的亮线）。唇边是反差很大的液态金属，
    # 暗处的反光也会很深，只看亮度会被当成表盘，所以同时看局部的明暗起伏：珐琅平滑，金属起伏大。
    # 唇边至少有一段宽度，离外缘太近的不算表盘。
    luminance = rgb @ np.array([0.3, 0.59, 0.11], dtype=np.float32)
    # 先把表盘纹样的细线模糊掉，再看大范围的起伏，否则纹样也会被当成金属。
    blurred = ndimage.gaussian_filter(luminance, 4)
    mean = ndimage.uniform_filter(blurred, 21)
    spread = np.sqrt(np.maximum(ndimage.uniform_filter(blurred * blurred, 21) - mean * mean, 0))
    to_outside = ndimage.distance_transform_edt(body)
    # MoviePilot 版：珐琅是有色、带纹理的面板，金属是贵金属色。先从外缘一圈取金属的平均色度，
    # 再把本体内与金属色度、亮度差得远的大块连通区域当作表盘。
    soft_rgb = np.stack([ndimage.gaussian_filter(rgb[..., c], 5) for c in range(3)], axis=-1)
    lum = soft_rgb.mean(axis=2, keepdims=True) + 1e-4
    chroma = soft_rgb / lum
    band = body & (to_outside > SIZE * 0.004) & (to_outside < SIZE * 0.02)
    metal_chroma = np.median(chroma[band], axis=0)
    metal_lum = np.median(lum[band])
    diff = np.linalg.norm(chroma - metal_chroma, axis=2) + 0.8 * np.abs(lum[..., 0] - metal_lum)
    inner = body & (to_outside > SIZE * 0.035)
    threshold = float(os.environ.get("DIAL_DIFF", "0") or 0) or np.percentile(diff[inner], 45)
    smooth = inner & (diff > threshold)
    smooth = ndimage.binary_opening(smooth, iterations=3)
    parts_dial = components(smooth)
    keep = [part for part in parts_dial if part.sum() > parts_dial[0].sum() * 0.15]
    dial = np.zeros_like(body)
    for part in keep:
        dial |= part
    dial = ndimage.binary_fill_holes(ndimage.binary_closing(dial, iterations=10)) & body
    dial = ndimage.binary_opening(dial, iterations=4)
    if path.stem.endswith("-back"):
        # 背面是整块金属背板：刻字板是中央最平滑的一块（局部起伏小），取离质心最近的平滑连通块。
        blurred = ndimage.gaussian_filter(luminance, 3)
        mean = ndimage.uniform_filter(blurred, 25)
        spread = np.sqrt(np.maximum(ndimage.uniform_filter(blurred * blurred, 25) - mean * mean, 0))
        # 刻字板是居中、近似矩形、尺寸有限的一块；阈值从宽到严逐级尝试，直到得到符合尺寸的一块。
        ys, xs = np.nonzero(body)
        cy, cx = ys.mean(), xs.mean()
        best = None
        for limit in (0.025, 0.018, 0.012, 0.008, 0.005):
            flat = ndimage.binary_opening(inner & (spread < limit), iterations=3)
            labels, count = ndimage.label(flat)
            best_score = None
            for i in range(1, count + 1):
                part = labels == i
                if part.sum() < SIZE * SIZE * 0.02:
                    continue
                py, px = np.nonzero(part)
                w, h = (px.max() - px.min()) / SIZE, (py.max() - py.min()) / SIZE
                rect = part.sum() / max((px.max() - px.min()) * (py.max() - py.min()), 1)
                if w > 0.72 or h > 0.45 or rect < 0.75:
                    continue
                score = np.hypot(py.mean() - cy, px.mean() - cx) - np.sqrt(part.sum()) * 0.5
                if best_score is None or score < best_score:
                    best, best_score = part, score
            if best is not None:
                break
        dial = np.zeros_like(body) if best is None else ndimage.binary_fill_holes(ndimage.binary_closing(best, iterations=6)) & body
    dial &= to_outside > SIZE * 0.03
    # 徽记是表盘上明显亮于周围的线，表盘纹样的细线只比周围略亮，不算。
    emblem = dial & (np.linalg.norm(chroma - metal_chroma, axis=2) < 0.18) & (luminance > ndimage.uniform_filter(luminance, 15) + 0.08)
    rim = body & ~dial

    # 唇边截面：到外缘与到表盘边的距离之比 t，按 sin(πt) 鼓起，像熔融金属堆起的唇。两端的坡度要
    # 有限，太陡（比如取平方根）时视差会在坡上拉出横纹。
    to_dial = ndimage.distance_transform_edt(~dial)
    t = np.clip(to_outside / np.maximum(to_outside + to_dial, 1e-6), 0, 1)
    bulge = np.sin(np.pi * t)
    height = np.zeros((SIZE, SIZE), dtype=np.float32)
    height[rim] = (RIM_BASE + (1 - RIM_BASE) * bulge)[rim]
    height[dial] = DIAL
    soft = ndimage.gaussian_filter(emblem.astype(np.float32), 2.2)
    height = np.where(dial, DIAL + EMBLEM * np.clip(soft * 1.6, 0, 1), height)

    gem_circle = None
    if gem.any():
        ys, xs = np.nonzero(gem)
        cx, cy = xs.mean(), ys.mean()
        radius = np.sqrt(gem.sum() / np.pi)
        yy, xx = np.mgrid[0:SIZE, 0:SIZE]
        d = np.clip(np.hypot(xx - cx, yy - cy) / radius, 0, 1)
        dome = 0.55 + 0.4 * np.sqrt(1 - d * d)
        height = np.where(gem, dome, height)
        gem_circle = {"x": round(cx / SIZE, 4), "y": round(cy / SIZE, 4), "r": round(radius / SIZE, 4)}

    # 整体柔一点：去背的锯齿与各层交界不跳变，视差找交点才稳。
    height = ndimage.gaussian_filter(height, 2.0) * (body | gem)
    name = path.stem
    if DEBUG:
        DEBUG.mkdir(parents=True, exist_ok=True)
        vis = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
        vis[rim] = (200, 160, 60)
        vis[dial] = (40, 90, 200)
        vis[emblem] = (255, 255, 255)
        Image.fromarray(vis).save(DEBUG / f"{name}-layers.png")
    Image.fromarray((np.clip(height, 0, 1) * 255).astype(np.uint8), "L").save(OUT / f"{name}-height.webp", quality=90)

    # 外轮廓：沿本体边缘的点，按弧长均匀取 160 个。
    contour = trace(body)
    step = max(1, len(contour) // 160)
    outline = [[round(x / SIZE, 4), round(y / SIZE, 4)] for x, y in contour[::step]]
    payload = {"outline": outline, "gem": gem_circle}
    if name.endswith("-back") and dial.any():
        # 刻字板：中心与宽高按整张图比例给出，前端据此放置背面刻字。
        py, px = np.nonzero(dial)
        payload["dial"] = {"x": round((px.min() + px.max()) / 2 / SIZE, 4), "y": round((py.min() + py.max()) / 2 / SIZE, 4),
                           "width": round((px.max() - px.min()) / SIZE, 4), "height": round((py.max() - py.min()) / SIZE, 4)}
    (OUT / f"{name}.outline.json").write_text(json.dumps(payload, separators=(",", ":")))
    print(name, "rim", int(rim.sum()), "dial", int(dial.sum()), "emblem", int(emblem.sum()), "gem", gem_circle, "points", len(outline))


def trace(mask: np.ndarray) -> list[tuple[int, int]]:
    """Moore 邻域沿边缘走一圈，返回按顺序排列的边缘像素。"""
    ys, xs = np.nonzero(mask)
    start = (int(xs[np.argmin(ys * SIZE + xs)]), int(ys.min()))
    dirs = [(1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1)]
    path = [start]
    current, back = start, 4
    for _ in range(SIZE * 20):
        for i in range(8):
            d = (back + 1 + i) % 8
            nx, ny = current[0] + dirs[d][0], current[1] + dirs[d][1]
            if 0 <= nx < SIZE and 0 <= ny < SIZE and mask[ny, nx]:
                back = (d + 4) % 8
                current = (nx, ny)
                break
        if current == start:
            break
        path.append(current)
    return path


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for source in sorted(SOURCE.glob("*.png")):
        build(source)
