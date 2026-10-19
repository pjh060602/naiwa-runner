import * as THREE from 'three';
import { MeshBuilder } from '../props/build';
import type { V3 } from '../props/build';

/**
 * 远岛：矮而宽的深色剪影，底部压到水平线以下（水里那半截看不见）。
 * 单位尺寸 1×1，实例化时缩成 40–110m 宽、3–6m 高。
 */
export function createIslandGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const TOP = 0x36637a;
  const BOTTOM = 0x6c9db2;
  const columns = 9;
  /** 山脊轮廓：几座低矮的丘叠在一起，不是尖锥 */
  const ridge = (u: number): number => {
    const a = Math.sin(u * Math.PI * 2.1 + 0.6) * 0.28;
    const b2 = Math.sin(u * Math.PI * 4.6 + 1.9) * 0.12;
    const body = Math.sin(Math.pow(u, 0.85) * Math.PI) * 0.72;
    return Math.max(0.12, body + a + b2);
  };
  for (const face of [1, -1]) {
    // 下半截偏浅（海雾），上半截更深
    for (const band of [0, 1] as const) {
      const yFrom = band === 0 ? -0.18 : 0.34;
      const yTo = band === 0 ? 0.34 : 1;
      b.sheet(
        band === 0 ? BOTTOM : TOP,
        columns,
        1,
        (u, v) => {
          const x = (u - 0.5) * face;
          const y = yFrom + (yTo - yFrom) * v;
          const peak = ridge(u);
          const point: V3 = [x, Math.min(y, peak), face * 0.004];
          return point;
        },
        face > 0 ? { shade: 0.85 } : { shade: 0.85, tint: 0.9 },
      );
    }
  }
  // 岛顶收一条暗边，剪影才有轮廓
  for (let i = 0; i < columns; i += 1) {
    const u0 = i / columns;
    const u1 = (i + 1) / columns;
    b.quad(
      0x2b5468,
      [-0.5 + u0, ridge(u0), 0.006],
      [-0.5 + u1, ridge(u1), 0.006],
      [-0.5 + u1, ridge(u1) - 0.06, 0.006],
      [-0.5 + u0, ridge(u0) - 0.06, 0.006],
      { shade: 0.8 },
    );
  }
  return b.build();
}
