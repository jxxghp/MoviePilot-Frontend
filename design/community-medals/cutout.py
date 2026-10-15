"""去掉近黑底得到透明底：从图像边缘泛洪选出与背景相连的暗像素，再按距离羽化边缘。

    uv run --with numpy --with scipy --with pillow python cutout.py <in.png> <out.png> [size]
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, dst = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 1600
img = Image.open(src).convert("RGB").resize((size, size), Image.LANCZOS)
rgb = np.asarray(img).astype(np.float32) / 255
lum = rgb.max(axis=2)
# 背景色取四角中位数，背景判定看与背景色的距离，避免把暗部金属当成背景。
corners = np.concatenate([rgb[:20, :20].reshape(-1, 3), rgb[:20, -20:].reshape(-1, 3),
                          rgb[-20:, :20].reshape(-1, 3), rgb[-20:, -20:].reshape(-1, 3)])
bg = np.median(corners, axis=0)
dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
# 地面阴影比背景更暗且几乎无色，同样算背景（只在与画面边缘相连时才会被去掉，内部暗部不受影响）。
sat = rgb.max(axis=2) - rgb.min(axis=2)
cand = (dist < 0.06) | ((lum <= bg.max() + 0.02) & (sat < 0.04))
labels, _ = ndimage.label(cand)
edge = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
background = np.isin(labels, list(edge))
body = ndimage.binary_fill_holes(~background)
# 只保留最大连通块和较大的附属块（宝石、分离的带），去掉噪点。
lab, n = ndimage.label(body)
sizes = ndimage.sum(body, lab, range(1, n + 1))
# 只保留主体，以及质心落在主体外框内的较大附属块；画面底部的倒影、地面阴影丢弃。
main = int(np.argmax(sizes)) + 1
my, mx = np.nonzero(lab == main)
ids = [main]
for i, s in enumerate(sizes):
    if i + 1 == main or s <= size * size * 0.002:
        continue
    yy, xx = np.nonzero(lab == i + 1)
    if my.min() <= yy.mean() <= my.max() and mx.min() <= xx.mean() <= mx.max():
        ids.append(i + 1)
keep = np.isin(lab, ids)
# 边缘按与背景色的距离做软过渡，宽度约 2px。
inside = ndimage.distance_transform_edt(keep)
soft = np.clip(dist / 0.12, 0, 1)
alpha = np.where(inside > 3, 1.0, np.where(keep, np.maximum(soft, inside / 3), 0.0))
# 边缘去色：半透明边缘像素是勋章色与黑底的混合，按 c = (c_obs - (1 - a) * bg) / a 还原，去掉黑边。
a3 = alpha[..., None]
clean = np.where(a3 > 0.02, (rgb - (1 - a3) * bg) / np.maximum(a3, 0.02), rgb)
out = np.dstack([clean.clip(0, 1), alpha]).clip(0, 1)
Image.fromarray((out * 255).astype(np.uint8), "RGBA").save(dst)
print(dst, f"coverage={keep.mean():.3f}")
