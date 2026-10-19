import * as THREE from 'three';
import { MeshBuilder } from './build';
import type { V3 } from './build';

/** 尺寸硬约束：伞面半径 1.1m，伞下净高 1.9m */
const RADIUS = 1.1;
const CLEARANCE = 1.9;
const PANELS = 8;
const APEX_Y = CLEARANCE + 0.5;
/** 骨位比瓣中间高多少：布面才会在骨之间垂下来 */
const SAG = 0.09;
/** 伞沿的布边下垂量 */
const HEM = 0.05;

const CANOPY = [0xefece0, 0xd0674e];
const CANOPY_DARK = 0xdad4c2;
const RIB = 0xb7a583;
const POLE = 0xe6dcc4;
const POLE_DARK = 0xb8a68a;
const HUB = 0x8f949b;
const WOOD = 0xc8bb9c;

/** 伞沿高度：骨位高、瓣中间低（荷叶边）——最低点就是净高 1.9m */
const rimY = (angle: number): number => {
  const frac = ((angle / (Math.PI * 2)) * PANELS) % 1;
  return CLEARANCE + HEM + SAG * (1 - Math.sin(Math.PI * frac));
};

export function createUmbrellaGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();

  // ---- 结构件：底座（配重盘 + 立管套） ----
  b.cyl(HUB, 0.26, 0.28, 0.045, [0, 0.022, 0], 12, [0, 0, 0], { grain: 0.02 });
  b.cyl(HUB, 0.19, 0.2, 0.04, [0, 0.064, 0], 10, [0, 0, 0], { grain: 0.02 });
  b.cyl(WOOD, 0.075, 0.085, 0.2, [0, 0.16, 0], 8, [0, 0, 0], { grain: 0.05 });

  // ---- 主形：中柱（两段木色，接头处一道箍） ----
  const lower = APEX_Y * 0.62;
  b.cyl(POLE, 0.042, 0.052, lower, [0, lower / 2, 0], 8, [0, 0, 0], { cap: false, tint: 1.02 });
  b.cyl(POLE_DARK, 0.055, 0.055, 0.06, [0, lower, 0], 8, [0, 0, 0], { cap: false });
  b.cyl(POLE, 0.036, 0.042, APEX_Y + 0.08 - lower, [0, (APEX_Y + 0.08 + lower) / 2, 0], 8, [0, 0, 0], {
    cap: false,
    tint: 1.05,
  });

  // ---- 主形：8 瓣伞面（骨位高、瓣中垂、沿口带一圈布边） ----
  for (let p = 0; p < PANELS; p += 1) {
    const a0 = (p / PANELS) * Math.PI * 2;
    const a1 = ((p + 1) / PANELS) * Math.PI * 2;
    const color = CANOPY[p % 2];
    b.sheet(
      color,
      2,
      4,
      (u, v) => {
        const angle = a0 + (a1 - a0) * u;
        // 前 88% 是伞面，最后 12% 折成沿口的布边
        const body = Math.min(1, v / 0.88);
        const reach = RADIUS * Math.pow(body, 0.94);
        const along = APEX_Y - (APEX_Y - rimY(angle)) * Math.pow(body, 1.18);
        const scallop = Math.sin(Math.PI * ((u * 2) % 1)) * 0.012 * body;
        const hem = v > 0.88 ? ((v - 0.88) / 0.12) * HEM : 0;
        return [Math.cos(angle) * reach, along - hem - scallop, Math.sin(angle) * reach];
      },
      { up: true, shade: 1, tint: p % 2 === 0 ? 1 : 1.02 },
    );
    // 伞里衬：一块朝下的深色面，抬头看不会直接看穿
    b.poly(
      CANOPY_DARK,
      [
        [Math.cos(a0) * RADIUS * 0.995, rimY(a0) - HEM - 0.01, Math.sin(a0) * RADIUS * 0.995],
        [Math.cos(a1) * RADIUS * 0.995, rimY(a1) - HEM - 0.01, Math.sin(a1) * RADIUS * 0.995],
        [0, APEX_Y - 0.05, 0],
      ],
      { down: true, shade: 0.75 },
    );
  }

  // ---- 结构件：8 根伞骨（从顶尖撑到伞沿）+ 顶尖下的骨座 ----
  b.cyl(HUB, 0.075, 0.062, 0.07, [0, APEX_Y - 0.16, 0], 8, [0, 0, 0], { cap: false });
  for (let p = 0; p < PANELS; p += 1) {
    const angle = (p / PANELS) * Math.PI * 2;
    const top: V3 = [0, APEX_Y - 0.03, 0];
    const tip: V3 = [Math.cos(angle) * (RADIUS - 0.005), rimY(angle) - HEM - 0.005, Math.sin(angle) * (RADIUS - 0.005)];
    b.rod(RIB, top, tip, 0.016, 0.009, 4, { cap: false, tint: 1 - (p % 3) * 0.05 });
  }

  // ---- 点缀：顶尖圆帽 + 顶珠 + 系绳 ----
  b.cyl(POLE, 0.048, 0.078, 0.13, [0, APEX_Y + 0.09, 0], 8, [0, 0, 0], { grain: 0.02 });
  b.sphere(POLE_DARK, 0.05, [0, APEX_Y + 0.17, 0], 6);
  for (const angle of [0.9, 2.4]) {
    const x = Math.cos(angle) * RADIUS * 0.9;
    const z = Math.sin(angle) * RADIUS * 0.9;
    // 拉绳两段 + 打在地里的木钉，伞才不会「凭空立着」
    b.rod(WOOD, [x, rimY(angle) - HEM - 0.02, z], [x * 1.16, rimY(angle) - HEM - 0.34, z * 1.16], 0.013, 0.01, 4, {
      cap: false,
    });
    b.rod(WOOD, [x * 1.16, rimY(angle) - HEM - 0.34, z * 1.16], [x * 1.22, 0.06, z * 1.22], 0.01, 0.008, 4, {
      cap: false,
    });
    b.box(0x9a8a6c, [0.035, 0.13, 0.035], [x * 1.22, 0.06, z * 1.22], [0.2, 0, 0.2], { grain: 0.04 });
  }

  return b.build();
}
