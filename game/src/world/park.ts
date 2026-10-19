import * as THREE from 'three';
import { ROAD_HALF_WIDTH } from '../core/config';
import type { Assets } from '../core/assets';
import {
  beachBallGeometry,
  benchGeometry,
  bucketGeometry,
  lifeguardGeometry,
  loungerGeometry,
  palmGeometry,
  sandcastleGeometry,
  shellGeometry,
  umbrellaGeometry,
} from './props';

type Kind = 'palm' | 'bench' | 'umbrella' | 'lounger' | 'tower' | 'shell' | 'bucket' | 'castle' | 'ball';

interface LayerSpec {
  kind: Kind;
  count: number;
  spacing: number[];
  /** 相对路缘的横向偏移（正=海侧，负=内侧） */
  inset: [number, number];
  side: 1 | -1;
  scale: [number, number];
  shadow: [number, number];
}

/** 沙带区间（与 track.ts 一致）：栏杆外 0.5m 起，水线内 0.8m 止 */
const SAND_X0 = ROAD_HALF_WIDTH + 0.5 + 0.2;
const SAND_WIDTH = 5;
export const WATER_X = SAND_X0 + SAND_WIDTH;
const SAND_MIN = SAND_X0 + 0.5;
const SAND_MAX = WATER_X - 0.8;
const SAND_TOP = 0.04;
const GRASS_TOP = 0.05;

const LAYERS: LayerSpec[] = [
  // 只剩一种棕榈，只种在人行道内侧一排，18–26m 稀疏
  { kind: 'palm', count: 12, spacing: [19, 24, 21, 26, 18], inset: [3.5, 4.2], side: -1, scale: [1, 1], shadow: [1.9, 0x4a5238] },
  // 长椅：沿内侧布置，间距比棕榈密一点
  { kind: 'bench', count: 6, spacing: [24, 31, 27, 35], inset: [1.4, 2.2], side: -1, scale: [1, 1], shadow: [1.2, 0x4a5238] },
  // 沙滩上零星遮阳伞 + 躺椅，间距很大
  { kind: 'umbrella', count: 6, spacing: [26, 34, 29, 31], inset: [0, 0], side: 1, scale: [0.9, 1.1], shadow: [1.5, 0x8d7f60] },
  // 躺椅：跟伞一样夹在沙带里，间距比伞略开
  { kind: 'lounger', count: 5, spacing: [31, 43, 36, 48], inset: [0, 0], side: 1, scale: [1, 1], shadow: [1.1, 0x8d7f60] },
  // 沙滩小物件：成片撒、非等距、真实尺寸（不带接地暗斑）
  { kind: 'shell', count: 34, spacing: [9, 17, 12, 21, 14], inset: [0, 0], side: 1, scale: [1, 1], shadow: [0, 0] },
  { kind: 'bucket', count: 26, spacing: [16, 24, 19, 27], inset: [0, 0], side: 1, scale: [1, 1], shadow: [0, 0] },
  { kind: 'castle', count: 20, spacing: [21, 29, 24, 33], inset: [0, 0], side: 1, scale: [1, 1], shadow: [0, 0] },
  { kind: 'ball', count: 22, spacing: [23, 31, 26, 35], inset: [0, 0], side: 1, scale: [1, 1], shadow: [0, 0] },
  // 远景救生塔：地标，一个循环流
  { kind: 'tower', count: 2, spacing: [150, 190], inset: [0, 0], side: 1, scale: [1, 1], shadow: [2.4, 0x8d7f60] },
];

interface Slot {
  z: number;
  x: number;
  rootY: number;
  scale: number;
  yaw: number;
  tilt: number;
  spacingIndex: number;
}

interface Layer {
  spec: LayerSpec;
  mesh: THREE.InstancedMesh;
  shadow: THREE.InstancedMesh | null;
  slots: Slot[];
  minZ: number;
}

const HORIZON_AHEAD = 50;

/** 海滨点缀：稀疏棕榈 + 遮阳伞 + 远景救生塔（刻意留空） */
export class ParkField {
  readonly group = new THREE.Group();

  private readonly layers: Layer[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly tint = new THREE.Color();
  private readonly shadowColor = new THREE.Color();
  private readonly shadowGeometry = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
  private readonly shadowMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    toneMapped: false,
  });
  private rngRef: () => number;

  constructor(assets: Assets, rng: () => number) {
    this.rngRef = rng;
    const geoms: Record<Kind, THREE.BufferGeometry> = {
      palm: palmGeometry,
      bench: benchGeometry,
      umbrella: umbrellaGeometry,
      lounger: loungerGeometry,
      shell: shellGeometry,
      bucket: bucketGeometry,
      castle: sandcastleGeometry,
      ball: beachBallGeometry,
      tower: lifeguardGeometry,
    };

    for (const spec of LAYERS) {
      const mesh = new THREE.InstancedMesh(geoms[spec.kind], assets.matProp, spec.count);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      const shadow = new THREE.InstancedMesh(this.shadowGeometry, this.shadowMaterial, spec.count);
      shadow.frustumCulled = false;
      this.group.add(shadow);
      const slots: Slot[] = [];
      for (let i = 0; i < spec.count; i += 1) slots.push({ z: 0, x: 0, rootY: 0, scale: 1, yaw: 0, tilt: 0, spacingIndex: i });
      this.layers.push({ spec, mesh, shadow, slots, minZ: 0 });
    }
    this.reset(rng);
    const beachLayers = this.layers.filter((l) => l.spec.side > 0);
    for (const layer of beachLayers) {
      for (const slot of layer.slots) {
        const ok = slot.x <= WATER_X - 0.01;
        console.log(
          `[beach] ${layer.spec.kind} x=${slot.x.toFixed(2)} y=${slot.rootY.toFixed(2)} z=${slot.z.toFixed(1)} ` +
            `水线x=${WATER_X.toFixed(2)} ${ok ? 'OK' : '越界!'}`,
        );
      }
    }
  }

  reset(rng: () => number = this.rngRef): void {
    for (const layer of this.layers) {
      let z = -rng() * 14;
      for (const slot of layer.slots) {
        slot.z = z;
        this.place(layer, slot, rng);
        z -= this.nextSpacing(layer, slot, rng);
      }
      layer.minZ = z;
      this.flush(layer);
    }
  }

  update(playerZ: number): void {
    for (const layer of this.layers) {
      let moved = false;
      for (const slot of layer.slots) {
        if (slot.z > playerZ + HORIZON_AHEAD) {
          slot.z = layer.minZ - this.nextSpacing(layer, slot, this.rngRef);
          layer.minZ = slot.z;
          this.place(layer, slot, this.rngRef);
          moved = true;
        }
      }
      if (moved) this.flush(layer);
    }
  }

  /** 收集物避让：某点附近 radius 内是否已有道具 */
  isBlocked(x: number, z: number, radius: number): boolean {
    for (const layer of this.layers) {
      if (layer.spec.kind === 'shell' || layer.spec.kind === 'bucket' || layer.spec.kind === 'castle' || layer.spec.kind === 'ball') continue;
      for (const slot of layer.slots) {
        if (Math.abs(slot.z - z) > radius + 2) continue;
        if (Math.hypot(slot.x - x, slot.z - z) <= radius) return true;
      }
    }
    return false;
  }

  private nextSpacing(layer: Layer, slot: Slot, rng: () => number): number {
    const pattern = layer.spec.spacing;
    slot.spacingIndex = (slot.spacingIndex + 1) % pattern.length;
    return pattern[slot.spacingIndex] * (0.9 + rng() * 0.2);
  }

  private place(layer: Layer, slot: Slot, rng: () => number): void {
    const small = layer.spec.kind === 'shell' || layer.spec.kind === 'bucket' || layer.spec.kind === 'castle' || layer.spec.kind === 'ball';
    if (small) {
      // 湿沙带：水线内侧 1–3m，避开步道一侧
      slot.x = SAND_MAX - 3 + rng() * 3;
      slot.rootY = SAND_TOP;
      slot.scale = 1;
      slot.yaw = rng() * Math.PI * 2;
      slot.tilt = 0;
      return;
    }
    if (layer.spec.side > 0) {
      // 沙滩道具：x 严格夹在【栏杆外 0.5m, 水线内 0.8m】，根部贴沙面
      slot.x = SAND_MIN + rng() * (SAND_MAX - SAND_MIN);
      slot.rootY = SAND_TOP;
    } else {
      const [near, far] = layer.spec.inset;
      slot.x = -1 * (ROAD_HALF_WIDTH + 0.55 + near + rng() * (far - near));
      slot.rootY = layer.spec.kind === 'palm' ? GRASS_TOP : 0;
    }
    const [sMin, sMax] = layer.spec.scale;
    slot.scale = sMin + rng() * (sMax - sMin);
    if (layer.spec.kind === 'bench') slot.yaw = -Math.PI / 2 + (rng() - 0.5) * 0.08;
    else if (layer.spec.kind === 'palm') slot.yaw = rng() * Math.PI * 2;
    else slot.yaw = (rng() - 0.5) * 0.6;
    slot.tilt = layer.spec.kind === 'palm' ? -0.05 - rng() * 0.06 : 0;
  }

  private flush(layer: Layer): void {
    const shadowSpec = layer.spec.shadow;
    for (let i = 0; i < layer.slots.length; i += 1) {
      const slot = layer.slots[i];
      const tint = 0.92 + ((i * 37) % 13) / 60;
      this.tint.setRGB(tint, tint, tint * 0.98);
      layer.mesh.setColorAt(i, this.tint);
      this.dummy.position.set(slot.x, slot.rootY, slot.z);
      this.dummy.rotation.set(0, slot.yaw, slot.tilt);
      this.dummy.scale.setScalar(slot.scale);
      this.dummy.updateMatrix();
      layer.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    layer.mesh.instanceMatrix.needsUpdate = true;
    if (layer.mesh.instanceColor) layer.mesh.instanceColor.needsUpdate = true;

    if (layer.shadow) {
      for (let i = 0; i < layer.slots.length; i += 1) {
        const slot = layer.slots[i];
        const radius = shadowSpec[0] * slot.scale;
        this.shadowColor.setHex(shadowSpec[1]);
        layer.shadow.setColorAt(i, this.shadowColor);
        this.dummy.position.set(slot.x - 0.3 * slot.scale, 0.04, slot.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(radius * 1.2, 1, radius);
        this.dummy.updateMatrix();
        layer.shadow.setMatrixAt(i, this.dummy.matrix);
      }
      layer.shadow.instanceMatrix.needsUpdate = true;
      if (layer.shadow.instanceColor) layer.shadow.instanceColor.needsUpdate = true;
    }
  }
}
