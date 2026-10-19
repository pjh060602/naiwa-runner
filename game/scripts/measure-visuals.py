"""量两件事：
1) 路面光斑是否真的比路面亮（要求光斑区域亮度比同行路面中位数高 ≥8%）
2) HUD 标签与面板底的对比度（WCAG，正文 AA 要 ≥4.5）

用法: python scripts/measure-visuals.py <before.png> <after.png>
"""
import sys
from PIL import Image


def srgb_to_linear(v: float) -> float:
    c = v / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luma(r: int, g: int, b: int) -> float:
    return 0.2126 * srgb_to_linear(r) + 0.7152 * srgb_to_linear(g) + 0.0722 * srgb_to_linear(b)


def contrast(a: tuple, b: tuple) -> float:
    la, lb = luma(*a), luma(*b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def is_frog(r: int, g: int, b: int) -> bool:
    return r > 140 and g > 110 and b < 100 and r - b > 70 and g - b > 50


def pool_stats(path: str) -> None:
    image = Image.open(path).convert("RGB")
    width, height = image.size
    pixels = image.load()
    # 只看路面中段：避开两侧店铺与 HUD；再排除奶蛙本体
    x0, x1 = int(width * 0.30), int(width * 0.70)
    y0, y1 = int(height * 0.52), int(height * 0.93)

    row_medians = {}
    pool_pixels = []
    road_pixels = 0
    for y in range(y0, y1):
        row = []
        for x in range(x0, x1):
            r, g, b = pixels[x, y]
            if is_frog(r, g, b):
                continue
            row.append(luma(r, g, b))
        if not row:
            continue
        row.sort()
        median = row[len(row) // 2]
        row_medians[y] = median
        road_pixels += len(row)

    for y in range(y0, y1):
        median = row_medians.get(y)
        if median is None or median <= 0:
            continue
        for x in range(x0, x1):
            r, g, b = pixels[x, y]
            if is_frog(r, g, b):
                continue
            L = luma(r, g, b)
            # 光斑 = 明显亮于本行路面中位数、且偏暖
            if L > median * 1.6 and (r - b) > 8:
                pool_pixels.append((L, (r, g, b), median))

    name = path.replace("\\", "/").split("/")[-1]
    if not row_medians:
        print(f"{name} | 取不到路面")
        return
    base_luma = sum(row_medians.values()) / len(row_medians)
    if not pool_pixels:
        print(f"{name} | 路面中位亮度 {base_luma:.4f} | 未检测到亮于路面 1.6 倍的光斑像素")
        return
    pool_mean = sum(item[0] for item in pool_pixels) / len(pool_pixels)
    local_mean = sum(item[2] for item in pool_pixels) / len(pool_pixels)
    delta = (pool_mean - local_mean) / local_mean * 100
    print(
        f"{name} | 路面中位亮度 {base_luma:.4f} | 光斑均值 {pool_mean:.4f} (比同行路面 {local_mean:.4f} 高 {delta:+.1f}%) "
        f"| 光斑像素 {len(pool_pixels)} / 路面像素 {road_pixels} ({len(pool_pixels) / road_pixels * 100:.2f}%)"
    )


print("=== 1) 路面光斑 vs 路面 ===")
for arg in sys.argv[1:]:
    pool_stats(arg)

print()
print("=== 2) HUD 标签对比度（WCAG，正文 AA 需 ≥4.5）===")
scene = (58, 63, 74)  # 背后场景取中灰
old_panel = tuple(round(0.55 * bg + 0.45 * sc) for bg, sc in zip((12, 16, 22), scene))
new_panel = tuple(round(0.82 * bg + 0.18 * sc) for bg, sc in zip((8, 11, 16), scene))
print(f"旧 HUD：标签 #8b95a5 / 合成底色 rgb{old_panel} → 对比度 {contrast((139, 149, 165), old_panel):.2f}")
print(f"新 HUD：标签 #cdd7e5 / 合成底色 rgb{new_panel} → 对比度 {contrast((205, 215, 229), new_panel):.2f}")
print(f"新 HUD 数值：#ffd93f / rgb{new_panel} → 对比度 {contrast((255, 217, 63), new_panel):.2f}")
