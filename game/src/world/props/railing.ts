import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { MeshBuilder } from './build';

/** 尺寸硬约束：一段 2.4m 长、1.0m 高、立柱径 0.07m（沿 x 排布，建模原点在段中心） */
const LENGTH = 2.4;
const HEIGHT = 1.0;
const POST_RADIUS = 0.035;

const RAIL = PALETTE.railWood;
const RAIL_DARK = 0xdcd6c4;
const BOLT = 0x8b8f96;

export function createRailingSegmentGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const half = LENGTH / 2;
  /** 立柱贴在段起点内侧，整体长度才是准确的 2.4m */
  const postX = -half + 0.058;
  const railLength = half - postX;
  const railCenter = (postX + half) / 2;

  // ---- 主形：立柱（每段起点一根，实例化后排成等距的一列） ----
  b.cyl(RAIL, POST_RADIUS, POST_RADIUS * 1.15, HEIGHT - 0.06, [postX, (HEIGHT - 0.06) / 2, 0], 8, [0, 0, 0], {
    ao: 1.1,
    grain: 0.03,
  });
  b.sphere(RAIL, 0.045, [postX, HEIGHT - 0.05, 0], 6, { grain: 0.03 });
  b.cyl(RAIL_DARK, 0.05, 0.056, 0.075, [postX, 0.038, 0], 8, [0, 0, 0], { ao: 1.1 });

  // ---- 结构件：上扶手（带压顶条）+ 中横杆 + 下横杆 ----
  b.box(RAIL, [railLength, 0.075, 0.095], [railCenter, 0.9, 0], [0, 0, 0], { grain: 0.03 });
  b.box(RAIL_DARK, [railLength, 0.028, 0.115], [railCenter, 0.945, 0], [0, 0, 0], { grain: 0.02 });
  b.box(RAIL, [railLength, 0.048, 0.062], [railCenter, 0.6, 0], [0, 0, 0], { tint: 0.97 });
  b.box(RAIL, [railLength, 0.044, 0.056], [railCenter, 0.2, 0], [0, 0, 0], { tint: 0.94 });

  // ---- 结构件：立杆（细白木条，海堤栏杆的节奏感） ----
  for (let i = 0; i < 5; i += 1) {
    const x = postX + 0.34 + i * 0.42;
    b.box(RAIL, [0.028, 0.7, 0.028], [x, 0.55, 0], [0, 0, 0], { tint: 0.96 + (i % 3) * 0.02, grain: 0.03 });
  }

  // ---- 点缀：立柱与横杆的螺栓 + 收头端板 ----
  for (const y of [0.9, 0.6]) {
    b.box(BOLT, [0.035, 0.035, 0.105], [postX, y, 0]);
  }
  b.box(RAIL_DARK, [0.026, 0.13, 0.105], [half - 0.013, 0.9, 0], [0, 0, 0], { tint: 0.9 });

  return b.build();
}
