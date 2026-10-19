import * as THREE from 'three';
import { createCloudGeometry, createSkyDomeGeometry } from './sky';
import { createIslandGeometry } from './islands';
import { createSeaGeometry, createWaveBandGeometry, WATER_Y } from './sea';

export { createSkyDomeGeometry, createCloudGeometry, SKY_RADIUS } from './sky';
export { createSeaGeometry, createWaveBandGeometry, WATER_Y } from './sea';
export { createIslandGeometry } from './islands';

export interface BackdropOptions {
  /** 海在哪一侧：+1 右侧（与 track.ts 的 SEA_SIDE 一致） */
  side?: 1 | -1;
  /** 水线 x（沙带外沿），默认 9.65 = ROAD_HALF_WIDTH + 0.7 + 5 */
  shoreX?: number;
  rng?: () => number;
  sea?: boolean;
  islands?: boolean;
  clouds?: boolean;
}

interface WaveSlot {
  x: number;
  z: number;
  long: number;
  wide: number;
  speed: number;
}

interface SlabSlot {
  x: number;
  z: number;
  width: number;
  height: number;
}

const ISLAND_COUNT = 3;
const WAVE_COUNT = 44;
const CLOUD_COUNT = 9;

const mulberry = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * 大背景：天空穹顶 + 云 + 海面 + 波纹带 + 远岛。
 *
 * 接线（runner-core）：
 *   const backdrop = new Backdrop({ side: 1, shoreX: 9.65 });
 *   scene.add(backdrop.group);
 *   // 每帧：
 *   backdrop.update(dt, player.x, player.z);
 *
 * 穹顶和云整组跟随玩家 x/z（**必须**，否则相机远平面会在天空上切出三角）；
 * 海面与远岛只跟随 z，靠水线位置固定在沙带外沿。
 */
export class Backdrop {
  readonly group = new THREE.Group();

  private readonly sky = new THREE.Group();
  private readonly dome: THREE.Mesh;
  private readonly clouds: THREE.InstancedMesh | null = null;
  private readonly water: THREE.Mesh | null = null;
  private readonly waves: THREE.InstancedMesh | null = null;
  private readonly islandMesh: THREE.InstancedMesh | null = null;
  private readonly waveSlots: WaveSlot[] = [];
  private readonly islandSlots: SlabSlot[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly side: 1 | -1;
  private readonly shoreX: number;
  private elapsed = 0;

  constructor(options: BackdropOptions = {}) {
    this.side = options.side ?? 1;
    this.shoreX = options.shoreX ?? 9.65;
    const rng = options.rng ?? mulberry(0x5ea51de);

    // ---- 天空：不写深度、最先画，永远在所有东西后面 ----
    const domeGeometry = createSkyDomeGeometry();
    const domeMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
    });
    this.dome = new THREE.Mesh(domeGeometry, domeMaterial);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.sky.add(this.dome);

    // ---- 云：只在 |x| 很大的高处，扁平多球 ----
    if (options.clouds !== false) {
      const cloudGeometry = createCloudGeometry();
      const cloudMaterial = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        fog: false,
        toneMapped: false,
      });
      this.clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, CLOUD_COUNT);
      this.clouds.frustumCulled = false;
      this.clouds.renderOrder = -900;
      for (let i = 0; i < CLOUD_COUNT; i += 1) {
        const sign = i % 2 === 0 ? -1 : 1;
        this.dummy.position.set(
          sign * (150 + (i % 5) * 44 + rng() * 30),
          108 + (i % 3) * 34 + rng() * 16,
          -230 - (i % 4) * 80 + rng() * 60,
        );
        this.dummy.rotation.set(0, rng() * Math.PI * 2, 0);
        const scale = 9 + (i % 4) * 3 + rng() * 3;
        this.dummy.scale.set(scale, scale * (0.5 + (i % 3) * 0.08), scale * 0.85);
        this.dummy.updateMatrix();
        this.clouds.setMatrixAt(i, this.dummy.matrix);
      }
      this.clouds.instanceMatrix.needsUpdate = true;
      this.sky.add(this.clouds);
    }
    this.group.add(this.sky);

    // ---- 海面 ----
    if (options.sea !== false) {
      const seaGeometry = createSeaGeometry(this.shoreX, this.side);
      const seaMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
      this.water = new THREE.Mesh(seaGeometry, seaMaterial);
      this.water.frustumCulled = false;
      this.group.add(this.water);

      const waveGeometry = createWaveBandGeometry();
      const waveMaterial = new THREE.MeshBasicMaterial({
        color: 0xcdeaf5,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        toneMapped: false,
      });
      this.waves = new THREE.InstancedMesh(waveGeometry, waveMaterial, WAVE_COUNT);
      this.waves.frustumCulled = false;
      this.waves.renderOrder = 5;
      for (let i = 0; i < WAVE_COUNT; i += 1) {
        this.waveSlots.push({
          x: 2 + rng() * 46,
          z: (rng() - 0.5) * 230,
          long: 5 + rng() * 11,
          wide: 0.5 + rng() * 0.9,
          speed: 0.35 + rng() * 0.65,
        });
      }
      this.group.add(this.waves);
    }

    // ---- 远岛：矮而宽的深色剪影，底部压到水平线下 ----
    if (options.islands !== false) {
      const islandGeometry = createIslandGeometry();
      const islandMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
      this.islandMesh = new THREE.InstancedMesh(islandGeometry, islandMaterial, ISLAND_COUNT);
      this.islandMesh.frustumCulled = false;
      for (let i = 0; i < ISLAND_COUNT; i += 1) {
        this.islandSlots.push({
          x: this.side * (this.shoreX + 150 + i * 105 + rng() * 40),
          z: -215 - i * 62 - rng() * 30,
          width: 55 + rng() * 55,
          height: 3.4 + rng() * 3.2,
        });
      }
      this.group.add(this.islandMesh);
    }

    this.flush();
  }

  /** 每帧：跟随玩家 + 波纹/云漂移 */
  update(dt: number, playerX: number, playerZ: number): void {
    this.elapsed += dt;
    // 穹顶和云必须跟着玩家走，否则会被相机远平面切出三角
    this.sky.position.set(playerX, 0, playerZ);
    if (this.water) this.water.position.z = playerZ;
    if (this.waves) this.waves.position.z = playerZ;
    if (this.islandMesh) this.islandMesh.position.z = playerZ;

    if (this.waves) {
      for (const slot of this.waveSlots) {
        slot.x += slot.speed * dt;
        if (slot.x > 50) slot.x -= 48;
      }
      this.flushWaves();
    }
    if (this.clouds) {
      // 云缓慢横向漂移：位置写死在 |x| 很大的高处，永远不经过画面中心
      for (let i = 0; i < CLOUD_COUNT; i += 1) {
        this.clouds.getMatrixAt(i, this.dummy.matrix);
        this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
        this.dummy.position.x += Math.sign(this.dummy.position.x) * dt * 0.55;
        this.dummy.updateMatrix();
        this.clouds.setMatrixAt(i, this.dummy.matrix);
      }
      this.clouds.instanceMatrix.needsUpdate = true;
    }
  }

  private flush(): void {
    if (this.waves) this.flushWaves();
    if (this.islandMesh) {
      for (let i = 0; i < this.islandSlots.length; i += 1) {
        const slot = this.islandSlots[i];
        this.dummy.position.set(slot.x, WATER_Y - slot.height * 0.34, slot.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(slot.width, slot.height, 1);
        this.dummy.updateMatrix();
        this.islandMesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.islandMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private flushWaves(): void {
    if (!this.waves) return;
    for (let i = 0; i < this.waveSlots.length; i += 1) {
      const slot = this.waveSlots[i];
      this.dummy.position.set(this.side * (this.shoreX + slot.x), WATER_Y + 0.02, slot.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(slot.wide, 1, slot.long);
      this.dummy.updateMatrix();
      this.waves.setMatrixAt(i, this.dummy.matrix);
    }
    this.waves.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    });
  }
}
