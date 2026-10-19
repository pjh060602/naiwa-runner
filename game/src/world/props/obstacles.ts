import * as THREE from 'three';
import { MeshBuilder } from './build';

/**
 * 五种障碍物的外形。碰撞盒在 world/obstacles.ts 里，一个数都不许动：
 *   benchObstacle  halfWidth 0.78  halfDepth 0.34  y 0    → 0.4
 *   bollardObstacle halfWidth 0.85  halfDepth 0.78  y 0    → 1.8
 *   awningBar       halfWidth 1.22  halfDepth 0.66  y 1.2  → 2.5
 *   signpost        halfWidth 0.2   halfDepth 0.2   y 0    → 6
 *   gull            halfWidth 0.3   halfDepth 0.42  y 0    → 0.52
 * 全部正面朝 +z（玩家从 +z 跑过来），原点在地面中心。
 */

const DISC = 0x9c8f6f;
const WHITE = 0xf2efe6;
const WHITE_DARK = 0xd9d4c4;
const BLUE = 0x3f7f9c;
const BLUE_DEEP = 0x2f6b8a;
const NAVY = 0x2f4f6b;
const WOOD = 0x8a6a45;
const WOOD_DARK = 0x6f5334;
const CLOTH = 0x56a6c4;
const CLOTH_LIGHT = 0xd8f0f7;
const CLOTH_EDGE = 0xf4f1e4;
const ROPE = 0xd8c9a6;
const IRON = 0x8a8f98;
const IRON_DARK = 0x5f656c;

/**
 * 沙滩椅（原 stool · jump）：1.56 × 0.68 × 0.4m。
 * 低矮折叠木架 + 蓝白布面 + 压得很低的靠背，一眼看出「跨过去」。
 */
export function createBenchObstacleGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const halfW = 0.78;
  const halfD = 0.34;
  const seatY = 0.29;

  b.disc(DISC, 0.74, 0.31, [0, 0.004, 0], 16);

  // 主形：两侧折叠木架（座梁 + 斜腿）
  for (const z of [-halfD + 0.05, halfD - 0.05]) {
    b.box(WOOD, [halfW * 2 - 0.06, 0.05, 0.05], [0, seatY, z], [0, 0, 0], { tint: 0.98, grain: 0.05, ao: 0.7 });
    for (const x of [-0.6, 0.6]) {
      b.box(WOOD_DARK, [0.05, seatY, 0.045], [x, seatY / 2, z], [0, 0, x > 0 ? -0.1 : 0.1], { grain: 0.04 });
    }
  }
  b.box(WOOD_DARK, [0.04, 0.035, halfD * 2 - 0.1], [-0.6, 0.1, 0], [0, 0, 0], { grain: 0.04 });
  b.box(WOOD_DARK, [0.04, 0.035, halfD * 2 - 0.1], [0.6, 0.1, 0], [0, 0, 0], { grain: 0.04 });

  // 主形：布面 6 条（蓝白相间，中间微垂）
  for (let i = 0; i < 6; i += 1) {
    const x = -0.45 + i * 0.18;
    const sag = Math.sin((i / 5) * Math.PI) * 0.012;
    b.box(i % 2 === 0 ? CLOTH : CLOTH_LIGHT, [0.15, 0.022, halfD * 2 - 0.1], [x, seatY + 0.03 - sag, 0], [0, 0, 0], {
      tint: 0.95 + (i % 2) * 0.05,
      grain: 0.03,
    });
  }

  // 结构件：后侧一道压得很低的靠背（整体仍在 0.4m 碰撞高度内）
  b.box(WOOD, [halfW * 2 - 0.1, 0.024, 0.12], [0, 0.345, -halfD + 0.06], [-0.42, 0, 0], { grain: 0.05 });
  b.box(CLOTH_EDGE, [halfW * 2 - 0.18, 0.018, 0.1], [0, 0.362, -halfD + 0.055], [-0.42, 0, 0], { grain: 0.03 });

  // 点缀：搭在椅面上的折叠毛巾 + 铆钉
  b.box(0xece3cd, [0.28, 0.03, 0.16], [0.3, seatY + 0.055, 0.02], [0, 0.12, 0], { grain: 0.03 });
  for (const x of [-0.66, 0.66]) {
    b.box(IRON, [0.026, 0.026, 0.055], [x, seatY + 0.01, halfD - 0.05]);
  }

  return b.build();
}

/**
 * 系船柱（原 cart · lane）：1.7 × 1.56 × 1.8m。
 * 加宽八边形基座 + 锥形柱身 + 两道蓝箍 + 圆帽 + 缠绕的缆绳。
 */
export function createBollardObstacleGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();

  b.disc(DISC, 0.78, 0.7, [0, 0.004, 0], 16);

  // 结构件：加宽基座（两级）
  b.cyl(IRON, 0.75, 0.77, 0.11, [0, 0.055, 0], 8, [0, 0, 0], { grain: 0.03, ao: 1.2 });
  b.cyl(IRON_DARK, 0.48, 0.6, 0.1, [0, 0.16, 0], 6, [0, 0, 0], { grain: 0.03 });

  // 主形：锥形柱身
  b.cyl(WHITE, 0.25, 0.31, 1.3, [0, 0.86, 0], 8, [0, 0, 0], { cap: false, grain: 0.02, ao: 1.8 });

  // 结构件：两道蓝箍
  b.cyl(NAVY, 0.295, 0.305, 0.1, [0, 0.6, 0], 8, [0, 0, 0], { cap: false });
  b.cyl(NAVY, 0.27, 0.28, 0.09, [0, 1.18, 0], 8, [0, 0, 0], { cap: false });

  // 圆帽
  b.cyl(WHITE, 0.17, 0.26, 0.15, [0, 1.59, 0], 8, [0, 0, 0], { cap: false, grain: 0.02 });
  b.sphere(WHITE_DARK, 0.115, [0, 1.68, 0], 5);

  // 点缀：缠绕的缆绳 + 垂下的绳头
  b.torus(ROPE, 0.29, 0.035, [0, 0.92, 0], [Math.PI / 2, 0, 0.12], 4, 8);
  b.rod(ROPE, [0.24, 0.9, 0.16], [0.31, 0.55, 0.26], 0.026, 0.02, 3, { cap: false });
  b.rod(ROPE, [0.28, 0.55, 0.24], [0.19, 0.17, 0.33], 0.02, 0.016, 3, { cap: false });

  return b.build();
}

/**
 * 海滨遮阳棚横杆（原 awning · slide）：碰撞盒 2.44 × 1.32m，最低点 1.2m。
 * 白柱 + 蓝白横梁正压在 1.19–1.31m，两端比柱子长出来 —— 一眼就是「低头钻」。
 */
export function createAwningBarGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const barY = 1.25;
  const span = 2.44;
  const postX = 1.05;
  const segments = 5;
  const step = span / segments;

  b.disc(DISC, 0.6, 0.42, [0, 0.004, 0], 16);

  // 结构件：两根白柱只到横梁高度（碰撞盒 minY = 1.2，柱子做高了会穿帮）
  for (const x of [-postX, postX]) {
    b.box(WHITE, [0.11, 0.07, 0.11], [x, 0.035, 0], [0, 0, 0], { grain: 0.02 });
    b.cyl(WHITE, 0.055, 0.065, 1.2, [x, 0.6, 0], 8, [0, 0, 0], { cap: false, ao: 1.4 });
    b.cyl(WHITE_DARK, 0.075, 0.075, 0.05, [x, 1.22, 0], 8, [0, 0, 0], { cap: false });
  }

  // 主形：蓝白相间的横梁（5 段正好 2.44m，两端露在柱子外面）
  for (let i = 0; i < segments; i += 1) {
    const x = -span / 2 + step / 2 + i * step;
    b.box(i % 2 === 0 ? WHITE : BLUE, [step, 0.12, 0.13], [x, barY, 0], [0, 0, 0], {
      tint: i % 2 === 0 ? 1 : 0.96,
      grain: 0.02,
    });
  }

  // 主形：横梁上方的条纹篷布（向后上方斜，最低处也在 1.31m 以上）
  const frontZ = -0.07;
  const backZ = -0.64;
  const frontY = barY + 0.08;
  const backY = barY + 0.62;
  for (let i = 0; i < segments; i += 1) {
    const x0 = -span / 2 + i * step;
    const x1 = x0 + step;
    const color = i % 2 === 0 ? WHITE : BLUE_DEEP;
    for (const side of [1, -1]) {
      b.sheet(
        color,
        1,
        2,
        (u, v) => {
          const x = x0 + (x1 - x0) * u;
          const z = frontZ + (backZ - frontZ) * v;
          const y = frontY + (backY - frontY) * v - Math.sin(u * Math.PI) * 0.02;
          return [x, y + side * 0.011, z];
        },
        side > 0 ? { up: true, shade: 1 } : { down: true, tint: 0.86 },
      );
    }
    // 篷布前沿的垂边：统一压成深靛，远看是一条明确的深色边（不是跟着瓣色一起退成灰）
    b.quad(
      NAVY,
      [x0, frontY, frontZ],
      [x1, frontY, frontZ],
      [x1, frontY - 0.055, frontZ + 0.015],
      [x0, frontY - 0.055, frontZ + 0.015],
      { tint: 0.92 },
    );
  }
  // 篷布尾端横杆 + 两根斜撑（从柱顶撑到篷布后缘）
  b.box(WHITE_DARK, [span, 0.05, 0.06], [0, backY, backZ], [0, 0, 0]);
  for (const x of [-postX, postX]) {
    b.rod(WHITE_DARK, [x, frontY, frontZ], [x, backY, backZ], 0.022, 0.022, 4, { cap: false });
  }

  return b.build();
}

/**
 * 海滨路标（原 pole · lane）：碰撞盒 0.4 × 0.4m，柱高上限 6m
 * （牌子比碰撞盒宽是既有做法：旧版也是 0.7m 的牌配 0.4m 的盒子）。
 */
export function createSignpostGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const postHeight = 4.55;

  b.disc(DISC, 0.27, 0.27, [0, 0.004, 0], 16);

  // 结构件：混凝土底座 + 柱脚
  b.box(WHITE_DARK, [0.34, 0.1, 0.34], [0, 0.05, 0], [0, 0, 0], { grain: 0.04 });
  b.box(IRON, [0.24, 0.06, 0.24], [0, 0.13, 0], [0, 0, 0]);

  // 主形：立柱 + 柱顶帽
  b.cyl(IRON, 0.07, 0.09, postHeight, [0, postHeight / 2 + 0.1, 0], 8, [0, 0, 0], { cap: false, grain: 0.02, ao: 1.8 });
  b.cyl(IRON_DARK, 0.09, 0.09, 0.06, [0, postHeight + 0.1, 0], 8, [0, 0, 0], { cap: false });

  // 主形：蓝方向牌（带箭头）/ 白距离牌 / 红边警示牌，全部朝 +z，集中在 3.0–4.3m
  b.box(BLUE, [1.1, 0.42, 0.05], [0, 4.2, 0], [0, 0, 0], { grain: 0.02 });
  b.box(WHITE, [0.72, 0.075, 0.02], [-0.08, 4.2, 0.035]);
  b.box(WHITE, [0.2, 0.3, 0.02], [0.38, 4.2, 0.035]);

  b.box(WHITE, [0.86, 0.38, 0.045], [0, 3.62, 0], [0, 0, 0], { grain: 0.02 });
  b.box(NAVY, [0.64, 0.07, 0.02], [0, 3.71, 0.032]);
  b.box(NAVY, [0.4, 0.06, 0.02], [0, 3.53, 0.032]);

  b.box(0xd0563f, [0.56, 0.56, 0.03], [0, 3.0, 0], [0, 0, 0]);
  b.box(0xe8e4d6, [0.44, 0.44, 0.02], [0, 3.0, 0.025]);
  b.box(NAVY, [0.1, 0.3, 0.015], [0, 3.0, 0.04]);

  // 点缀：两处抱箍 + 螺栓
  for (const y of [3.86, 3.32]) {
    b.box(IRON_DARK, [0.19, 0.065, 0.19], [0, y, 0], [0, 0, 0]);
  }
  b.box(WHITE, [0.026, 0.026, 0.026], [0.1, 3.86, 0.1]);
  b.box(WHITE, [0.026, 0.026, 0.026], [-0.1, 3.32, -0.1]);

  return b.build();
}

/**
 * 地面海鸥（原 cat · jump）：碰撞盒 0.6 × 0.84 × 0.52m，正面朝 +z。
 *
 * 姿态取「受惊起飞前半拍」：身体前倾、颈子拉长、头微抬，双翼半张，
 * 上臂段向后外展、前臂段折向上，初级飞羽在腕部向后上方散开 —— 一只正要起飞的鸟挡在跑道上。
 * 五档以上明度：背深灰 / 腹白 / 翼中灰 / 翼尖近黑 / 喙橙黄 / 腿粉橙。
 */
export function createGullGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const BELLY = 0xf7f7f3;
  const BACK = 0x8b949c;
  const WING = 0xb9c2c8;
  const WING_DARK = 0x353b42;
  const BEAK = 0xe8a93b;
  const BEAK_DARK = 0xc9862a;
  const LEG = 0xe0906a;
  const EYE_RING = 0xeef1f3;
  const EYE = 0x22262b;

  b.disc(DISC, 0.26, 0.3, [0, 0.004, 0], 16);

  // ---- 身体：椭球分两段上色（下腹白 / 上背深灰），整体前倾 9° ----
  const cx = 0;
  const cy = 0.24;
  const cz = -0.015;
  const rx = 0.145;
  const ry = 0.12;
  const rz = 0.23;
  const pitch = 0.16;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const bodyPoint = (lon: number, lat: number): [number, number, number] => {
    const lx = Math.sin(lon) * Math.cos(lat) * rx;
    const ly = Math.sin(lat) * ry;
    const lz = Math.cos(lon) * Math.cos(lat) * rz;
    return [cx + lx, cy + ly * cosP - lz * sinP, cz + ly * sinP + lz * cosP];
  };
  const bands: { color: number; lat0: number; lat1: number }[] = [
    { color: BELLY, lat0: -Math.PI / 2, lat1: -0.35 },
    { color: BACK, lat0: -0.35, lat1: Math.PI / 2 },
  ];
  for (const band of bands) {
    b.sheet(
      band.color,
      10,
      2,
      (u, v) => bodyPoint(u * Math.PI * 2, band.lat0 + (band.lat1 - band.lat0) * v),
      { shade: 1, grain: 0.02 },
    );
  }

  // ---- 颈 + 头（颈子拉长、头微抬，这是「受惊」的第一笔） ----
  b.rod(BELLY, [0, 0.3, 0.08], [0, 0.392, 0.128], 0.055, 0.042, 6, { grain: 0.02 });
  const headY = 0.412;
  const headZ = 0.148;
  b.sphere(BELLY, 0.066, [0, headY, headZ], 6, { grain: 0.02 });

  // 头往一侧偏 19°：鸟的转头是最强的「活物」信号，也让游戏机位看到 3/4 的头而不是正对
  const headYaw = 0.34;
  const cosH = Math.cos(headYaw);
  const sinH = Math.sin(headYaw);
  const turn = (x: number, z: number): [number, number] => [x * cosH + z * sinH, -x * sinH + z * cosH];

  // ---- 喙：上下两片，中间留一条缝（微张嘴） ----
  const [bx, bz] = turn(0, 0.074);
  b.box(BEAK, [0.048, 0.028, 0.1], [bx, headY + 0.006, headZ + bz], [0.16, headYaw, 0], { grain: 0.02 });
  const [bx2, bz2] = turn(0, 0.066);
  b.box(BEAK_DARK, [0.04, 0.015, 0.07], [bx2, headY - 0.014, headZ + bz2], [0.24, headYaw, 0], { grain: 0.02 });

  // ---- 眼睛：浅色一圈 + 中间黑点 ----
  for (const side of [1, -1]) {
    const [ex, ez] = turn(side * 0.045, 0.028);
    const [ex2, ez2] = turn(side * 0.049, 0.036);
    b.box(EYE_RING, [0.038, 0.036, 0.026], [ex, headY + 0.016, headZ + ez], [0, side * 0.25 + headYaw, 0]);
    b.box(EYE, [0.02, 0.02, 0.022], [ex2, headY + 0.016, headZ + ez2], [0, side * 0.25 + headYaw, 0]);
  }

  // ---- 双翼：上臂段（向后外展）+ 前臂段（折向上）+ 腕部 4 根飞羽（向后上方散开） ----
  for (const side of [1, -1]) {
    const s = side;
    // 上臂：肩 → 肘，往后掠而不是往两侧张
    b.panel(
      WING,
      [
        [s * 0.07, 0.3, 0.055],
        [s * 0.07, 0.278, -0.13],
        [s * 0.198, 0.336, -0.198],
        [s * 0.198, 0.352, -0.02],
      ],
      [0, -0.019, 0],
      { grain: 0.02 },
    );
    // 前臂：肘 → 腕，折向上
    b.panel(
      WING,
      [
        [s * 0.192, 0.335, -0.19],
        [s * 0.196, 0.352, -0.015],
        [s * 0.246, 0.424, -0.075],
        [s * 0.242, 0.408, -0.21],
      ],
      [0, -0.016, 0],
      { grain: 0.02 },
    );
    // 肩部覆羽：盖住肩缝
    b.panel(
      WING,
      [
        [s * 0.048, 0.31, 0.04],
        [s * 0.048, 0.292, -0.11],
        [s * 0.128, 0.318, -0.145],
        [s * 0.128, 0.33, 0.01],
      ],
      [0, -0.022, 0],
      { tint: 0.97, grain: 0.02 },
    );
    // 初级飞羽：腕部散开 4 根，越外越黑、越外越上翘、越外越往后拖
    for (let k = 0; k < 4; k += 1) {
      const out = 0.005 * k;
      b.panel(
        WING_DARK,
        [
          [s * (0.228 - out), 0.408 - k * 0.004, -0.085 - k * 0.012],
          [s * (0.222 - out), 0.392 - k * 0.004, -0.115 - k * 0.012],
          [s * (0.272 - out * 1.5), 0.474 - k * 0.012, -0.235 - k * 0.022],
          [s * (0.281 - out * 1.5), 0.49 - k * 0.012, -0.205 - k * 0.022],
        ],
        [0, -0.007, 0],
        { tint: 1 - k * 0.03, grain: 0.02 },
      );
    }
  }

  // ---- 尾羽：三片扇形白羽，微微翘起 ----
  for (let k = -1; k <= 1; k += 1) {
    b.panel(
      BELLY,
      [
        [k * 0.03, 0.206, -0.19],
        [k * 0.03 + 0.05, 0.203, -0.193],
        [k * 0.08 + 0.052, 0.262, -0.365],
        [k * 0.08, 0.266, -0.36],
      ],
      [0, -0.008, 0],
      { tint: 0.95 + (k + 1) * 0.02, grain: 0.02 },
    );
  }

  // ---- 腿：大腿 + 胫骨 + 蹼足（粉橙一档） ----
  for (const side of [1, -1]) {
    b.rod(LEG, [side * 0.05, 0.2, -0.015], [side * 0.058, 0.1, 0.015], 0.017, 0.013, 4, { cap: false, grain: 0.02 });
    b.rod(LEG, [side * 0.058, 0.1, 0.015], [side * 0.058, 0.024, 0.032], 0.012, 0.01, 4, { cap: false, grain: 0.02 });
    b.panel(
      LEG,
      [
        [side * 0.024, 0.012, 0.0],
        [side * 0.092, 0.012, 0.012],
        [side * 0.068, 0.012, 0.1],
        [side * 0.032, 0.012, 0.056],
      ],
      [0, -0.01, 0],
      { grain: 0.02 },
    );
  }

  return b.build();
}