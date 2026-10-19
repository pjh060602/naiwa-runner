import * as THREE from 'three';
import { PALETTE } from '../../core/palette';
import { MeshBuilder } from './build';
import type { V3 } from './build';

/** 海风草：丛高 0.3–0.5m，成片但不挡视野 */
const BLADES = 12;
const GREEN = PALETTE.windGrass;
const GREEN_DARK = 0x8a9a52;
const GREEN_LIGHT = 0xc3cf94;
const STRAW = 0xc9bd82;

/** 一片草叶：两段折弯的薄片，正反两面都建（草叶太薄，单面会闪） */
function blade(b: MeshBuilder, index: number, count: number): void {
  const angle = (index / count) * Math.PI * 2 + (index % 3) * 0.5;
  const lean = 0.12 + ((index * 7) % 6) * 0.045;
  const height = 0.3 + ((index * 5) % 5) * 0.05;
  const width = 0.014 + (index % 4) * 0.005;
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const sx = -dz;
  const sz = dx;
  const color = index % 5 === 4 ? STRAW : index % 3 === 0 ? GREEN_LIGHT : index % 2 === 0 ? GREEN : GREEN_DARK;

  const points = (t: number): V3 => [dx * lean * t * t, height * t, dz * lean * t * t];
  for (const side of [1, -1]) {
    for (let i = 0; i < 2; i += 1) {
      const t0 = i / 2;
      const t1 = (i + 1) / 2;
      const p0 = points(t0);
      const p1 = points(t1);
      const w0 = width * (1 - t0 * 0.65);
      const w1 = width * (1 - t1 * 0.85);
      const off = side * 0.0035;
      b.quad(
        color,
        [p0[0] + sx * w0 + sx * off, p0[1], p0[2] + sz * w0 + sz * off],
        [p1[0] + sx * w1 + sx * off, p1[1], p1[2] + sz * w1 + sz * off],
        [p1[0] - sx * w1 + sx * off, p1[1], p1[2] - sz * w1 + sz * off],
        [p0[0] - sx * w0 + sx * off, p0[1], p0[2] - sz * w0 + sz * off],
        { grain: 0.05, shade: 1 },
      );
    }
  }
}

export function createBeachGrassGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  for (let i = 0; i < BLADES; i += 1) blade(b, i, BLADES);

  // 两根抽穗的草秆：丛才有重心，也不会像一把塑料片
  for (const [x, z, h] of [
    [0.04, -0.03, 0.47],
    [-0.05, 0.04, 0.43],
  ] as const) {
    b.rod(GREEN_DARK, [x, 0, z], [x + 0.025, h, z], 0.007, 0.004, 3, { cap: false });
    b.sphere(STRAW, 0.016, [x + 0.025, h + 0.008, z], 4, { grain: 0.04 });
  }

  return b.build();
}
