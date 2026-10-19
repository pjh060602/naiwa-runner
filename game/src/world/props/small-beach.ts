import * as THREE from 'three';
import { MeshBuilder } from './build';

/**
 * 沙滩小物件：贝壳 / 沙桶 / 沙堡 / 翻倒的沙滩球。
 * 每件 ≤ 60 tris，给 park.ts 挂一个 InstancedMesh 层补中段沙滩的空。
 * 原点都在贴沙面的位置，正面朝 +z，随机 yaw 即可。
 */

const SHELL = 0xf4e8d8;
const SHELL_RIDGE = 0xe0c8b0;
const SHELL_HINGE = 0xc9a78a;

const BUCKET = 0xd2563f;
const BUCKET_DARK = 0xb2432f;
const BUCKET_RIM = 0xe8ddc9;
const METAL = 0x8a8f98;

const SAND_WET = 0xcdb287;
const SAND_DARK = 0xb69a6f;
const SAND_DRY = 0xdcc9a2;
const SAND_SHADOW = 0x9d8258;

const BALL = [0xe0503f, 0xf2efe6, 0x3f7f9c, 0xe3c04a];

/**
 * 贝壳（扇贝）：6 瓣扇面 + 铰点，36 tris。
 * 每瓣是一个扇形四边面，外缘抬起做出贝壳的弧度，正反两面都建。
 */
export function createShellGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const sectors = 6;
  const radius = 0.1;
  const spread = (Math.PI * 2 * 68) / 360;
  const thickness = 0.013;
  /** 扇面整体抬起 34°：贝壳是斜插在沙里的，平躺会看不见 */
  const tilt = 0.6;
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);

  for (let i = 0; i < sectors; i += 1) {
    const a0 = -spread / 2 + (i / sectors) * spread;
    const a1 = -spread / 2 + ((i + 1) / sectors) * spread;
    const color = i % 2 === 0 ? SHELL : SHELL_RIDGE;
    const point = (a: number, v: number, side: number): [number, number, number] => {
      const x = Math.sin(a) * radius * v;
      const y = thickness * side + Math.pow(v, 1.6) * 0.02;
      const z = Math.cos(a) * radius * v;
      return [x, y * cosTilt + z * sinTilt + 0.004, -y * sinTilt + z * cosTilt];
    };
    // 正面（法线朝上）：铰点 → 外缘 a0 → 外缘 a1
    b.quad(color, point(a0, 0, 1), point(a0, 1, 1), point(a1, 1, 1), point(a1, 0, 1), { up: true, grain: 0.03 });
    b.quad(color, point(a0, 0, -1), point(a1, 0, -1), point(a1, 1, -1), point(a0, 1, -1), {
      down: true,
      tint: 0.85,
      grain: 0.03,
    });
  }
  // 铰点：贝壳根部那一小块
  b.box(SHELL_HINGE, [0.042, 0.03, 0.028], [0, 0.014, -0.004], [0.3, 0, 0], { grain: 0.04 });
  return b.build();
}

/** 沙桶：锥形桶身 + 桶底 + 桶口箍 + 圆弧提手，58 tris */
export function createBucketGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  b.cyl(BUCKET, 0.095, 0.075, 0.19, [0, 0.095, 0], 8, [0, 0, 0], { cap: false, grain: 0.04, ao: 0.5 });
  b.disc(BUCKET_DARK, 0.077, 0.077, [0, 0.004, 0], 8);
  b.cyl(BUCKET_RIM, 0.1, 0.098, 0.028, [0, 0.185, 0], 8, [0, 0, 0], { cap: false, tint: 1 });
  // 提手：四段圆弧，才像倒提着的铁线而不是两根斜棍
  const arc: [number, number, number][] = [];
  for (let i = 0; i <= 3; i += 1) {
    const angle = (i / 3) * Math.PI;
    arc.push([-Math.cos(angle) * 0.098, 0.198 + Math.sin(angle) * 0.085, 0]);
  }
  for (let i = 0; i < 3; i += 1) {
    b.rod(METAL, arc[i], arc[i + 1], 0.0065, 0.0065, 3, { cap: false });
  }
  return b.build();
}

/** 沙堡：两级砂塔 + 拱门 + 小旗，58 tris */
export function createSandcastleGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  // 下塔：六边形收分
  b.cyl(SAND_WET, 0.155, 0.17, 0.16, [0, 0.08, 0], 5, [0, 0.2, 0], { grain: 0.06, ao: 0.5 });
  // 上塔：四棱，转 45° 才有「堡」的棱角
  b.cyl(SAND_DARK, 0.072, 0.095, 0.17, [0, 0.245, 0], 4, [0, Math.PI / 4, 0], { grain: 0.06 });
  // 拱门：压暗一块，城堡才读得出来
  b.box(SAND_SHADOW, [0.07, 0.085, 0.05], [0, 0.045, 0.155], [0.1, 0, 0], { grain: 0.05 });
  // 垛口：干砂堆的一小段女墙
  b.box(SAND_DRY, [0.1, 0.028, 0.05], [0, 0.168, 0.05], [0, 0.35, 0], { grain: 0.05 });
  return b.build();
}

/** 翻倒的沙滩球：6 瓣 3 段 + 两个极点，48 tris */
export function createBeachBallGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const radius = 0.085;
  const gores = 6;
  const bands = 3;
  for (let s = 0; s < gores; s += 1) {
    const lon0 = (s / gores) * Math.PI * 2;
    const lon1 = ((s + 1) / gores) * Math.PI * 2;
    // u 沿经度、v 沿纬度：不传 up/down，绕序本身就朝外
    b.sheet(
      BALL[s % BALL.length],
      1,
      bands,
      (u, v) => {
        const lon = lon0 + (lon1 - lon0) * u;
        const lat = -Math.PI / 3 + (Math.PI * 2 * v) / 3;
        const r = Math.cos(lat) * radius;
        return [Math.sin(lon) * r, radius + Math.sin(lat) * radius, Math.cos(lon) * r];
      },
      { shade: 1, grain: 0.02 },
    );
  }
  // 两个极点：比球略小的圆片封口
  const capRadius = radius * Math.cos(Math.PI / 3) * 0.82;
  b.disc(0xf2efe6, capRadius, capRadius, [0, radius * 2 - 0.008, 0], 6);
  b.disc(0xd9d4c4, capRadius, capRadius, [0, 0.008, 0], 6, { down: true });
  return b.build();
}
