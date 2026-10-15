"""让背面金属与正面轮缘同色：在 YCbCr 空间把背面的色度均值移到正面外缘一圈的色度均值，亮度不动。

    uv run --with numpy --with scipy --with pillow python match_back_tone.py <透明底原图目录>

背面由另一次出图生成，金属色常比正面偏暖或偏红，翻面时像换了一件东西。只改色度、保留亮度，
抛光背板的明暗层次不受影响。原地改写 <键>-back.png；正面取 <键>-front.png 或最高档 <键>-front-t4.png。
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def ycc(path: Path) -> tuple[np.ndarray, np.ndarray]:
    image = Image.open(path).convert("RGBA")
    alpha = np.asarray(image)[..., 3].astype(np.float32) / 255
    return np.asarray(image.convert("RGB").convert("YCbCr")).astype(np.float32), alpha


def rim_chroma(path: Path) -> np.ndarray:
    data, alpha = ycc(path)
    solid = alpha > 0.9
    depth = ndimage.distance_transform_edt(solid)
    band = solid & (depth > 4) & (depth < 40)
    return data[..., 1:][band].mean(axis=0)


def main(folder: Path) -> None:
    for back in sorted(folder.glob("*-back.png")):
        key = back.name[: -len("-back.png")]
        front = next((p for p in (folder / f"{key}-front.png", folder / f"{key}-front-t4.png") if p.exists()), None)
        if front is None:
            continue
        target = rim_chroma(front)
        data, alpha = ycc(back)
        solid = alpha > 0.5
        shift = target - data[..., 1:][solid].mean(axis=0)
        data[..., 1:] = np.clip(data[..., 1:] + shift, 0, 255)
        rgb = Image.fromarray(data.astype(np.uint8), "YCbCr").convert("RGB")
        rgba = np.dstack([np.asarray(rgb), (alpha * 255).astype(np.uint8)])
        Image.fromarray(rgba, "RGBA").save(back)
        print(key, "chroma shift", np.round(shift, 1))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
