# 社区勋章出图提示词

勋章正反面由 Codex 的图像生成出图，再由本目录的脚本去背、生成高度图与外轮廓、转成页面使用的 WebP。
流程见同目录 README.md。下面是定稿时使用的完整提示词，改图时在此基础上修改并记录。

## 共用风格（真实金匠工艺）

```text
A single real, physically manufacturable jewelry medal, photographed in a dark studio with two
or three large soft-boxes, straight-on, plain near-black background. All light comes from
outside the object; nothing glows on its own.
Metal: high-polish cast precious metal (yellow gold, rose gold, white gold or oxidised silver
per medal) with soft flowing organic Art-Nouveau forms, plausible casting thickness, crisp
polished highlights that reflect the soft-boxes, faint real-world micro-scratches.
Enamel: the panel is real vitreous enamel (champlevé or translucent plique-à-jour over
engine-turned guilloché), rich but natural colour, light passing through it only where real
enamel would transmit it.
Gem: one real cut gemstone (cabochon or faceted) set flush in a bezel or claw setting.
Emblem: one or two raised polished-metal strokes or a fine cloisonné wire line.
Tangible, believable, museum-quality goldsmith work; no sci-fi glow, no nebula, no particles,
no text, no letters.
```

## 阶梯勋章的等级工艺

编剧与布景每档一张正面，外形、金属、配色与徽记造型四档完全相同，只按工艺难度与用料递进；缩到头像大小时主要靠宝石数量与轮缘闪点区分。

```text
Tier 1 初光: polished metal frame, opaque champlevé enamel over simple guilloché, emblem a plain
raised metal stroke, no gemstone.
Tier 2 共建: adds a fine milgrain beaded edge along the rim, emblem in crisp cloisonné wire, one
small gemstone set in a bezel.
Tier 3 卓越: translucent plique-à-jour enamel with light passing through, hand-engraved rim
details, emblem sculpted in relief, one larger faceted gemstone.
Tier 4 核心: the masterpiece: two-tone metal accents, a line of tiny pavé-set stones along part of
the rim, the finest plique-à-jour with subtle colour gradient, sculpted emblem, one principal
faceted gemstone plus the pavé. Same silhouette and footprint as tiers 1-3.
```

## 外形规则与九枚描述

所有勋章背面刻字风格一致，因此外形必须足够宽：整体宽度不小于高度的 85%，去掉轮缘后中央能放下约为画面宽 52%、高 32% 的平整区域。独枚勋章的做工相当于卓越档。

```text
Shape rule for every medal: a broad footprint, overall width at least 85% of its height, with a
large calm central area (room for a flat plate about half the medal's width). No tall narrow,
crescent-thin or sliver shapes.
```

```text
编剧 code: two flowing white-gold bands that start apart at the upper left and upper right
and merge into one band at the bottom centre, forming a broad rounded shield-like outline nearly
as wide as tall; deep teal-green enamel; emblem two fine lines merging into one; aquamarine.
布景 plugin: a broad rounded trefoil of rose gold, three short lobes fused around a large calm
central body, nearly as wide as tall; warm amber-brown enamel; emblem a sculpted relief of three joined
hexagonal honeycomb cells, one filled with translucent amber enamel like honey, no bee,
identical form on every tier; hessonite garnet.
掌灯 helper: a broad oil-lamp form, a wide rounded lamp-bowl body with the flame tip rising and
curling to one side at the top, nearly as wide as tall; yellow gold; translucent amber
plique-à-jour; emblem a small flame of gold wire cupped by one curve; citrine.
主创 maintainer: a compact Art-Nouveau round-arch pendant like a cathedral window outline, no
pillars, no base; platinum with a yellow-gold keystone; deep violet enamel; emblem a small upright
round arch with a raised keystone (not a crescent); amethyst in the keystone.
守夜 security: a broad, nearly circular moon: the right part a polished silver crescent rim, the rest
of the disc deep blue guilloché enamel night sky; emblem a small four-point star above one
horizon line; moonstone set in the crescent rim.
试映 tester: keep the current rising-sun arc; rose gold; deep wine enamel; emblem a rising sun, half a sun disc
emerging from one horizon line with three short rays above it; rhodolite garnet.
启幕 pioneer: a broad stage curtain, two drapes swooping open beneath a wide scalloped valance, wider
than tall; red gold; crimson enamel with fine vertical pleat lines; emblem a sprout of two leaf
strokes; garnet at the valance centre.
```

主创使用下面的星盘描述（覆盖上面的主创条目），做工按核心档：

```text
A 星盘 astrolabe: a broad round openwork medal like a jeweller's astrolabe / orrery: concentric
platinum and yellow-gold rings with finely engraved scale marks, delicate pierced filigree
between them, deep violet plique-à-jour enamel glimpsed through the openwork, a large faceted
amethyst as the heart at the centre that the rings orbit (the core others gather around), a
line of tiny pavé diamonds on one ring.
```

## 背面

所有勋章背面为整块抛光金属背板，中央一块平整的圆角矩形刻字板，名称、等级、授予对象、时间与 MoviePilot 落款由页面刻上。

```text
BACK: the same medal seen from behind, silhouette mirrored left-right, entirely a polished solid
metal back plate in the medal's metal (as real jewelry backs are), a slim raised rim following the
outline, only the bezel backing of the gem visible (mirrored position). In the centre a smooth,
slightly recessed, perfectly flat rounded-rectangle engraving plate, about 52% of the image width
and 32% of its height, horizontally centred, empty: no emblem, no text, no hallmark, no pattern.
```

主创（星盘）背面在保留同一刻字板的前提下按真实星盘背面雕刻：

```text
BACK of the astrolabe medal (maintainer), mirrored silhouette of the front, solid polished yellow
gold and platinum back plate. Hand-engraved like the back of a real Renaissance astrolabe:
concentric graduated scale rings with fine tick marks, an engraved calendar ring of tiny repeating
motifs (no letters, no numerals, no zodiac signs), a delicate engraved star chart of dots and
fine lines between the rings, a pivoting alidade rule (a slender pointed platinum bar with sight
vanes) crossing the plate on a central rivet. In the centre, the same flat, slightly recessed,
perfectly smooth rounded-rectangle engraving plate as every other medal (about 52% of the image
width, 32% of its height, horizontally centred), polished and empty; the alidade passes behind
it, not over it. The amethyst's bezel backing visible at the centre-top area if the gem sits
there. Museum-quality goldsmith and engraver's work, external studio light only, plain near-black
background, straight-on, no text, no letters, no numerals.
```

## 徽记的经验

写实小物件（锤凿、望远镜）做徽记像贴上去的道具；两个并排的圆形配下方宝石、带倒影的弧线都会被看成眼睛或脸。
徽记应是自然或光的一两笔意象（火苗、星与地平线、汇流的线、初升的太阳、蜂房），并融入构图。

## 出图硬性要求

```text
Square, straight-on, medal centered filling about 80% of the frame, the same scale as the other medals, plain near-black background that can be removed cleanly, external studio light only, no text, no letters, no numerals.
```
