import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { MeshBuilder } from './build';

/** 尺寸硬约束：1.6 长（x）× 0.55 深（z）× 0.85 高（y，含靠背） */
const LENGTH = 1.6;
const SEAT_Y = 0.42;
const FRAME_X = 0.62;
/** 靠背后倾角：再大就超出 0.55m 的占地深度 */
const BACK_TILT = 0.12;

const IRON = 0x6a7172;
const IRON_DARK = 0x565c5d;
const BOLT = 0x8c9298;
const WOOD = PALETTE.benchWood;

/** 一条座板：长度定死，色差由 tint 给，板面微起拱 */
function seatSlat(b: MeshBuilder, z: number, tint: number, tilt: number): void {
  b.box(WOOD, [LENGTH, 0.04, 0.07], [0, SEAT_Y, z], [tilt, 0, 0], { tint, grain: 0.05, ao: 0.7 });
}

/**
 * 铸铁卷曲装饰：一段外卷 + 一段内收的小卷，扁铁，正反两面（正面亮、背面暗）。
 * 铸铁椅子的辨识度全在这两笔卷曲上，所以给它 6+3 段而不是 4 段。
 */
function scroll(b: MeshBuilder, x: number): void {
  const cz = 0.105;
  const cy = 0.33;
  const arcs: { radius: number; from: number; to: number; segments: number; centreZ: number; centreY: number }[] = [
    { radius: 0.088, from: -1.5, to: 1.15, segments: 6, centreZ: cz, centreY: cy },
    { radius: 0.042, from: 1.15, to: 3.5, segments: 3, centreZ: cz + 0.045, centreY: cy + 0.03 },
  ];
  const half = 0.017;
  for (const side of [1, -1]) {
    const offsetX = x + side * 0.016;
    for (const arc of arcs) {
      for (let i = 0; i < arc.segments; i += 1) {
        const a0 = arc.from + (i / arc.segments) * (arc.to - arc.from);
        const a1 = arc.from + ((i + 1) / arc.segments) * (arc.to - arc.from);
        const p = (a: number, r: number): [number, number, number] => [
          offsetX,
          arc.centreY + Math.sin(a) * r,
          arc.centreZ + Math.cos(a) * r,
        ];
        const taper = 1 - (i / arc.segments) * 0.25;
        b.quad(
          side > 0 ? IRON_DARK : IRON,
          p(a0, arc.radius + half * taper),
          p(a1, arc.radius + half * taper),
          p(a1, arc.radius - half * taper),
          p(a0, arc.radius - half * taper),
          side > 0 ? { grain: 0.03 } : { grain: 0.03, tint: 0.86 },
        );
      }
    }
  }
}

/** 铸铁腿：前腿 + 后腿 + 座框梁 + 靠背立柱 + 卷曲装饰 + 连脚垫 */
function leg(b: MeshBuilder, side: number): void {
  const x = side * FRAME_X;
  b.box(IRON, [0.04, SEAT_Y, 0.046], [x, SEAT_Y / 2, 0.185], [0, 0, side * 0.018], { grain: 0.02 });
  b.box(IRON, [0.04, 0.46, 0.046], [x, 0.23, -0.17], [-0.03, 0, side * 0.018], { grain: 0.02 });
  // 座框横梁：板条就架在这上面
  b.box(IRON, [0.048, 0.042, 0.42], [x, SEAT_Y - 0.04, 0], [0, 0, 0], { grain: 0.02 });
  // 靠背立柱（后倾）
  b.box(IRON, [0.038, 0.4, 0.038], [x, 0.62, -0.217], [-BACK_TILT, 0, 0], { grain: 0.02 });
  b.box(IRON_DARK, [0.05, 0.024, 0.05], [x, 0.828, -0.233], [-BACK_TILT, 0, 0]);
  scroll(b, x);
  // 连脚垫：前腿后腿共用一根铸铁底条
  b.box(IRON_DARK, [0.07, 0.024, 0.4], [x, 0.012, 0.005]);
}

export function createBenchGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();

  // ---- 主形：5 条座板，缝隙 + 色差不齐 ----
  const slatZ = [-0.2, -0.1, 0, 0.1, 0.2];
  const tints = [0.9, 1.04, 0.96, 1.08, 0.88];
  slatZ.forEach((z, i) => seatSlat(b, z, tints[i], 0.012 * (i % 2 === 0 ? 1 : -1)));

  // ---- 主形：4 条靠背斜板 ----
  for (let i = 0; i < 4; i += 1) {
    const y = 0.5 + i * 0.082;
    const z = -0.185 - Math.sin(BACK_TILT) * (y - SEAT_Y) - 0.015;
    b.box(WOOD, [LENGTH, 0.066, 0.032], [0, y, z], [-BACK_TILT, 0, 0], {
      tint: 0.86 + ((i * 5) % 7) * 0.035,
      grain: 0.055,
      ao: 0.7,
    });
  }
  // 靠背两端的压条：把斜板收在一起
  b.box(IRON_DARK, [0.046, 0.34, 0.046], [-0.74, 0.63, -0.218], [-BACK_TILT, 0, 0], { grain: 0.02 });
  b.box(IRON_DARK, [0.046, 0.34, 0.046], [0.74, 0.63, -0.218], [-BACK_TILT, 0, 0], { grain: 0.02 });

  // ---- 结构件：两侧铸铁腿 + 前后横撑 ----
  leg(b, -1);
  leg(b, 1);
  b.box(IRON, [1.14, 0.034, 0.034], [0, 0.15, 0.185]);
  b.box(IRON, [1.14, 0.03, 0.03], [0, 0.31, -0.17]);

  // ---- 点缀：座板与靠背的螺栓 ----
  for (const x of [-0.56, 0.56]) {
    for (const z of [-0.2, 0.2]) b.box(BOLT, [0.03, 0.016, 0.03], [x, SEAT_Y + 0.026, z]);
  }
  for (const x of [-0.56, 0.56]) b.box(BOLT, [0.026, 0.026, 0.02], [x, 0.72, -0.256]);

  return b.build();
}
