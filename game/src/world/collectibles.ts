import * as THREE from 'three';
import {
  BOTTLE_FLOAT_Y,
  ITEM_FIRST_Z,
  ITEM_FLOAT_Y,
  ITEM_GAP,
  ITEM_SPAWN_AHEAD,
  LANE_CENTERS,
  MAGNET_ATTRACT_SPEED,
  MAGNET_COLLECT_RADIUS,
} from '../core/config';
import { GeoBuilder } from '../core/geometry';
import { buildFireworkItem, buildMagnetItem, buildShieldItem } from './props';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface BottleRecord {
  mesh: THREE.Mesh;
  x: number;
  z: number;
}

function buildBottle(): THREE.BufferGeometry {
  const geo = new GeoBuilder();
  geo.cylinder(0xf2f4f8, 0.11, 0.13, 0.3, [0, 0, 0], 8);
  geo.cylinder(0xd9dee8, 0.07, 0.11, 0.1, [0, 0.2, 0], 8);
  geo.cylinder(0xffb340, 0.075, 0.075, 0.05, [0, 0.27, 0], 8);
  geo.cylinder(0xffd98a, 0.05, 0.065, 0.09, [0, 0.34, 0], 6);
  geo.cylinder(0xffcf7a, 0.135, 0.135, 0.03, [0, -0.16, 0], 8);
  return geo.build();
}

/** 奶瓶：小对象池 + 自转，帧内零 new。 */
export class BottleField {
  readonly group = new THREE.Group();

  private readonly pool: THREE.Mesh[] = [];
  private readonly active: BottleRecord[] = [];
  private readonly material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.1,
    emissive: new THREE.Color(0xffb340),
    emissiveIntensity: 0.25,
  });
  private elapsed = 0;

  constructor(poolSize = 18) {
    const geometry = buildBottle();
    for (let i = 0; i < poolSize; i += 1) {
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push(mesh);
    }
  }

  reset(): void {
    for (const record of this.active) {
      record.mesh.visible = false;
      this.pool.push(record.mesh);
    }
    this.active.length = 0;
    this.elapsed = 0;
  }

  /** 由 game.ts 注入：某点是否被道具占住（收集物避让） */
  private blockCheck: ((x: number, z: number) => boolean) | null = null;

  setBlockCheck(fn: ((x: number, z: number) => boolean) | null): void {
    this.blockCheck = fn;
  }

  spawn(lane: number, z: number): void {
    const x = LANE_CENTERS[lane];
    if (this.blockCheck && this.blockCheck(x, z)) return;
    const mesh = this.pool.pop();
    if (!mesh) return;
    mesh.visible = true;
    mesh.position.set(x, BOTTLE_FLOAT_Y, z);
    this.active.push({ mesh, x, z });
  }

  update(dt: number, playerZ: number): void {
    this.elapsed += dt;
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const record = this.active[i];
      if (record.z > playerZ + 12) {
        record.mesh.visible = false;
        this.pool.push(record.mesh);
        this.active.splice(i, 1);
        continue;
      }
      record.mesh.rotation.y = this.elapsed * 2.4;
      record.mesh.position.y = BOTTLE_FLOAT_Y + Math.sin(this.elapsed * 2 + record.z) * 0.08;
    }
  }

  /** 拾取判定只看平面距离：跑/跳/滑铲都能吃到 */
  collect(x: number, z: number, radius: number): number {
    let taken = 0;
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const record = this.active[i];
      if (Math.abs(record.x - x) > radius) continue;
      if (Math.abs(record.z - z) > radius + 0.45) continue;
      record.mesh.visible = false;
      this.pool.push(record.mesh);
      this.active.splice(i, 1);
      taken += 1;
    }
    return taken;
  }

  /**
   * 磁铁吸附：radius 内的奶瓶以固定速度飞向玩家，
   * 进入 MAGNET_COLLECT_RADIUS 就计入收集。每帧位移受 speed*dt 封顶，绝不瞬移。
   */
  attract(px: number, pz: number, radius: number, dt: number): number {
    const step = MAGNET_ATTRACT_SPEED * dt;
    let taken = 0;
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const record = this.active[i];
      const dx = px - record.x;
      const dz = pz - record.z;
      const dist = Math.hypot(dx, dz);
      if (dist > radius) continue;
      if (dist <= MAGNET_COLLECT_RADIUS) {
        record.mesh.visible = false;
        this.pool.push(record.mesh);
        this.active.splice(i, 1);
        taken += 1;
        continue;
      }
      const t = dist > step ? step / dist : 1;
      record.x += dx * t;
      record.z += dz * t;
      record.mesh.position.x = record.x;
      record.mesh.position.z = record.z;
    }
    return taken;
  }

  get activeCount(): number {
    return this.active.length;
  }
}

export type ItemKind = 'magnet' | 'firework' | 'shield';

const ITEM_KINDS: readonly ItemKind[] = ['magnet', 'firework', 'shield'];
const ITEM_POOL_PER_KIND = 6;
const ITEM_DESPAWN_BEHIND = 14;

/** 每种道具的发光颜色：磁铁暖金、烟花橙红、护盾青蓝 */
const ITEM_GLOW_COLORS: Record<ItemKind, number> = {
  magnet: 0xffc247,
  firework: 0xff7a4d,
  shield: 0x5fd4ff,
};

/** 径向渐变贴图（一次性生成）：中心亮、边缘完全透明 */
function createGlowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.72)');
    gradient.addColorStop(0.42, 'rgba(255,255,255,0.24)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 道具发光体：地面一片光斑 + 两片交叉的竖向光晕。
 * 交叉片不需要 billboard，从跑酷视角看过去始终有光晕，且只占 1 次 draw call。
 */
function buildGlowGeometry(): THREE.BufferGeometry {
  const ground = new THREE.PlaneGeometry(1.25, 1.25).rotateX(-Math.PI / 2);
  ground.translate(0, 0.04, 0);
  const parts: THREE.BufferGeometry[] = [ground];
  for (const angle of [0, Math.PI / 2]) {
    const quad = new THREE.PlaneGeometry(0.95, 0.95).rotateY(angle);
    quad.translate(0, ITEM_FLOAT_Y, 0);
    parts.push(quad);
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('道具光晕几何合并失败');
  return merged;
}

interface ItemRecord {
  kind: ItemKind;
  x: number;
  z: number;
  index: number;
}

/**
 * 三种道具共用一个对象池策略：每种一个 InstancedMesh（固定 3 次 draw call），
 * 几何体来自 world/props/items.ts 的已合并顶点色 BufferGeometry，
 * 材质共用一份 MeshStandardMaterial({ vertexColors: true })。
 * 空位实例 scale=0，帧内零 new、零几何/材质重建。
 */
export class ItemField {
  readonly group = new THREE.Group();

  private readonly material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.3,
  });
  private readonly meshes = new Map<ItemKind, THREE.InstancedMesh>();
  private readonly freeIndices = new Map<ItemKind, number[]>();
  private readonly active: ItemRecord[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly glowDummy = new THREE.Object3D();
  private glowMesh: THREE.InstancedMesh | null = null;
  private nextItemZ = ITEM_FIRST_Z;
  private elapsed = 0;
  private blockCheck: ((x: number, z: number) => boolean) | null = null;
  private laneBusy: ((lane: number, z: number) => boolean) | null = null;

  /** 成功刷出统计（验收用） */
  readonly spawned = { magnet: 0, firework: 0, shield: 0 };

  constructor() {
    const builders: Record<ItemKind, () => THREE.BufferGeometry> = {
      magnet: buildMagnetItem,
      firework: buildFireworkItem,
      shield: buildShieldItem,
    };
    for (const kind of ITEM_KINDS) {
      const geometry = builders[kind]();
      const mesh = new THREE.InstancedMesh(geometry, this.material, ITEM_POOL_PER_KIND);
      mesh.name = 'item-' + kind;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const free: number[] = [];
      for (let i = 0; i < ITEM_POOL_PER_KIND; i += 1) {
        this.dummy.position.set(0, -100, 0);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        free.push(i);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.meshes.set(kind, mesh);
      this.freeIndices.set(kind, free);
      this.group.add(mesh);
    }

    // 发光层：document 不存在（node 测试）时跳过，避免 CanvasTexture 报错
    if (typeof document !== 'undefined') {
      const glowMaterial = new THREE.MeshBasicMaterial({
        map: createGlowTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      const glow = new THREE.InstancedMesh(
        buildGlowGeometry(),
        glowMaterial,
        ITEM_KINDS.length * ITEM_POOL_PER_KIND,
      );
      glow.name = 'item-glow';
      glow.frustumCulled = false;
      glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const color = new THREE.Color();
      for (let k = 0; k < ITEM_KINDS.length; k += 1) {
        for (let i = 0; i < ITEM_POOL_PER_KIND; i += 1) {
          this.dummy.position.set(0, -100, 0);
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.setScalar(0);
          this.dummy.updateMatrix();
          glow.setMatrixAt(k * ITEM_POOL_PER_KIND + i, this.dummy.matrix);
          color.setHex(ITEM_GLOW_COLORS[ITEM_KINDS[k]], THREE.SRGBColorSpace);
          glow.setColorAt(k * ITEM_POOL_PER_KIND + i, color);
        }
      }
      glow.instanceMatrix.needsUpdate = true;
      if (glow.instanceColor) glow.instanceColor.needsUpdate = true;
      this.glowMesh = glow;
      this.group.add(glow);
    }
  }

  reset(): void {
    for (const record of this.active) this.release(record);
    this.active.length = 0;
    this.nextItemZ = ITEM_FIRST_Z;
    this.elapsed = 0;
    this.spawned.magnet = 0;
    this.spawned.firework = 0;
    this.spawned.shield = 0;
  }

  setBlockCheck(fn: ((x: number, z: number) => boolean) | null): void {
    this.blockCheck = fn;
  }

  /** 由 game.ts 注入障碍占用检查：道具不落在障碍所在车道附近 */
  setLaneBusy(fn: ((lane: number, z: number) => boolean) | null): void {
    this.laneBusy = fn;
  }

  spawn(kind: ItemKind, lane: number, z: number): boolean {
    const x = LANE_CENTERS[lane];
    if (this.blockCheck && this.blockCheck(x, z)) return false;
    if (this.laneBusy && this.laneBusy(lane, z)) return false;
    const free = this.freeIndices.get(kind);
    const index = free?.pop();
    if (index === undefined) return false;
    this.active.push({ kind, x, z, index });
    this.spawned[kind] += 1;
    return true;
  }

  update(dt: number, playerZ: number, rng: () => number): void {
    this.elapsed += dt;
    while (this.nextItemZ > playerZ - ITEM_SPAWN_AHEAD) this.emitItem(rng);

    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const record = this.active[i];
      if (record.z > playerZ + ITEM_DESPAWN_BEHIND) {
        this.release(record);
        this.active.splice(i, 1);
        continue;
      }
      this.dummy.position.set(
        record.x,
        ITEM_FLOAT_Y + Math.sin(this.elapsed * 2.1 + record.z) * 0.08,
        record.z,
      );
      this.dummy.rotation.set(0, this.elapsed * 2.6 + record.z, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      const mesh = this.meshes.get(record.kind);
      if (mesh) {
        mesh.setMatrixAt(record.index, this.dummy.matrix);
        mesh.instanceMatrix.needsUpdate = true;
      }
      if (this.glowMesh) {
        const glowIndex = ITEM_KINDS.indexOf(record.kind) * ITEM_POOL_PER_KIND + record.index;
        const pulse = 1 + Math.sin(this.elapsed * 3 + record.z) * 0.06;
        this.glowDummy.position.set(record.x, 0, record.z);
        this.glowDummy.rotation.set(0, 0, 0);
        this.glowDummy.scale.setScalar(pulse);
        this.glowDummy.updateMatrix();
        this.glowMesh.setMatrixAt(glowIndex, this.glowDummy.matrix);
      }
    }
    if (this.glowMesh) this.glowMesh.instanceMatrix.needsUpdate = true;
  }

  /** 与奶瓶相同的平面距离判定；返回拾到的第一件道具种类 */
  collect(x: number, z: number, radius: number): ItemKind | null {
    for (let i = this.active.length - 1; i >= 0; i -= 1) {
      const record = this.active[i];
      if (Math.abs(record.x - x) > radius) continue;
      if (Math.abs(record.z - z) > radius + 0.45) continue;
      const kind = record.kind;
      this.release(record);
      this.active.splice(i, 1);
      return kind;
    }
    return null;
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    if (this.glowMesh) {
      const material = this.glowMesh.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
      this.glowMesh.geometry.dispose();
      this.glowMesh.dispose();
      this.glowMesh = null;
    }
    this.material.dispose();
    this.group.removeFromParent();
  }

  get activeCount(): number {
    return this.active.length;
  }

  private release(record: ItemRecord): void {
    this.dummy.position.set(0, -100, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    const mesh = this.meshes.get(record.kind);
    if (mesh) {
      mesh.setMatrixAt(record.index, this.dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.glowMesh) {
      const glowIndex = ITEM_KINDS.indexOf(record.kind) * ITEM_POOL_PER_KIND + record.index;
      this.glowMesh.setMatrixAt(glowIndex, this.dummy.matrix);
      this.glowMesh.instanceMatrix.needsUpdate = true;
    }
    this.freeIndices.get(record.kind)?.push(record.index);
  }

  private emitItem(rng: () => number): void {
    const z = this.nextItemZ;
    const roll = rng();
    const kind: ItemKind = roll < 1 / 3 ? 'magnet' : roll < 2 / 3 ? 'firework' : 'shield';
    const lane = this.pickLane(z, rng);
    if (lane !== null) this.spawn(kind, lane, z);
    this.nextItemZ = z - (ITEM_GAP[0] + rng() * (ITEM_GAP[1] - ITEM_GAP[0]));
  }

  private pickLane(z: number, rng: () => number): number | null {
    const laneCount = LANE_CENTERS.length;
    const start = Math.floor(rng() * laneCount) % laneCount;
    for (let k = 0; k < laneCount; k += 1) {
      const lane = (start + k) % laneCount;
      if (this.laneBusy && this.laneBusy(lane, z)) continue;
      if (this.blockCheck && this.blockCheck(LANE_CENTERS[lane], z)) continue;
      return lane;
    }
    return null;
  }
}
