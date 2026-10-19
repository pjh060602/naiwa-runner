import * as THREE from 'three';
import { BOTTLE_FLOAT_Y, LANE_CENTERS } from '../core/config';
import { GeoBuilder } from '../core/geometry';

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
    // 落在道具 0.8m 内的点直接丢弃：奶瓶不该插进长椅/棕榈/救生塔
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

  get activeCount(): number {
    return this.active.length;
  }
}
