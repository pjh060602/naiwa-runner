import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { MeshBuilder } from './build';
import type { V3 } from './build';

/** 尺寸硬约束（布局与碰撞依赖）：总高 5.9m，杆径 0.17 → 0.09 */
const TRUNK_HEIGHT = 4.96;
const BASE_RADIUS = 0.17;
const TOP_RADIUS = 0.09;
/** 主干前倾量：不是一根直棒，重心偏出去才有热带感 */
const LEAN = 0.52;

const TRUNK = PALETTE.palmTrunk;
const TRUNK_DARK = 0x74603f;
const RING = 0x6a5538;
const LEAF = PALETTE.palmLeaf;
const LEAF_LIGHT = PALETTE.palmLeafLight;
const LEAF_DARK = 0x466c30;
const LEAF_UNDER = 0x466b34;
const NUT = 0x6b5233;

const trunkX = (t: number): number => LEAN * Math.pow(t, 1.7);
/** 根部外扩 + 沿高度的叶痕起伏 */
const trunkRadius = (t: number): number => {
  const taper = BASE_RADIUS + (TOP_RADIUS - BASE_RADIUS) * t;
  const flare = 1 + 0.42 * Math.pow(Math.max(0, 0.09 - t) / 0.09, 2);
  return taper * flare;
};

const CROWN_X = trunkX(1);
const CROWN_Y = TRUNK_HEIGHT;

const ringPoint = (centerX: number, y: number, radius: number, angle: number): V3 => [
  centerX + Math.cos(angle) * radius,
  y,
  Math.sin(angle) * radius,
];

interface FrondSpec {
  angle: number;
  reach: number;
  lift: number;
  droop: number;
  width: number;
  color: number;
}

/** 一片叶：先扬后垂，中脉抬起、叶缘下塌、叶尖更垂；正反两面都建（抬头看不能看穿） */
function frond(b: MeshBuilder, spec: FrondSpec): void {
  const dx = Math.cos(spec.angle);
  const dz = Math.sin(spec.angle);
  /** 叶片宽度方向 */
  const sx = -dz;
  const sz = dx;
  const segments = 6;

  const center = (t: number): V3 => {
    const reach = 0.22 + spec.reach * t;
    return [
      CROWN_X + dx * reach,
      CROWN_Y + Math.sin(Math.PI * Math.min(1, t * 0.6)) * spec.lift - spec.droop * Math.pow(t, 2.7),
      dz * reach,
    ];
  };
  const halfWidth = (t: number): number => {
    const profile = Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.8));
    const serration = 1 + 0.16 * Math.sin(t * 27 + spec.angle * 3) + 0.06 * Math.sin(t * 51);
    return (0.09 + spec.width * profile * (1 - 0.42 * t)) * serration;
  };
  /** u 横跨叶宽，v 沿叶长；edge 用来做 V 形折面 */
  const surface = (u: number, v: number, lift: number): V3 => {
    const c = center(v);
    const half = halfWidth(v);
    const edge = Math.abs(u - 0.5) * 2;
    const offset = (u - 0.5) * 2 * half;
    return [c[0] + sx * offset, c[1] + lift * (1 - edge) - 0.17 * edge * edge, c[2] + sz * offset];
  };

  b.sheet(spec.color, 2, segments, (u, v) => surface(u, v, 0.05), { up: true, grain: 0.035 });
  b.sheet(LEAF_UNDER, 2, segments, (u, v) => {
    const p = surface(u, v, 0.05);
    return [p[0], p[1] - 0.022, p[2]];
  }, { down: true, grain: 0.03, shade: 0.85 });

  // 中脉：一根抬起的细脊，叶面才有厚度
  const ribSegments = 3;
  for (let i = 0; i < ribSegments; i += 1) {
    const c0 = center(i / ribSegments);
    const c1 = center((i + 1) / ribSegments);
    const w0 = 0.03 * (1 - i * 0.22);
    const w1 = 0.03 * (1 - (i + 1) * 0.22);
    b.quad(
      LEAF_DARK,
      [c0[0] - sx * w0, c0[1] + 0.07, c0[2] - sz * w0],
      [c1[0] - sx * w1, c1[1] + 0.07, c1[2] - sz * w1],
      [c1[0] + sx * w1, c1[1] + 0.07, c1[2] + sz * w1],
      [c0[0] + sx * w0, c0[1] + 0.07, c0[2] + sz * w0],
      { up: true, grain: 0.02 },
    );
  }
}

/** 枯叶：垂在冠下两三片，草地上才不会有「凭空长出来的塑料树」 */
function deadFrond(b: MeshBuilder, angle: number, hang: number): void {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const sx = -dz;
  const sz = dx;
  for (const side of [1, -1]) {
    b.sheet(
      side > 0 ? 0x8a7048 : 0x74593a,
      2,
      3,
      (u, v) => {
        const reach = 0.16 + 1.35 * v;
        const y = CROWN_Y - 0.12 - hang * v - 1.25 * v * v;
        const half = 0.24 * (1 - 0.5 * v);
        const offset = (u - 0.5) * 2 * half;
        return [CROWN_X + dx * reach + sx * offset, y + side * 0.012, dz * reach + sz * offset];
      },
      side > 0 ? { up: true } : { down: true },
    );
  }
}

export function createPalmGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();

  // ---- 主形：主干（14 环 × 9 边）----
  const rings = 14;
  const sides = 9;
  for (let i = 0; i < rings; i += 1) {
    const t0 = i / rings;
    const t1 = (i + 1) / rings;
    const x0 = trunkX(t0);
    const x1 = trunkX(t1);
    const y0 = t0 * TRUNK_HEIGHT;
    const y1 = t1 * TRUNK_HEIGHT;
    // 环之间轻微起伏：远看是叶痕，不是一根光管
    const r0 = trunkRadius(t0) * (1 + 0.03 * Math.sin(i * 2.3));
    const r1 = trunkRadius(t1) * (1 + 0.03 * Math.sin((i + 1) * 2.3));
    const color = i % 2 === 0 ? TRUNK : TRUNK_DARK;
    for (let s = 0; s < sides; s += 1) {
      const a0 = (s / sides) * Math.PI * 2;
      const a1 = ((s + 1) / sides) * Math.PI * 2;
      b.quad(
        color,
        ringPoint(x0, y0, r0, a0),
        ringPoint(x1, y1, r1, a0),
        ringPoint(x1, y1, r1, a1),
        ringPoint(x0, y0, r0, a1),
        { grain: 0.06, ao: 1.2, tint: 1 - (s % 3) * 0.02 },
      );
    }
  }

  // 环状叶痕：6 道箍，近看能读出年轮
  for (let i = 0; i < 6; i += 1) {
    const t = 0.1 + i * 0.145;
    const r = trunkRadius(t);
    b.cyl(RING, r + 0.009, r + 0.012, 0.042, [trunkX(t), t * TRUNK_HEIGHT, 0], 9, [0, 0, 0], {
      cap: false,
      grain: 0.04,
      ao: 1.2,
    });
  }

  // ---- 结构件：冠部叶鞘 + 冠心 ----
  b.cyl(TRUNK_DARK, 0.1, 0.15, 0.6, [trunkX(0.94), TRUNK_HEIGHT - 0.3, 0], 9, [0, 0, 0], {
    cap: false,
    grain: 0.05,
    ao: 0.8,
  });
  b.sphere(0x6a5537, 0.165, [CROWN_X, CROWN_Y - 0.02, 0], 7, { grain: 0.05 });

  // ---- 主形：10 片叶（3 上扬 / 4 平展 / 3 下垂，冠才有层次）----
  const palette = [LEAF, LEAF_LIGHT, LEAF_DARK];
  for (let i = 0; i < 10; i += 1) {
    const tilt = i % 3;
    frond(b, {
      angle: (i / 10) * Math.PI * 2 + (i % 2 === 0 ? 0.14 : -0.1),
      reach: tilt === 0 ? 2.15 : tilt === 1 ? 2.4 : 2.55,
      lift: tilt === 0 ? 1.25 : tilt === 1 ? 0.85 : 0.42,
      droop: tilt === 0 ? 1.1 : tilt === 1 ? 1.85 : 2.6,
      width: tilt === 2 ? 0.3 : 0.34,
      color: palette[i % 3],
    });
  }
  deadFrond(b, 2.1, 0.4);
  deadFrond(b, 4.5, 0.55);

  // ---- 点缀：三颗椰果 + 果柄 ----
  for (let i = 0; i < 3; i += 1) {
    const angle = 0.7 + i * 2.1;
    const r = 0.19;
    const x = CROWN_X + Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const y = CROWN_Y - 0.24 - (i % 2) * 0.07;
    b.sphere(NUT, 0.13, [x, y, z], 6, { grain: 0.05 });
    b.rod(0x5b5136, [CROWN_X, CROWN_Y - 0.05, 0], [x, y + 0.09, z], 0.017, 0.013, 4, { cap: false });
  }

  return b.build();
}
