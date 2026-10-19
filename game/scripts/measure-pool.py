"""路面光斑实测：在路面中段找「最亮的暖色 40x40 窗口」，与同一区域的路面中位亮度对比。
会把这个窗口裁成 crop 图，肉眼确认它确实是一块光斑。

用法: python scripts/measure-pool.py <图片> [<图片> ...]
"""
import sys
from PIL import Image

WIN = 40
STRIDE = 10


def srgb_to_linear(v: float) -> float:
    c = v / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luma(r: int, g: int, b: int) -> float:
    return 0.2126 * srgb_to_linear(r) + 0.7152 * srgb_to_linear(g) + 0.0722 * srgb_to_linear(b)


def is_frog(r: int, g: int, b: int) -> bool:
    return r > 140 and g > 110 and b < 100 and r - b > 70 and g - b > 50


def analyse(path: str, tag: str) -> None:
    image = Image.open(path).convert("RGB")
    width, height = image.size
    pixels = image.load()
    x0, x1 = int(width * 0.28), int(width * 0.72)
    y0, y1 = int(height * 0.50), int(height * 0.93)

    road = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = pixels[x, y]
            if not is_frog(r, g, b):
                road.append(luma(r, g, b))
    road.sort()
    road_median = road[len(road) // 2]

    best = None
    for y in range(y0, y1 - WIN, STRIDE):
        for x in range(x0, x1 - WIN, STRIDE):
            total = 0.0
            warm = 0
            frog = 0
            for j in range(y, y + WIN, 2):
                for i in range(x, x + WIN, 2):
                    r, g, b = pixels[i, j]
                    if is_frog(r, g, b):
                        frog += 1
                        continue
                    total += luma(r, g, b)
                    warm += 1 if (r - b) > 8 else 0
            sampled = (WIN // 2) * (WIN // 2)
            if frog > sampled * 0.15 or warm < sampled * 0.5:
                continue
            mean = total / max(1, sampled - frog)
            if best is None or mean > best[0]:
                best = (mean, x, y)

    name = path.replace("\\", "/").split("/")[-1]
    if best is None:
        print(f"{name} | 路面中位亮度 {road_median:.4f} | 没找到暖色窗口")
        return
    mean, x, y = best
    delta = (mean - road_median) / road_median * 100
    image.crop((x, y, x + WIN, y + WIN)).resize((160, 160), Image.NEAREST).save(f".tmp/{tag}-pool-crop.png")
    print(
        f"{name} | 路面中位亮度 {road_median:.4f} | 最亮暖色块 {WIN}x{WIN}@({x},{y}) 均值 {mean:.4f} "
        f"| 比路面亮 {delta:+.1f}% | crop -> .tmp/{tag}-pool-crop.png"
    )


for index, arg in enumerate(sys.argv[1:]):
    analyse(arg, f"{index}")
