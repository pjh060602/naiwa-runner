import * as THREE from 'three';
import { GeoBuilder } from '../core/geometry';
import { PALETTE } from '../core/palette';

const PATCH_COUNT = 26;
/**
 * 假树影数量：置 0。
 * 道具的接地感由接地暗斑与顶点色烘焙提供，这里不再撒第二层「阴天斑」，避免地面出现来源不明的暗块；
 * 地面还另有 park.ts 的物件接地暗斑 + 顶点色里的接地 AO，第三层同样的暗块纯属重复。
 */
const SHADOW_COUNT = 0;
const PATCH_SPACING = 12;
const GULL_COUNT = 5;

/** 地面阳光斑 / 树影（普通混合、低透明度） */
export class SunPatches {
  readonly group = new THREE.Group();

  private readonly mesh: THREE.InstancedMesh;
  private readonly slots: { z: number; x: number; r: number; shadow: boolean }[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly sunColor = new THREE.Color(PALETTE.sunPatch);
  private readonly shadowColor = new THREE.Color(0x3f5433);
  private readonly rng: () => number;

  constructor(rng: () => number) {
    this.rng = rng;
    const geometry = new GeoBuilder().cylinder(0xffffff, 1.0, 1.0, 0.01, [0, 0.012, 0], 20).build();
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      // 假光斑压到 0.06：真实阴影进场后，原来 0.12 的光斑会和影子抢注意力
      opacity: 0.06,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, PATCH_COUNT + SHADOW_COUNT);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    for (let i = 0; i < PATCH_COUNT + SHADOW_COUNT; i += 1) this.slots.push({ z: 0, x: 0, r: 1, shadow: i >= PATCH_COUNT });
    this.reset();
  }

  reset(): void {
    this.slots.forEach((slot, i) => {
      slot.z = 6 - i * 6;
      slot.x = (this.rng() - 0.5) * 7;
      slot.r = slot.shadow ? 1.4 + this.rng() * 1.8 : 1.6 + this.rng() * 2.4;
    });
    this.flush();
  }

  update(playerZ: number): void {
    let minZ = Infinity;
    for (const slot of this.slots) minZ = Math.min(minZ, slot.z);
    let moved = false;
    for (const slot of this.slots) {
      if (slot.z > playerZ + 10) {
        minZ -= slot.shadow ? 8 + this.rng() * 8 : PATCH_SPACING * (0.7 + this.rng() * 0.8);
        slot.z = minZ;
        slot.x = (this.rng() - 0.5) * 7;
        slot.r = slot.shadow ? 1.4 + this.rng() * 1.8 : 1.6 + this.rng() * 2.4;
        moved = true;
      }
    }
    if (moved) this.flush();
  }

  private flush(): void {
    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      this.dummy.position.set(slot.x, 0.014, slot.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(slot.r * (slot.shadow ? 1.3 : 1), 1, slot.r);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, slot.shadow ? this.shadowColor : this.sunColor);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** 远岛剪影 + 空中海鸥（纯视觉） */
export class TreeLine {
  readonly group = new THREE.Group();

  private readonly islands: THREE.InstancedMesh;
  private readonly gulls: THREE.InstancedMesh;
  private readonly islandSlots: { x: number; z: number; w: number; h: number }[] = [];
  private readonly gullSlots: { x: number; y: number; z: number; phase: number; r: number }[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly rng: () => number;
  private clock = 0;

  constructor(rng: () => number) {
    this.rng = rng;
    const islandGeometry = new GeoBuilder()
      .sphere(0x2f5462, 1.0, [0, 0, 0], 7)
      .sphere(0x27485a, 0.8, [0.95, -0.1, 0], 6)
      .build();
    const islandMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
    this.islands = new THREE.InstancedMesh(islandGeometry, islandMaterial, 4);
    this.islands.frustumCulled = false;
    this.group.add(this.islands);
    for (let i = 0; i < 4; i += 1) this.islandSlots.push({ x: 0, z: 0, w: 1, h: 1 });

    const gullGeometry = new GeoBuilder()
      .box(0xf6f6f2, [0.5, 0.06, 0.16], [0, 0, 0])
      .box(0xe8e8e2, [0.28, 0.05, 0.1], [-0.3, 0.04, 0.05], [0, 0.4, 0.3])
      .box(0xe8e8e2, [0.28, 0.05, 0.1], [0.3, 0.04, -0.05], [0, -0.4, 0.3])
      .build();
    const gullMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
    this.gulls = new THREE.InstancedMesh(gullGeometry, gullMaterial, GULL_COUNT);
    this.gulls.frustumCulled = false;
    this.group.add(this.gulls);
    for (let i = 0; i < GULL_COUNT; i += 1) {
      this.gullSlots.push({ x: 0, y: 0, z: 0, phase: this.rng() * Math.PI * 2, r: 1 });
    }
    this.reset();
  }

  reset(): void {
    this.islandSlots.forEach((slot, i) => {
      slot.x = 60 + i * 90 + this.rng() * 40;
      slot.z = -300 - this.rng() * 120;
      slot.w = 40 + this.rng() * 50;
      slot.h = 2.2 + this.rng() * 2.2;
    });
    this.gullSlots.forEach((slot, i) => {
      slot.x = 10 + (i % 3) * 14 + this.rng() * 8;
      slot.y = 16 + this.rng() * 10;
      slot.z = -40 - i * 18;
      slot.r = 0.8 + this.rng() * 0.5;
    });
    this.flush();
    console.log(
      `[bg] 远岛 4 座：宽 ${this.islandSlots.map((s) => s.w.toFixed(0)).join('/')}m ` +
        `高 ${this.islandSlots.map((s) => s.h.toFixed(1)).join('/')}m，底部 y=-2.4；云 10 片全部高 120m+、只在两侧`,
    );
  }

  update(playerZ: number): void {
    this.clock += 1 / 60;
    for (const slot of this.gullSlots) {
      if (slot.z > playerZ + 30) {
        slot.z = playerZ - 160 - this.rng() * 40;
        slot.x = 10 + this.rng() * 40;
        slot.y = 16 + this.rng() * 12;
      }
    }
    for (const slot of this.islandSlots) {
      if (slot.z > playerZ - 200) {
        slot.z -= 420;
        slot.x = 60 + this.rng() * 160;
      }
    }
    this.flush();
  }

  private flush(): void {
    for (let i = 0; i < this.islandSlots.length; i += 1) {
      const slot = this.islandSlots[i];
      this.dummy.position.set(slot.x, -2.4, slot.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(slot.w, slot.h, slot.w * 0.5);
      this.dummy.updateMatrix();
      this.islands.setMatrixAt(i, this.dummy.matrix);
    }
    this.islands.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.gullSlots.length; i += 1) {
      const slot = this.gullSlots[i];
      const sway = Math.sin(this.clock * 0.8 + slot.phase) * 3;
      this.dummy.position.set(slot.x + sway, slot.y + Math.sin(this.clock * 1.3 + slot.phase) * 0.8, slot.z);
      this.dummy.rotation.set(0, Math.sin(this.clock * 0.5 + slot.phase) * 0.6, Math.sin(this.clock * 2.2 + slot.phase) * 0.25);
      this.dummy.scale.setScalar(slot.r);
      this.dummy.updateMatrix();
      this.gulls.setMatrixAt(i, this.dummy.matrix);
    }
    this.gulls.instanceMatrix.needsUpdate = true;
  }
}
