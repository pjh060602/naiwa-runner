export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * 射线（origin + dir，dir 是带长度的方向向量）与 AABB 的进入参数 t ∈ [0,1]；
 * 未命中返回 Infinity。origin 在盒内时返回 0。
 */
export function rayAabbEntry(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: AABB,
  margin = 0,
): number {
  let tMin = 0;
  let tMax = 1;

  if (Math.abs(dx) < 1e-8) {
    if (ox < box.minX - margin || ox > box.maxX + margin) return Infinity;
  } else {
    let t1 = (box.minX - margin - ox) / dx;
    let t2 = (box.maxX + margin - ox) / dx;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return Infinity;
  }

  if (Math.abs(dy) < 1e-8) {
    if (oy < box.minY - margin || oy > box.maxY + margin) return Infinity;
  } else {
    let t1 = (box.minY - margin - oy) / dy;
    let t2 = (box.maxY + margin - oy) / dy;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return Infinity;
  }

  if (Math.abs(dz) < 1e-8) {
    if (oz < box.minZ - margin || oz > box.maxZ + margin) return Infinity;
  } else {
    let t1 = (box.minZ - margin - oz) / dz;
    let t2 = (box.maxZ + margin - oz) / dz;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return Infinity;
  }

  return tMin <= tMax ? tMin : Infinity;
}

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minY <= b.maxY &&
    a.maxY >= b.minY &&
    a.minZ <= b.maxZ &&
    a.maxZ >= b.minZ
  );
}
