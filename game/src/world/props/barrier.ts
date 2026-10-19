import * as THREE from 'three';
import { MeshBuilder } from './build';
import type { V3 } from './build';

/**
 * 高门架障碍（slide 专用）—— 海滨栈道上的木门架：
 * 漂流木立柱（锥度 + 微弯 + 三档风化色）+ 麻绳绑扎 + 蓝白条纹布幡 + 两侧挂救生圈，
 * 下沿不是硬横梁，而是两道麻绳、中间吊着贝壳与浮木挂饰，柱脚压一圈沙堆卵石。
 *
 * 硬约束（接线的人依赖这些数）：
 *   宽 2.60m（x：-1.30 → +1.30，最宽处是顶部漂流木横杆）
 *   深 ≤0.35m（最深处是救生圈 / 柱脚沙堆）
 *   高 2.60m（横杆顶面 2.60）
 *   原点在地面中心，正面朝 +z
 *   **中央净跨 |x| < 1.0 的范围内，1.05m 以下没有任何实体**（滑铲判定线）
 *   低于 1.05 的实体只出现在 |x| ≥ 1.0（两根立柱 + 沙堆 + 卵石）
 */
export function barrierGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();

  const POST_X = 1.14; // 立柱中心
  const POST_R = 0.105;

  const DRIFT = 0x8a6a45;
  const DRIFT_DARK = 0x74583a;
  const DRIFT_PALE = 0xa58a66;
  const ROPE = 0x6b5236;
  const ROPE_LIGHT = 0x8a6d49;
  const SEA = 0x4fa3c7;
  const CLOTH = 0xefe7d6;
  const CLOTH_BACK = 0xcfc6b3;
  const SAND = 0xe8d9b5;
  const PEBBLE = 0xb9b1a4;
  const RING_ORANGE = 0xe8622f;
  const RING_WHITE = 0xf2efe6;
  const SHELL = 0xf4e8d8;
  const SHELL_DARK = 0xd8bfa6;

  // ── 1. 立柱：漂流木，三段带锥度和微弯，三段不同风化色 ──
  const postSegments = [
    { from: [0, 0.1, 0], to: [0.018, 0.95, 0.004], r0: 0.115, r1: 0.105, tint: 0.9, color: DRIFT },
    { from: [0.018, 0.95, 0.004], to: [-0.012, 1.75, -0.006], r0: 0.105, r1: 0.096, tint: 1, color: DRIFT },
    { from: [-0.012, 1.75, -0.006], to: [0.006, 2.5, 0.002], r0: 0.096, r1: 0.088, tint: 1.02, color: DRIFT },
  ] as const;
  for (const side of [-1, 1]) {
    for (const seg of postSegments) {
      b.rod(
        seg.color,
        [side * (POST_X + seg.from[0]), seg.from[1], seg.from[2]],
        [side * (POST_X + seg.to[0]), seg.to[1], seg.to[2]],
        seg.r0,
        seg.r1,
        8,
        { cap: false, grain: 0.07, tint: seg.tint, ao: 1.6 },
      );
    }
  }

  // ── 2. 柱脚：沙堆 + 两颗卵石（全部落在 |x| ≥ 1.0 带内，允许低于 1.05）──
  for (const side of [-1, 1]) {
    const x = side * 1.155;
    b.cyl(SAND, 0.1, 0.152, 0.1, [x, 0.05, 0], 10, [0, 0, 0], { grain: 0.07, ao: 0.6, tint: 0.95 });
    b.ellipsoid(PEBBLE, [0.055, 0.04, 0.05], [x + side * 0.05, 0.04, 0.105], 4, { grain: 0.05 });
    b.ellipsoid(PEBBLE, [0.038, 0.026, 0.034], [x - side * 0.03, 0.028, -0.1], 3, { grain: 0.05 });
  }

  // ── 3. 顶部漂流木横杆（最宽 2.60）+ 两端绳结 ──
  b.rod(DRIFT_PALE, [-1.295, 2.538, 0.01], [1.295, 2.518, -0.01], 0.062, 0.058, 8, { cap: false, grain: 0.07 });
  for (const side of [-1, 1]) {
    b.cyl(ROPE, 0.075, 0.075, 0.07, [side * 1.2, 2.52, 0], 8, [0, 0, Math.PI / 2], { cap: false, grain: 0.04 });
  }

  // ── 4. 绳绑：横杆两端各两圈、下沿绳端各一圈 ──
  for (const side of [-1, 1]) {
    for (const dy of [-0.045, 0.045]) {
      b.cyl(ROPE, POST_R + 0.022, POST_R + 0.022, 0.055, [side * POST_X, 2.44 + dy, 0], 8, [0, 0, 0], {
        cap: false,
        grain: 0.05,
      });
    }
    b.cyl(ROPE_LIGHT, POST_R + 0.02, POST_R + 0.02, 0.06, [side * POST_X, 1.19, 0], 8, [0, 0, 0], {
      cap: false,
      grain: 0.05,
    });
  }

  // ── 5. 蓝白条纹布幡：横杆下垂一段，中间轻微下垂，两侧各垂一截 ──
  const BANNER_TOP = 2.46;
  const BANNER_BOTTOM = 2.0;
  const stripes = 5;
  const halfSpan = 1.08;
  // 正面 u→+x、v→+y 时绕序法线正好朝 +z；背面把 x/z 镜像即可翻成 -z
  const cloth = (mirror: boolean, x0: number, x1: number) => (u: number, v: number): V3 => {
    const x = x0 + (x1 - x0) * u;
    const sag = Math.sin(Math.PI * ((x + halfSpan) / (halfSpan * 2))) * 0.08 * (1 - v);
    const y = BANNER_BOTTOM + (BANNER_TOP - BANNER_BOTTOM) * v - sag;
    const z = 0.03 * Math.cos(Math.PI * (x / (halfSpan * 2)));
    return [mirror ? -x : x, y, mirror ? -z : z];
  };
  for (let i = 0; i < stripes; i += 1) {
    const x0 = -halfSpan + (i / stripes) * halfSpan * 2;
    const x1 = -halfSpan + ((i + 1) / stripes) * halfSpan * 2;
    // sheet() 的绕序法线是 -cross(du,dv)：镜像那一面才朝 +z（正面），直接那一面朝 -z
    b.sheet(i % 2 === 1 ? CLOTH : SEA, 1, 3, cloth(true, x0, x1), { grain: 0.02 });
    b.sheet(CLOTH_BACK, 1, 3, cloth(false, x0, x1), { tint: 0.94, grain: 0.02 });
  }
  for (const side of [-1, 1]) {
    const x = side * (halfSpan + 0.06);
    for (const mirror of [false, true]) {
      b.sheet(
        mirror ? (side > 0 ? SEA : CLOTH) : CLOTH_BACK,
        1,
        2,
        (u, v) => {
          const px = x + side * u * 0.1;
          const py = BANNER_BOTTOM + 0.02 - v * (0.24 + u * 0.05);
          return [mirror ? -px : px, py, mirror ? -0.02 : 0.02];
        },
        { tint: mirror ? 1 : 0.9, grain: 0.02 },
      );
    }
  }

  // ── 6. 下沿：两道麻绳（最低点仍 ≥1.05）+ 中间吊着的贝壳与浮木 ──
  const ropes = [
    { y: 1.33, sag: 0.06, color: ROPE },
    { y: 1.14, sag: 0.05, color: ROPE_LIGHT },
  ] as const;
  for (const rope of ropes) {
    const nodes: V3[] = [];
    const steps = 3;
    for (let i = 0; i <= steps; i += 1) {
      const u = i / steps;
      nodes.push([-POST_X + u * POST_X * 2, rope.y - Math.sin(Math.PI * u) * rope.sag, 0]);
    }
    for (let i = 0; i < steps; i += 1) {
      b.rod(rope.color, nodes[i], nodes[i + 1], 0.022, 0.022, 4, { cap: false, grain: 0.05 });
    }
  }
  // 挂饰：贝壳与浮木，全部落在 1.06–1.28 之间
  const hangers = [
    [-0.66, 'shell'],
    [-0.22, 'wood'],
    [0.22, 'shell'],
    [0.66, 'wood'],
  ] as const;
  for (const [x, kind] of hangers) {
    if (kind === 'shell') {
      b.ellipsoid(SHELL, [0.075, 0.055, 0.045], [x, 1.19, 0.01], 4, { grain: 0.04 });
      b.box(SHELL_DARK, [0.06, 0.03, 0.05], [x, 1.25, 0.01], [0, 0, 0], { grain: 0.04 });
    } else {
      b.box(DRIFT_DARK, [0.05, 0.16, 0.045], [x, 1.19, 0.01], [0, 0, x > 0 ? 0.16 : -0.16], { grain: 0.06 });
      b.rod(ROPE, [x, 1.27, 0.01], [x, 1.33, 0.01], 0.012, 0.012, 4, { cap: false });
    }
  }

  // ── 7. 两根立柱各挂一个救生圈（挂在柱内侧，底边 ≥1.15）──
  for (const side of [-1, 1]) {
    const cx = side * 0.95;
    const cy = 1.74;
    b.torus(RING_ORANGE, 0.22, 0.05, [cx, cy, 0.105], [0, 0, 0], 3, 8);
    for (const angle of [0.6, 3.2]) {
      b.box(RING_WHITE, [0.055, 0.055, 0.11], [cx + Math.cos(angle) * 0.22, cy + Math.sin(angle) * 0.22, 0.105], [
        0,
        0,
        angle,
      ]);
    }
    b.rod(ROPE, [cx, cy + 0.26, 0.06], [side * POST_X, 2.4, 0.02], 0.016, 0.016, 4, { cap: false });
  }

  return b.build();
}
