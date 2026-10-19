"""量奶蛙在真实渲染画面里占屏高的比例：扫黄色像素并只保留最大的连通块（排除奶瓶/霓虹的干扰）。
用法: python scripts/measure-screen-ratio.py <图片> [<图片> ...]
"""
import sys
from PIL import Image

YELLOW = dict(r_min=140, g_min=110, b_max=100, rb=70, gb=50)


def is_frog(r: int, g: int, b: int) -> bool:
    return (
        r > YELLOW["r_min"]
        and g > YELLOW["g_min"]
        and b < YELLOW["b_max"]
        and r - b > YELLOW["rb"]
        and g - b > YELLOW["gb"]
    )


def measure(path: str) -> None:
    image = Image.open(path).convert("RGB")
    width, height = image.size
    pixels = image.load()
    left, right = int(width * 0.25), int(width * 0.75)

    seen = bytearray(width * height)
    best = None

    for y in range(height):
        for x in range(left, right):
            index = y * width + x
            if seen[index]:
                continue
            if not is_frog(*pixels[x, y]):
                seen[index] = 1
                continue
            stack = [(x, y)]
            seen[index] = 1
            count = 0
            min_x = max_x = x
            min_y = max_y = y
            while stack:
                cx, cy = stack.pop()
                count += 1
                if cx < min_x:
                    min_x = cx
                if cx > max_x:
                    max_x = cx
                if cy < min_y:
                    min_y = cy
                if cy > max_y:
                    max_y = cy
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < left or nx >= right or ny < 0 or ny >= height:
                        continue
                    ni = ny * width + nx
                    if seen[ni]:
                        continue
                    if is_frog(*pixels[nx, ny]):
                        seen[ni] = 1
                        stack.append((nx, ny))
                    else:
                        seen[ni] = 1
            if best is None or count > best[0]:
                best = (count, min_x, max_x, min_y, max_y)

    name = path.replace("\\", "/").split("/")[-1]
    if best is None:
        print(f"{name}: 没扫到黄色像素")
        return
    count, min_x, max_x, min_y, max_y = best
    span = max_y - min_y + 1
    print(
        f"{name} | frame {width}x{height} | frog bbox x={min_x}..{max_x} y={min_y}..{max_y} "
        f"({span}px, {count} px area) | screen height ratio {span / height * 100:.1f}%"
    )


for arg in sys.argv[1:]:
    measure(arg)
