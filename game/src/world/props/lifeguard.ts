import * as THREE from 'three';
import { MeshBuilder } from './build';
import type { V3 } from './build';

/** 尺寸硬约束：底座占地 2.2×2.2m，总高 4.2m（含旗杆） */
const HALF = 1.1;
const POST_X = HALF - 0.18;
const DECK_Y = 2.06;
const CABIN_H = 1.16;
const ROOF_Y = 3.34;
const FLAG_TOP = 4.2;

const WHITE = 0xf2efe6;
const WHITE_DARK = 0xd9d3c2;
const RED = 0xd0563f;
const RED_DARK = 0xb2452f;
const DECK_WOOD = 0xb08f63;
const DECK_WOOD_DARK = 0x8b7050;
const CONCRETE = 0xc3bcac;
const GLASS = 0x3a4650;
const ROPE = 0xd8c9a6;

const STEPS = 5;
const TREAD_DEPTH = 0.32;
const TREAD_FRONT_Z = 1.18;
const treadY = (i: number): number => ((i + 1) / STEPS) * DECK_Y;
const treadZ = (i: number): number => TREAD_FRONT_Z + (STEPS - 1 - i) * TREAD_DEPTH;

/** 一只救生圈：环 + 三道红箍 + 两条吊绳 */
function lifeRing(b: MeshBuilder): void {
  const x = 0.74;
  const y = 2.42;
  const z = 0.99;
  b.torus(0xeee4cf, 0.25, 0.068, [x, y, z], [0, 0, 0], 5, 8);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    b.box(RED, [0.15, 0.13, 0.15], [x + Math.cos(a) * 0.25, y + Math.sin(a) * 0.25, z], [0, 0, a]);
  }
  b.rod(ROPE, [x - 0.15, y + 0.21, z], [x - 0.11, y + 0.42, z], 0.011, 0.011, 4, { cap: false });
  b.rod(ROPE, [x + 0.15, y + 0.21, z], [x + 0.11, y + 0.42, z], 0.011, 0.011, 4, { cap: false });
}

/** 三段楼梯：5 级踏步 + 双斜梁 + 扶手立柱 */
function stairs(b: MeshBuilder, railTop: number): void {
  for (let i = 0; i < STEPS; i += 1) {
    b.box(DECK_WOOD, [0.82, 0.055, TREAD_DEPTH - 0.02], [0, treadY(i) - 0.028, treadZ(i)], [0, 0, 0], {
      tint: 0.92 + (i % 3) * 0.05,
      grain: 0.045,
    });
    if (i < 4) b.box(DECK_WOOD_DARK, [0.82, 0.075, 0.03], [0, treadY(i) - 0.09, treadZ(i) + TREAD_DEPTH / 2 - 0.03]);
  }
  for (const x of [-0.44, 0.44]) {
    b.beam(DECK_WOOD_DARK, [x, 0.06, treadZ(0) + 0.18], [x, DECK_Y - 0.04, treadZ(STEPS - 1) - 0.1], 0.05, 0.13);
  }
  // 扶手立柱（把扶手和斜梁连起来，楼梯才站得住）
  for (const x of [-0.47, 0.47]) {
    for (const i of [0, 3]) {
      b.box(WHITE_DARK, [0.045, 0.86, 0.045], [x, treadY(i) + 0.42, treadZ(i) - 0.02]);
    }
  }
  for (const x of [-0.47, 0.47]) {
    b.rod(WHITE, [x, treadY(0) + 0.86, treadZ(0) - 0.02], [x, railTop - 0.02, treadZ(STEPS - 1) - 0.02], 0.028, 0.028, 4, {
      cap: false,
    });
  }
}

export function createLifeguardGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const railTop = DECK_Y + 0.94;

  // ---- 主形：4 根支柱 + 混凝土基础 ----
  for (const sx of [-POST_X, POST_X]) {
    for (const sz of [-POST_X, POST_X]) {
      b.box(CONCRETE, [0.28, 0.07, 0.28], [sx, 0.035, sz], [0, 0, 0], { grain: 0.04 });
      b.box(WHITE, [0.115, DECK_Y, 0.115], [sx, DECK_Y / 2 + 0.05, sz], [0, 0, 0], { ao: 1.6, grain: 0.02 });
    }
  }

  // ---- 结构件：两面的斜撑（X 形，撑住平台） ----
  for (const sz of [-POST_X, POST_X]) {
    b.rod(WHITE_DARK, [-POST_X, 0.14, sz], [POST_X, DECK_Y - 0.1, sz], 0.03, 0.026, 4, { cap: false });
    b.rod(WHITE_DARK, [POST_X, 0.14, sz], [-POST_X, DECK_Y - 0.1, sz], 0.03, 0.026, 4, { cap: false });
  }

  // ---- 主形：平台 + 边梁 ----
  b.box(DECK_WOOD, [2.0, 0.12, 2.0], [0, DECK_Y + 0.06, 0], [0, 0, 0], { grain: 0.04 });
  b.box(WHITE, [2.06, 0.055, 0.07], [0, DECK_Y + 0.135, -0.985]);
  b.box(WHITE, [0.07, 0.055, 2.06], [0.985, DECK_Y + 0.135, 0]);
  b.box(WHITE, [0.07, 0.055, 2.06], [-0.985, DECK_Y + 0.135, 0]);

  // ---- 结构件：平台栏杆（角柱 + 扶手 + 立杆，正前方给楼梯留口） ----
  for (const sx of [-0.94, 0.94]) {
    for (const sz of [-0.94, 0.94]) b.box(WHITE, [0.06, 0.86, 0.06], [sx, railTop - 0.43, sz]);
  }
  b.box(WHITE, [2.0, 0.05, 0.06], [0, railTop, -0.94]);
  b.box(WHITE, [0.06, 0.05, 2.0], [0.94, railTop, 0]);
  b.box(WHITE, [0.06, 0.05, 2.0], [-0.94, railTop, 0]);
  for (const sx of [-0.72, 0.72]) b.box(WHITE, [0.42, 0.05, 0.06], [sx, railTop, 0.94]);
  for (const sx of [-0.5, 0.5]) {
    b.box(WHITE, [0.035, 0.78, 0.035], [sx, railTop - 0.44, 0.94]);
    b.box(WHITE, [0.035, 0.78, 0.035], [sx, railTop - 0.44, -0.94]);
  }

  // ---- 主形：观察台（白墙 + 红白条纹 + 三面玻璃） ----
  const cabinY = DECK_Y + 0.12 + CABIN_H / 2;
  b.box(WHITE, [1.36, CABIN_H, 1.36], [0, cabinY, 0], [0, 0, 0], { grain: 0.02 });
  b.box(RED, [1.39, 0.18, 1.39], [0, cabinY - 0.36, 0], [0, 0, 0], { tint: 0.98 });
  b.box(RED, [1.39, 0.1, 1.39], [0, cabinY + 0.42, 0], [0, 0, 0], { tint: 0.94 });
  b.box(RED_DARK, [1.395, 0.03, 1.395], [0, cabinY - 0.24, 0]);
  b.box(GLASS, [1.02, 0.4, 0.03], [0, cabinY + 0.06, 0.685]);
  b.box(GLASS, [0.03, 0.4, 0.94], [0.685, cabinY + 0.06, 0]);
  b.box(GLASS, [0.03, 0.4, 0.94], [-0.685, cabinY + 0.06, 0]);

  // ---- 结构件：四坡屋顶（红）+ 檐口 ----
  const eave = 1.02;
  const roofApex: V3 = [0, ROOF_Y + 0.24, 0];
  const corners: V3[] = [
    [eave, ROOF_Y, eave],
    [eave, ROOF_Y, -eave],
    [-eave, ROOF_Y, -eave],
    [-eave, ROOF_Y, eave],
  ];
  for (let i = 0; i < 4; i += 1) b.poly(RED, [roofApex, corners[i], corners[(i + 1) % 4]], { up: true });
  b.box(WHITE_DARK, [2.12, 0.05, 0.07], [0, ROOF_Y - 0.01, eave]);
  b.box(WHITE_DARK, [0.07, 0.05, 2.12], [eave, ROOF_Y - 0.01, 0]);

  // ---- 点缀：旗杆 + 旗 ----
  const poleX = 0.6;
  const poleZ = -0.6;
  b.rod(WHITE_DARK, [poleX, ROOF_Y + 0.1, poleZ], [poleX, FLAG_TOP, poleZ], 0.032, 0.022, 5, { cap: false });
  for (const side of [1, -1]) {
    b.sheet(
      side > 0 ? RED : RED_DARK,
      2,
      1,
      (u, v) => {
        const x = poleX + 0.06 + u * 0.46;
        const y = FLAG_TOP - 0.04 - v * 0.28 - Math.sin(u * Math.PI) * 0.05;
        return [x, y, poleZ + Math.sin(u * Math.PI * 1.2 + side * 0.2) * 0.05 + side * 0.008];
      },
      side > 0 ? { up: true, shade: 1 } : { down: true, tint: 0.85 },
    );
  }

  // ---- 结构件：三段楼梯 ----
  stairs(b, railTop);

  // ---- 点缀：挂着的救生圈 ----
  lifeRing(b);

  return b.build();
}
