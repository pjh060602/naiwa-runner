import * as THREE from 'three';
import type { Assets } from '../core/assets';
import { beachGrassGeometry, railingSegmentGeometry } from './props';
import { CHUNK_COUNT, CHUNK_LENGTH, CURB_HEIGHT, ROAD_HALF_WIDTH } from '../core/config';
import { PALETTE } from '../core/palette';

const JOINT_EVERY = 2.6;
const STRIP_WIDTH = (ROAD_HALF_WIDTH * 2) / 3;
const WALK_STRIP = 0.5;
/** 海在这一侧（+X 右侧），棕榈种在另一侧的人行道内侧 */
export const SEA_SIDE = 1;
const SAND_START = ROAD_HALF_WIDTH + WALK_STRIP + 0.2;
const SAND_END = SAND_START + 5;

/** 一块路板：石板步道 + 两侧路缘 + 内侧草地 + 外侧沙滩 */
class Chunk {
  readonly group = new THREE.Group();
  zNear = 0;

  constructor(assets: Assets) {
    const slab = new THREE.Mesh(assets.unitBox, assets.matRoad);
    slab.scale.set(ROAD_HALF_WIDTH * 2, 0.24, CHUNK_LENGTH);
    slab.position.y = -0.12;
    this.group.add(slab);

    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(assets.unitBox, assets.matCurb);
      curb.scale.set(0.26, CURB_HEIGHT, CHUNK_LENGTH);
      curb.position.set(side * (ROAD_HALF_WIDTH + 0.13), CURB_HEIGHT / 2, 0);
      this.group.add(curb);
    }

    // 内侧：窄一点的草地
    const grass = new THREE.Mesh(assets.unitBox, assets.matGrass);
    grass.scale.set(30, 0.2, CHUNK_LENGTH);
    grass.position.set(-SEA_SIDE * (SAND_START + 15), 0.045 - 0.1, 0);
    this.group.add(grass);

    // 外侧：沙滩带（比步道低 0.02，边缘略微下沉）
    const sand = new THREE.Mesh(assets.unitBox, assets.matSand);
    sand.scale.set(SAND_END - SAND_START, 0.2, CHUNK_LENGTH);
    sand.position.set(SEA_SIDE * ((SAND_START + SAND_END) / 2), 0.03 - 0.1, 0);
    this.group.add(sand);
  }

  place(zNear: number): void {
    this.zNear = zNear;
    this.group.position.z = zNear - CHUNK_LENGTH / 2;
  }
}

/**
 * 海滨步道：花岗岩石板 + 海堤栏杆 + 沙滩 + 海面波纹带。
 * 循环复用的都是 InstancedMesh，每种 1 次 draw call。
 */
export class Track {
  readonly group = new THREE.Group();

  private readonly chunks: Chunk[] = [];
  private readonly seams: THREE.InstancedMesh;
  private readonly longSeams: THREE.InstancedMesh;
  private readonly tufts: THREE.InstancedMesh;
  private readonly railPosts: THREE.InstancedMesh;
  private readonly rails: THREE.InstancedMesh;
  private readonly seamSlots: { z: number; x: number }[] = [];
  private readonly tuftSlots: { z: number; x: number; s: number; rot: number; side: number }[] = [];
  private readonly postSlots: number[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly rng: () => number;

  constructor(assets: Assets, rng: () => number = Math.random, count: number = CHUNK_COUNT) {
    this.rng = rng;
    for (let i = 0; i < count; i += 1) {
      const chunk = new Chunk(assets);
      this.chunks.push(chunk);
      this.group.add(chunk.group);
    }

    const stripWidth = STRIP_WIDTH;
    const seamCount = Math.ceil((CHUNK_LENGTH * count) / JOINT_EVERY) * 3;
    this.seams = new THREE.InstancedMesh(
      new THREE.BoxGeometry(stripWidth - 0.12, 0.008, 0.04),
      assets.matSeam,
      seamCount,
    );
    this.seams.frustumCulled = false;
    this.group.add(this.seams);
    for (let i = 0; i < seamCount; i += 1) this.seamSlots.push({ z: 0, x: 0 });

    this.longSeams = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.04, 0.008, CHUNK_LENGTH * count),
      assets.matSeam,
      2,
    );
    this.longSeams.frustumCulled = false;
    this.group.add(this.longSeams);

    // 海风草：内侧草沿 + 沙滩边缘各一批
    this.tufts = new THREE.InstancedMesh(beachGrassGeometry, assets.matProp, 120);
    this.tufts.frustumCulled = false;
    this.group.add(this.tufts);
    for (let i = 0; i < 120; i += 1) this.tuftSlots.push({ z: 0, x: 0, s: 1, rot: 0, side: 1 });

    // 海堤栏杆：柱 + 两道横杆
    this.railPosts = new THREE.InstancedMesh(railingSegmentGeometry, assets.matRail, 120);
    this.railPosts.frustumCulled = false;
    this.group.add(this.railPosts);
    for (let i = 0; i < 120; i += 1) this.postSlots.push(0);

    this.rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.001, 0.001, 0.001), assets.matRail, 2);
    this.rails.frustumCulled = false;
    this.group.add(this.rails);

    // 海面 + 横向波纹带
    this.reset();
  }

  reset(): void {
    this.chunks.forEach((chunk, index) => chunk.place(-index * CHUNK_LENGTH));

    this.seamSlots.forEach((slot, i) => {
      const strip = i % 3;
      slot.x = (strip - 1) * STRIP_WIDTH;
      slot.z = 6 - Math.floor(i / 3) * JOINT_EVERY - (strip * JOINT_EVERY) / 3;
    });
    this.flushSeams();

    const span = CHUNK_LENGTH * CHUNK_COUNT;
    this.tuftSlots.forEach((slot) => {
      const seaSide = this.rng() < 0.45;
      slot.side = seaSide ? SEA_SIDE : -SEA_SIDE;
      slot.z = 6 - this.rng() * span;
      slot.x = slot.side > 0 ? SEA_SIDE * (SAND_START + 0.5 + this.rng() * (SAND_END - SAND_START - 1.3)) : -SEA_SIDE * (SAND_START + this.rng() * 0.5);
      slot.s = 0.7 + this.rng() * 1.1;
      slot.rot = this.rng() * Math.PI;
    });
    this.flushTufts();

    this.postSlots.forEach((_, i) => {
      this.postSlots[i] = 6 - i * 2.4;
    });
    // 必须当场摆位：InstancedMesh 初始是单位矩阵，不 flush 就是 120 根柱子全叠在世界原点，
    // 要等 playerZ 跑过 -2m 触发 update() 里的回收分支才会一次性出现。
    this.flushPosts();
    this.flushLongSegments(0);
  }

  update(playerZ: number): void {
    let minNear = Infinity;
    for (const chunk of this.chunks) minNear = Math.min(minNear, chunk.zNear);
    for (const chunk of this.chunks) {
      if (chunk.zNear > playerZ + CHUNK_LENGTH) {
        chunk.place(minNear - CHUNK_LENGTH);
        minNear = chunk.zNear;
      }
    }

    let seamsMoved = false;
    let minSeam = Infinity;
    for (const slot of this.seamSlots) minSeam = Math.min(minSeam, slot.z);
    for (const slot of this.seamSlots) {
      if (slot.z > playerZ + 6) {
        minSeam -= JOINT_EVERY;
        slot.z = minSeam;
        seamsMoved = true;
      }
    }
    if (seamsMoved) this.flushSeams();
    this.flushLongSegments(playerZ);

    let tuftsMoved = false;
    let minTuft = Infinity;
    for (const slot of this.tuftSlots) minTuft = Math.min(minTuft, slot.z);
    for (const slot of this.tuftSlots) {
      if (slot.z > playerZ + 8) {
        minTuft -= 1.1 + this.rng() * 1.6;
        slot.z = minTuft;
        const seaSide = this.rng() < 0.45;
        slot.side = seaSide ? SEA_SIDE : -SEA_SIDE;
        slot.x = slot.side > 0 ? SEA_SIDE * (SAND_START + 0.5 + this.rng() * (SAND_END - SAND_START - 1.3)) : -SEA_SIDE * (SAND_START + this.rng() * 0.5);
        slot.s = 0.7 + this.rng() * 1.1;
        tuftsMoved = true;
      }
    }
    if (tuftsMoved) this.flushTufts();

    let postsMoved = false;
    let minPost = Infinity;
    for (const z of this.postSlots) minPost = Math.min(minPost, z);
    for (let i = 0; i < this.postSlots.length; i += 1) {
      if (this.postSlots[i] > playerZ + 8) {
        minPost -= 2.4;
        this.postSlots[i] = minPost;
        postsMoved = true;
      }
    }
    if (postsMoved) this.flushPosts();
  }

  private flushSeams(): void {
    for (let i = 0; i < this.seamSlots.length; i += 1) {
      this.dummy.position.set(this.seamSlots[i].x, 0.005, this.seamSlots[i].z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.seams.setMatrixAt(i, this.dummy.matrix);
    }
    this.seams.instanceMatrix.needsUpdate = true;
  }

  private flushLongSegments(playerZ: number): void {
    const length = CHUNK_LENGTH * CHUNK_COUNT;
    for (let i = 0; i < 2; i += 1) {
      this.dummy.position.set((i === 0 ? -1 : 1) * STRIP_WIDTH, 0.004, playerZ - length / 2 + 20);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.longSeams.setMatrixAt(i, this.dummy.matrix);
      // 栏杆横杆：靠海一侧，两道
      this.dummy.scale.set(0.001, 0.001, 0.001);
      this.dummy.position.set(0, -50, playerZ - length / 2 + 20);
      this.dummy.updateMatrix();
      this.rails.setMatrixAt(i, this.dummy.matrix);
    }
    this.longSeams.instanceMatrix.needsUpdate = true;
    this.rails.instanceMatrix.needsUpdate = true;
  }

  private flushTufts(): void {
    for (let i = 0; i < this.tuftSlots.length; i += 1) {
      const slot = this.tuftSlots[i];
      this.dummy.position.set(slot.x, slot.side > 0 ? 0.04 : 0.05, slot.z);
      this.dummy.rotation.set(0, slot.rot, 0);
      this.dummy.scale.set(slot.s * 1.5, slot.s * (0.7 + (i % 5) * 0.12), slot.s);
      this.dummy.updateMatrix();
      this.tufts.setMatrixAt(i, this.dummy.matrix);
    }
    this.tufts.instanceMatrix.needsUpdate = true;
    void PALETTE;
  }

  private flushPosts(): void {
    for (let i = 0; i < this.postSlots.length; i += 1) {
      this.dummy.position.set(SEA_SIDE * (ROAD_HALF_WIDTH + 0.55), 0.03, this.postSlots[i]);
      this.dummy.rotation.set(0, SEA_SIDE > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.railPosts.setMatrixAt(i, this.dummy.matrix);
    }
    this.railPosts.instanceMatrix.needsUpdate = true;
  }


}
