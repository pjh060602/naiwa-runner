import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { MeshBuilder } from './build';

/** 尺寸硬约束：长 1.8m（x）× 宽 0.65m（z）× 座高 0.35m（靠背翻起不计入座高） */
const LENGTH = 1.8;
const WIDTH = 0.65;
const SEAT_Y = 0.35;
/** 靠背翻起的角度：躺椅是「有人刚起身」的样子，不是一块平板 */
const BACK_TILT = -0.62;

const WOOD = PALETTE.benchWood;
const WOOD_DARK = 0x7a5b3a;
const FABRIC = 0xf0ead8;
const FABRIC_DARK = 0xd9d0ba;
const IRON = 0x8b9096;
const BOLT = 0x6f757c;

/** 侧面一根长梁 + 前后两条腿 */
function sideRail(b: MeshBuilder, z: number): void {
  b.box(WOOD, [LENGTH, 0.055, 0.05], [0, SEAT_Y - 0.03, z], [0, 0, 0], { tint: 0.98, grain: 0.05, ao: 0.6 });
  for (const x of [-0.62, 0.62]) {
    b.box(WOOD_DARK, [0.05, SEAT_Y - 0.05, 0.048], [x, (SEAT_Y - 0.05) / 2, z], [0, 0, x > 0 ? -0.06 : 0.06], {
      grain: 0.04,
    });
  }
}

export function createLoungerGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();

  // ---- 主形：两根纵向主梁 + 四条腿 ----
  sideRail(b, -WIDTH / 2 + 0.03);
  sideRail(b, WIDTH / 2 - 0.03);

  // ---- 结构件：横向底撑（把两根主梁连起来） ----
  for (const x of [-0.62, 0.62]) {
    b.box(WOOD_DARK, [0.045, 0.042, WIDTH - 0.06], [x, 0.095, 0], [0, 0, 0], { grain: 0.04 });
  }

  // ---- 主形：座面布条（5 条，色差 + 微垂） ----
  const slats = 5;
  for (let i = 0; i < slats; i += 1) {
    const x = -0.42 + (i / (slats - 1)) * 0.86;
    b.box(i % 2 === 0 ? FABRIC : FABRIC_DARK, [0.16, 0.028, WIDTH - 0.09], [x, SEAT_Y, 0], [0, 0, 0], {
      tint: 0.94 + (i % 3) * 0.04,
      grain: 0.03,
    });
  }

  // ---- 主形：翻起的靠背（4 条板随倾斜角排布，整体不越过 0.9m 半长） ----
  for (let i = 0; i < 4; i += 1) {
    const t = i / 3;
    const y = SEAT_Y + 0.05 + t * 0.32;
    const x = -0.62 - t * 0.14;
    b.box(WOOD, [0.22, 0.028, WIDTH - 0.1], [x, y, 0], [0, 0, BACK_TILT], {
      tint: 0.92 + (i % 2) * 0.08,
      grain: 0.05,
    });
  }
  for (const z of [-WIDTH / 2 + 0.04, WIDTH / 2 - 0.04]) {
    b.box(WOOD_DARK, [0.042, 0.44, 0.042], [-0.73, SEAT_Y + 0.22, z], [0, 0, BACK_TILT], { grain: 0.04 });
  }

  // ---- 结构件：铰接轴 + 靠背支撑臂 ----
  for (const z of [-WIDTH / 2 + 0.04, WIDTH / 2 - 0.04]) {
    b.cyl(IRON, 0.022, 0.022, 0.07, [-0.6, SEAT_Y + 0.04, z], 6, [Math.PI / 2, 0, 0], { cap: false });
    b.rod(IRON, [-0.64, SEAT_Y + 0.1, z], [-0.87, SEAT_Y + 0.42, z], 0.014, 0.014, 4, { cap: false });
  }

  // ---- 点缀：螺栓 / 脚垫 / 卷在座面上的毛巾 ----
  for (const z of [-WIDTH / 2 + 0.03, WIDTH / 2 - 0.03]) {
    b.box(BOLT, [0.03, 0.03, 0.02], [0.55, SEAT_Y - 0.02, z]);
  }
  for (const x of [-0.62, 0.62]) {
    b.box(WOOD_DARK, [0.07, 0.022, WIDTH - 0.06], [x, 0.011, 0]);
  }
  b.cyl(0xe8dfc9, 0.055, 0.055, 0.32, [0.3, SEAT_Y + 0.055, 0.02], 8, [0, 0, Math.PI / 2], { grain: 0.03 });

  return b.build();
}
