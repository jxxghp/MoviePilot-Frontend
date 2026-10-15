#!/bin/zsh
# 从定稿原图重新生成页面使用的勋章资产。
# 用法：rebuild.sh <原图目录>
#   原图目录放 Codex 出图的原始 PNG（近黑底，<键>-front[-t<档>].png 与 <键>-back.png），
#   原图不进仓库，见 README.md 的下载说明。
# 依赖：uv、cwebp（libwebp）。
set -e
here="${0:A:h}"
raw="${1:?需要原图目录}"
out="$here/../../src/assets/images/community/medals"
work="$(mktemp -d)"
mkdir -p "$work/source" "$out"
for f in "$raw"/*.png; do
  uv run -q --with numpy --with scipy --with pillow python "$here/cutout.py" "$f" "$work/source/${f:t}" 1600 >/dev/null
done
uv run -q --with numpy --with scipy --with pillow python "$here/match_back_tone.py" "$work/source"
uv run -q --with numpy --with scipy --with pillow python "$here/build_maps.py" "$work/source" "$out"
for f in "$work/source"/*.png; do
  cwebp -quiet -q 92 -alpha_q 100 -resize 1200 1200 "$f" -o "$out/${${f:t}%.png}.webp"
done
# 顶栏佩戴标识：每张正面另出一张 96×96 的小图，<键>-badge[-t<档>].webp，页面以 32 CSS 像素显示。
for f in "$work/source"/*-front*.png; do
  stem="${${f:t}%.png}"
  uv run -q --with pillow python "$here/badge.py" "$f" "$out/${stem/-front/-badge}.webp" >/dev/null
done
# 星盘外圈转动参数：圆心（按整张图比例）、走格方式与匀速时一圈的秒数写在这里；分界半径 r 由 measure_spin.py
# 在外圈附近找圆周上最均匀的一圈（角向颜色差异最小）自动量出，换图后重跑即可。
python3 - "$out/maintainer-front.outline.json" <<'PY'
import json, sys
path = sys.argv[1]
data = json.load(open(path))
data["spin"] = {"x": 0.4971, "y": 0.4829, "r": 0.3534, "period": 180, "mode": "tick", "step": 6, "interval": 2}
json.dump(data, open(path, "w"), separators=(",", ":"))
PY
uv run -q --with numpy --with pillow python "$here/measure_spin.py" "$out/maintainer-front.webp" "$out/maintainer-front.outline.json" >/dev/null
rm -rf "$work"
