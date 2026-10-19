import { barrierGeometry } from './props';
import * as THREE from 'three';
import { LANE_CENTERS, OBSTACLE_DESPAWN_BEHIND } from '../core/config';
import { GeoBuilder } from '../core/geometry';
import { PALETTE } from '../core/palette';
import { aabbOverlap } from '../player/collision';
import type { AABB } from '../player/collision';

export type ObstacleKind = 'stool' | 'cart' | 'awning' | 'pole' | 'cat' | 'fence';

export interface KindSpec {
  kind: ObstacleKind;
  /** HUD / console 里显示的名字 */
  label: string;
  geometry: THREE.BufferGeometry;
  halfWidth: number;
  halfDepth: number;
  minY: number;
  maxY: number;
  /** 正确解法：jump 跳 / lane 换道 / slide 滑铲 */
  answer: 'jump' | 'lane' | 'slide';
  sway?: { amplitude: number; periodMin: number; periodMax: number };
}

/** 跳过去：矮绿篱段（0.4m 高，和原凳子同尺寸） */
/** 跳过去：沙滩椅（0.4m） */
function buildStool(): THREE.BufferGeometry {
  const geo = new GeoBuilder();
  geo.cylinder(0x9c8f6f, 0.8, 0.8, 0.006, [0, 0.006, 0], 12);
  const wood = PALETTE.benchWood;
  const cloth = 0x3f7f9c;
  // 座面（斜放）+ 靠背
  geo.box(wood, [1.4, 0.07, 0.52], [0, 0.26, 0], [0.12, 0, 0]);
  geo.box(cloth, [1.3, 0.05, 0.46], [0, 0.31, 0], [0.12, 0, 0]);
  geo.box(wood, [0.06, 0.5, 0.06], [-0.62, 0.2, 0.2]);
  geo.box(wood, [0.06, 0.5, 0.06], [0.62, 0.2, 0.2]);
  geo.box(wood, [0.06, 0.42, 0.5], [-0.62, 0.42, -0.18], [-0.5, 0, 0]);
  geo.box(wood, [0.06, 0.42, 0.5], [0.62, 0.42, -0.18], [-0.5, 0, 0]);
  geo.box(cloth, [1.26, 0.04, 0.42], [0, 0.44, -0.18], [-0.5, 0, 0]);
  return geo.build();
}

/** 换道躲开：系船柱（1.8m） */
function buildCart(): THREE.BufferGeometry {
  const geo = new GeoBuilder();
  geo.cylinder(0x9c8f6f, 0.9, 0.9, 0.006, [0, 0.006, 0], 12);
  const white = 0xf2efe6;
  const navy = 0x2f4f6b;
  geo.cylinder(0x8a8f98, 0.42, 0.5, 0.18, [0, 0.09, 0], 10);
  geo.cylinder(white, 0.26, 0.3, 1.5, [0, 0.9, 0], 10);
  geo.cylinder(navy, 0.31, 0.31, 0.16, [0, 0.42, 0], 10);
  geo.cylinder(navy, 0.28, 0.28, 0.14, [0, 1.08, 0], 10);
  geo.cylinder(white, 0.34, 0.22, 0.3, [0, 1.75, 0], 10);
  geo.box(0x8a8f98, [0.5, 0.1, 0.12], [0, 1.6, 0]);
  return geo.build();
}

/** 滑铲钻过：海滨遮阳棚横杆（1.2m 悬空，白杆 + 蓝白条纹篷边） */
function buildAwning(): THREE.BufferGeometry {
  const geo = new GeoBuilder();
  geo.cylinder(0x9c8f6f, 0.55, 0.55, 0.006, [0, 0.006, 0], 12);
  const pole = 0xf2efe6;
  const blue = 0x3f7f9c;
  for (const x of [-1.05, 1.05]) {
    geo.box(pole, [0.18, 0.06, 0.18], [x, 0.03, 0]);
    geo.cylinder(pole, 0.06, 0.06, 1.2, [x, 0.62, 0], 8);
  }
  // 横杆：白 + 蓝白相间，压在 1.19–1.31
  const span = 2.44;
  const segments = 5;
  const w = span / segments;
  for (let i = 0; i < segments; i += 1) {
    geo.box(i % 2 === 0 ? pole : blue, [w, 0.12, 0.12], [-span / 2 + w / 2 + i * w, 1.25, 0]);
  }
  // 篷布边条（只做上面薄薄一条，暗示遮阳棚）
  geo.box(pole, [2.0, 0.04, 0.5], [0, 1.33, -0.16]);
  geo.box(blue, [0.5, 0.04, 0.5], [-0.75, 1.33, -0.16]);
  geo.box(blue, [0.5, 0.04, 0.5], [0.75, 1.33, -0.16]);
  return geo.build();
}

/** 换道躲开：海滨路标立柱 */
function buildPole(): THREE.BufferGeometry {
  const geo = new GeoBuilder();
  geo.cylinder(0x9c8f6f, 0.34, 0.34, 0.006, [0, 0.006, 0], 10);
  geo.box(0xf2efe6, [0.36, 0.12, 0.36], [0, 0.08, 0]);
  geo.cylinder(0x8a8f98, 0.06, 0.08, 4.2, [0, 2.2, 0], 8);
  geo.box(0x3f7f9c, [0.7, 0.5, 0.06], [0, 3.4, 0]);
  geo.box(0xf2efe6, [0.56, 0.16, 0.02], [0, 3.5, 0.04]);
  geo.box(0xf2efe6, [0.4, 0.1, 0.02], [0, 3.3, 0.04]);
  return geo.build();
}

/** 会移动的：地面海鸥 */
function buildCat(): THREE.BufferGeometry {
  const geo = new GeoBuilder();
  geo.cylinder(0x9c8f6f, 0.3, 0.3, 0.006, [0, 0.006, 0], 10);
  const white = 0xf6f6f2;
  const grey = 0xcfd2d4;
  geo.sphere(white, 0.2, [0, 0.2, 0], 7);
  geo.sphere(grey, 0.12, [0.02, 0.34, 0.14], 6);
  geo.sphere(white, 0.1, [0.06, 0.44, 0.2], 6);
  geo.box(0xe0a83a, [0.06, 0.04, 0.09], [0.06, 0.42, 0.3]);
  geo.box(grey, [0.34, 0.05, 0.14], [-0.1, 0.26, -0.08], [0, 0.3, 0.2]);
  geo.box(0x3a3f45, [0.03, 0.08, 0.03], [0.03, 0.08, 0.06]);
  geo.box(0x3a3f45, [0.03, 0.08, 0.03], [-0.03, 0.08, 0.06]);
  return geo.build();
}

export const KINDS: Record<ObstacleKind, KindSpec> = {
  stool: {
    kind: 'stool',
    label: '沙滩椅',
    geometry: buildStool(),
    halfWidth: 0.78,
    halfDepth: 0.34,
    minY: 0,
    maxY: 0.4,
    answer: 'jump',
  },
  cart: {
    kind: 'cart',
    label: '系船柱',
    geometry: buildCart(),
    halfWidth: 0.85,
    halfDepth: 0.78,
    minY: 0,
    maxY: 1.8,
    answer: 'lane',
  },
  awning: {
    kind: 'awning',
    label: '遮阳棚横杆',
    geometry: buildAwning(),
    halfWidth: 1.22,
    halfDepth: 0.66,
    minY: 1.2,
    // 只在横杆高度上判定：二段跳顶点 2.36m 能越过，滑铲也能钻过去（两种解法都成立）
    maxY: 1.45,
    answer: 'slide',
  },
  pole: {
    kind: 'pole',
    label: '海滨路标',
    geometry: buildPole(),
    halfWidth: 0.2,
    halfDepth: 0.2,
    minY: 0,
    maxY: 6,
    answer: 'lane',
  },
  fence: {
    kind: 'fence',
    label: '高门架',
    geometry: barrierGeometry(),
    halfWidth: 1.3,
    halfDepth: 0.15,
    // 下沿 1.05：站着会撞，滑铲能钻过去；上沿 2.6 高于二段跳顶点 2.36，跳不过去
    minY: 1.05,
    maxY: 2.6,
    answer: 'slide',
  },
  cat: {
    kind: 'cat',
    label: '地面海鸥',
    geometry: buildCat(),
    halfWidth: 0.3,
    halfDepth: 0.42,
    minY: 0,
    maxY: 0.52,
    answer: 'jump',
    sway: { amplitude: 0.55, periodMin: 1.6, periodMax: 2.6 },
  },
};

// 池子按这个列表建桶；漏掉一种，spawn 就会因为拿不到 mesh 而静默失败（障碍永远不出现）
export const OBSTACLE_KINDS: ObstacleKind[] = ['stool', 'cart', 'awning', 'pole', 'cat', 'fence'];
// 防御：KINDS 里有的种类必须都在池列表里，漏一个立刻在启动时炸出来
for (const k of Object.keys(KINDS) as ObstacleKind[]) {
  if (!OBSTACLE_KINDS.includes(k)) throw new Error(`障碍池缺少种类: ${k}`);
}

export interface ObstacleRecord extends AABB {
  /** 已经撞过一次，不再重复扣追兵距离 */
  consumed: boolean;
  kind: ObstacleKind;
  /** 日志/提示用的中文名 */
  label: string;
  mesh: THREE.Mesh;
  lane: number;
  z: number;
  baseX: number;
  phase: number;
  period: number;
  amplitude: number;
}

/**
 * 五种障碍的对象池。每个 kind 一份共享几何体（顶点色烘死），
 * 每种池子里固定几个 Mesh，复用不 new。
 */
export class ObstacleField {
  readonly group = new THREE.Group();

  private readonly pools = new Map<ObstacleKind, THREE.Mesh[]>();
  private readonly active: ObstacleRecord[] = [];
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.12 });
  private elapsed = 0;
  /** 已经安全甩到身后的障碍数（连续闪避判定用） */
  passedCount = 0;

  constructor(poolPerKind = 8) {
    for (const kind of OBSTACLE_KINDS) {
      const bucket: THREE.Mesh[] = [];
      for (let i = 0; i < poolPerKind; i += 1) {
        const mesh = new THREE.Mesh(KINDS[kind].geometry, this.material);
        mesh.visible = false;
        this.group.add(mesh);
        bucket.push(mesh);
      }
      this.pools.set(kind, bucket);
    }
  }

  reset(): void {
    for (const record of this.active) {
      record.mesh.visible = false;
      this.pools.get(record.kind)?.push(record.mesh);
    }
    this.active.length = 0;
    this.elapsed = 0;
    this.passedCount = 0;
  }

  /** 预热：给每种障碍各生成一个，让 renderer.compile 能编译到它们的材质，然后由调用方 reset() 清掉 */
  warmupObstacles(z: number): void {
    for (const kind of Object.keys(KINDS) as ObstacleKind[]) this.spawn(kind, 1, z, () => 0.5);
  }

  spawn(kind: ObstacleKind, lane: number, z: number, rng: () => number): boolean {
    const bucket = this.pools.get(kind);
    const mesh = bucket?.pop();
    if (!mesh) return false;
    const spec = KINDS[kind];
    const baseX = LANE_CENTERS[lane];
    const sway = spec.sway;
    const period = sway ? sway.periodMin + rng() * (sway.periodMax - sway.periodMin) : 0;
    mesh.visible = true;
    mesh.position.set(baseX, 0, z);
    const record: ObstacleRecord = {
      consumed: false,
      kind,
      label: spec.label,
      mesh,
      lane,
      z,
      baseX,
      phase: rng() * Math.PI * 2,
      period,
      amplitude: sway ? sway.amplitude : 0,
      minX: baseX - spec.halfWidth,
      maxX: baseX + spec.halfWidth,
      minY: spec.minY,
      maxY: spec.maxY,
      minZ: z - spec.halfDepth,
      maxZ: z + spec.halfDepth,
    };
    this.active.push(record);
    return true;
  }

  update(dt: number, playerZ: number): void {
    this.elapsed += dt;
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const record = this.active[i];
      if (record.maxZ > playerZ + OBSTACLE_DESPAWN_BEHIND) {
        record.mesh.visible = false;
        this.pools.get(record.kind)?.push(record.mesh);
        this.active.splice(i, 1);
        this.passedCount += 1;
        continue;
      }
      if (record.amplitude > 0) {
        const spec = KINDS[record.kind];
        const x = record.baseX + Math.sin((this.elapsed * Math.PI * 2) / record.period + record.phase) * record.amplitude;
        record.mesh.position.x = x;
        record.minX = x - spec.halfWidth;
        record.maxX = x + spec.halfWidth;
      }
    }
  }

  /** 返回撞到的那个障碍（同一个障碍只会命中一次），没撞到返回 null */
  hits(box: AABB): ObstacleRecord | null {
    for (const record of this.active) {
      if (record.consumed) continue;
      if (record.minZ > box.maxZ || record.maxZ < box.minZ) continue;
      if (aabbOverlap(box, record)) return record;
    }
    return null;
  }

  /** 同车道前方最近的障碍（含 kind，供自动驾驶与调试用） */
  firstAhead(lane: number, playerZ: number): ObstacleRecord | null {
    let best: ObstacleRecord | null = null;
    let bestGap = Infinity;
    for (const record of this.active) {
      if (record.lane !== lane) continue;
      const gap = playerZ - record.maxZ;
      if (gap >= -0.5 && gap < bestGap) {
        bestGap = gap;
        best = record;
      }
    }
    return best;
  }

  /** 相机臂遮挡检测用：把 z 附近的障碍 AABB 塞进 out（复用数组，不分配） */
  appendNearby(centerZ: number, range: number, out: ObstacleRecord[]): void {
    out.length = 0;
    for (const record of this.active) {
      if (Math.abs(record.z - centerZ) < range) out.push(record);
    }
  }

  /** 这个车道在 z 附近是否已经有障碍（奶瓶不往那里放） */
  laneBusy(lane: number, z: number, tolerance = 3): boolean {
    for (const record of this.active) {
      if (record.lane !== lane) continue;
      if (Math.abs(record.z - z) < tolerance) return true;
    }
    return false;
  }

  get activeCount(): number {
    return this.active.length;
  }
}
