import type * as THREE from 'three';
import { createBenchGeometry } from './bench';
import { createBeachGrassGeometry } from './grass';
import { createLifeguardGeometry } from './lifeguard';
import { createLoungerGeometry } from './lounger';
import {
  createAwningBarGeometry,
  createBenchObstacleGeometry,
  createBollardObstacleGeometry,
  createGullGeometry,
  createSignpostGeometry,
} from './obstacles';
import { createPalmGeometry } from './palm';
import {
  createBeachBallGeometry,
  createBucketGeometry,
  createSandcastleGeometry,
  createShellGeometry,
} from './small-beach';
import { createRailingSegmentGeometry } from './railing';
import { createUmbrellaGeometry } from './umbrella';

export { MeshBuilder } from './build';
export type { PartOptions, SheetOptions, V3 } from './build';

/**
 * 场景道具 + 障碍物外形（每个 = 单个已合并、带顶点色的 BufferGeometry，场景里 1 次 draw call）。
 * 尺寸、碰撞盒与三角面预算见 props/README.md；这里只导出成品，跑一次就不再重建。
 */

// ---- 景观道具 ----
export const palmGeometry: THREE.BufferGeometry = createPalmGeometry();
export const benchGeometry: THREE.BufferGeometry = createBenchGeometry();
export const umbrellaGeometry: THREE.BufferGeometry = createUmbrellaGeometry();
export const lifeguardGeometry: THREE.BufferGeometry = createLifeguardGeometry();
export const railingSegmentGeometry: THREE.BufferGeometry = createRailingSegmentGeometry();
export const loungerGeometry: THREE.BufferGeometry = createLoungerGeometry();
export const beachGrassGeometry: THREE.BufferGeometry = createBeachGrassGeometry();

// ---- 障碍物：高门架（slide 专用）—— 工厂函数，接线时写 barrierGeometry() ----
export { barrierGeometry } from './barrier';

// ---- 沙滩小物件（每种 ≤60 tris，给 InstancedMesh 层补空）----
export const shellGeometry: THREE.BufferGeometry = createShellGeometry();
export const bucketGeometry: THREE.BufferGeometry = createBucketGeometry();
export const sandcastleGeometry: THREE.BufferGeometry = createSandcastleGeometry();
export const beachBallGeometry: THREE.BufferGeometry = createBeachBallGeometry();

// ---- 障碍物外形（碰撞盒在 world/obstacles.ts，一个数都不动）----
export const benchObstacleGeometry: THREE.BufferGeometry = createBenchObstacleGeometry();
export const bollardObstacleGeometry: THREE.BufferGeometry = createBollardObstacleGeometry();
export const awningBarGeometry: THREE.BufferGeometry = createAwningBarGeometry();
export const signpostGeometry: THREE.BufferGeometry = createSignpostGeometry();
export const gullGeometry: THREE.BufferGeometry = createGullGeometry();

export {
  createPalmGeometry,
  createBenchGeometry,
  createUmbrellaGeometry,
  createLifeguardGeometry,
  createRailingSegmentGeometry,
  createLoungerGeometry,
  createBeachGrassGeometry,
  createBenchObstacleGeometry,
  createBollardObstacleGeometry,
  createAwningBarGeometry,
  createSignpostGeometry,
  createGullGeometry,
  createShellGeometry,
  createBucketGeometry,
  createSandcastleGeometry,
  createBeachBallGeometry,
};