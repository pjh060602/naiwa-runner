import * as THREE from 'three';
import {
  FACADE_SLOT_COUNT,
  FACADE_SPACING,
  FURNITURE_SLOT_COUNT,
  FURNITURE_SPACING,
  PREFAB_DESPAWN_BEHIND,
  ROAD_HALF_WIDTH,
} from '../core/config';
import { GeoBuilder } from '../core/geometry';

interface PrefabDef {
  key: string;
  body: THREE.BufferGeometry;
  glow: THREE.BufferGeometry | null;
  /** 沿街占地长度，用于地面反光条长度 */
  footprint: number;
}

const GLOW_TINTS = [0xffcf7a, 0xff5aa8, 0x7fe6ff, 0xfff0c0].map((hex) => new THREE.Color(hex).multiplyScalar(0.82));
/** 地面反光只用暖黄/品红，青色贴在湿地上像破洞 */
const REFLECT_TINTS = [0xffcf7a, 0xff5aa8, 0xfff0c0].map((hex) => new THREE.Color(hex));

/** 变体 A：卷帘门便利店 —— 横栅卷帘 + 雨棚 + 横向灯箱 + 二楼两扇亮窗 */
function buildFacadeA(): PrefabDef {
  const body = new GeoBuilder();
  body.box(0x2b303c, [6.0, 6.8, 3.6], [0, 3.4, -1.7]);
  body.box(0x1f242d, [6.2, 0.32, 3.9], [0, 6.94, -1.7]);
  body.box(0x39404e, [4.6, 2.5, 0.14], [0, 1.25, 0.02]);
  body.box(0x4b5261, [4.6, 0.08, 0.2], [0, 2.1, 0.08]);
  body.box(0x4b5261, [4.6, 0.08, 0.2], [0, 1.5, 0.08]);
  body.box(0x4b5261, [4.6, 0.08, 0.2], [0, 0.9, 0.08]);
  body.box(0x7a3d52, [5.0, 0.12, 1.15], [0, 2.62, 0.58]);
  body.box(0x63303f, [5.0, 0.24, 0.07], [0, 2.48, 1.1]);
  body.box(0x20242c, [4.8, 0.16, 0.85], [0, 0.08, 0.42]);
  body.box(0x3a4152, [1.5, 1.05, 0.12], [-1.5, 4.55, 0.05]);
  body.box(0x3a4152, [1.2, 1.05, 0.12], [1.6, 4.55, 0.05]);
  body.box(0x4a4f58, [0.75, 0.55, 0.55], [2.3, 3.5, 0.35]);
  const glow = new GeoBuilder();
  glow.box(0xffffff, [4.7, 0.44, 0.09], [0, 3.12, 0.12]);
  glow.box(0xffffff, [1.25, 0.86, 0.07], [-1.5, 4.55, 0.1]);
  glow.box(0xffffff, [0.95, 0.72, 0.07], [1.6, 4.55, 0.1]);
  return { key: 'facade-a', body: body.build(), glow: glow.build(), footprint: 6.2 };
}

/** 变体 B：玻璃门面夜宵店 —— 玻璃透亮 + 竖招牌 + 二楼小阳台栏杆 + 门口冷柜 */
function buildFacadeB(): PrefabDef {
  const body = new GeoBuilder();
  body.box(0x2a2f39, [6.0, 6.8, 3.6], [0, 3.4, -1.7]);
  body.box(0x1d222b, [6.2, 0.32, 3.9], [0, 6.94, -1.7]);
  body.box(0x7f868f, [4.8, 2.7, 0.12], [0, 1.35, 0.02]);
  body.box(0x2d3742, [4.4, 2.4, 0.1], [0, 1.25, 0.06]);
  body.box(0x8a8f98, [0.1, 2.4, 0.16], [0, 1.25, 0.1]);
  body.box(0x8a8f98, [4.4, 0.09, 0.16], [0, 1.95, 0.1]);
  body.box(0x24282f, [0.55, 2.3, 0.16], [2.55, 3.5, 0.12]);
  body.box(0x2f6f7f, [5.0, 0.1, 1.0], [0, 2.72, 0.55]);
  body.box(0x255767, [5.0, 0.2, 0.06], [0, 2.6, 1.0]);
  body.box(0x20242c, [4.8, 0.16, 0.85], [0, 0.08, 0.42]);
  body.box(0x8a8f98, [4.6, 0.12, 0.9], [0, 3.62, 0.5]);
  body.box(0x5b626f, [4.6, 0.06, 0.06], [0, 4.24, 0.94]);
  for (let i = 0; i < 7; i += 1) body.box(0x5b626f, [0.05, 0.62, 0.05], [-2.1 + i * 0.7, 3.94, 0.94]);
  body.box(0xdfe3e8, [1.1, 1.35, 0.7], [-1.85, 0.68, 0.5]);
  const glow = new GeoBuilder();
  glow.box(0xffffff, [4.3, 2.3, 0.05], [0, 1.25, 0.12]);
  glow.box(0xffffff, [0.42, 1.9, 0.07], [2.55, 3.5, 0.2]);
  glow.box(0xffffff, [0.9, 1.0, 0.05], [-1.85, 0.68, 0.86]);
  return { key: 'facade-b', body: body.build(), glow: glow.build(), footprint: 6.2 };
}

/** 变体 C：白天关门的老铺 —— 铁卷帘全拉下 + 大幅横招牌 + 屋顶水箱与管线 */
function buildFacadeC(): PrefabDef {
  const body = new GeoBuilder();
  body.box(0x24282f, [6.0, 6.8, 3.6], [0, 3.4, -1.7]);
  body.box(0x191d24, [6.2, 0.32, 3.9], [0, 6.94, -1.7]);
  body.box(0x424852, [5.0, 2.7, 0.14], [0, 1.4, 0.02]);
  for (let i = 0; i < 8; i += 1) body.box(0x4e5561, [5.0, 0.06, 0.18], [0, 0.4 + i * 0.32, 0.09]);
  body.box(0x1b1f28, [5.2, 0.92, 0.22], [0, 3.32, 0.13]);
  body.box(0x20242c, [4.8, 0.16, 0.85], [0, 0.08, 0.42]);
  body.box(0x6b7280, [1.15, 0.9, 1.15], [1.8, 7.3, -1.2]);
  body.cylinder(0x5b626f, 0.08, 0.08, 6.7, [-2.62, 3.35, 0.12], 6);
  body.box(0x4a5160, [0.8, 0.5, 0.5], [2.2, 4.85, 0.32]);
  body.box(0x3a4152, [1.4, 1.0, 0.12], [0.9, 4.6, 0.05]);
  const glow = new GeoBuilder();
  glow.box(0xffffff, [5.0, 0.7, 0.08], [0, 3.32, 0.26]);
  glow.box(0xffffff, [0.62, 0.42, 0.05], [2.2, 4.85, 0.6]);
  glow.box(0xffffff, [1.1, 0.75, 0.06], [0.9, 4.6, 0.1]);
  return { key: 'facade-c', body: body.build(), glow: glow.build(), footprint: 6.2 };
}

function buildUmbrella(): PrefabDef {
  const body = new GeoBuilder();
  body.cylinder(0x6b5a4a, 0.05, 0.05, 2.45, [0, 1.22, 0], 6);
  body.cylinder(0x2f7f6f, 0.02, 1.5, 0.55, [0, 2.62, 0], 10);
  body.box(0x7a4a3a, [1.6, 0.9, 0.85], [0, 0.45, 0]);
  body.box(0xcfc3a8, [1.75, 0.09, 0.95], [0, 0.94, 0]);
  body.box(0x3a3f4a, [1.2, 0.7, 0.5], [0.1, 1.35, 0.1]);
  const glow = new GeoBuilder();
  glow.sphere(0xffffff, 0.09, [0, 2.15, 0.4], 6);
  glow.box(0xffffff, [0.9, 0.1, 0.04], [0.1, 1.5, 0.36]);
  return { key: 'umbrella', body: body.build(), glow: glow.build(), footprint: 2.4 };
}

function buildStoolStack(): PrefabDef {
  const body = new GeoBuilder();
  const colors = [0xc94a3f, 0x3a5fbf, 0xd8b13a];
  colors.forEach((color, index) => {
    const y = 0.18 + index * 0.34;
    const rotY = index * 0.4;
    body.box(color, [0.44, 0.06, 0.44], [0, y + 0.17, 0], [0, rotY, 0]);
    body.box(color, [0.05, 0.34, 0.4], [-0.18, y, 0], [0, rotY, 0]);
    body.box(color, [0.05, 0.34, 0.4], [0.18, y, 0], [0, rotY, 0]);
  });
  return { key: 'stools', body: body.build(), glow: null, footprint: 1.4 };
}

function buildPole(): PrefabDef {
  const body = new GeoBuilder();
  body.cylinder(0x4b4f57, 0.13, 0.16, 7, [0, 3.5, 0], 8);
  body.box(0x363a42, [1.7, 0.09, 0.11], [0, 6.3, 0]);
  body.box(0x363a42, [1.3, 0.09, 0.11], [0, 5.75, 0]);
  body.box(0x2a2e35, [0.5, 0.35, 0.35], [0, 4.6, 0.25]);
  const glow = new GeoBuilder();
  glow.box(0xffffff, [0.42, 0.12, 0.42], [0, 4.42, 0.25]);
  return { key: 'pole', body: body.build(), glow: glow.build(), footprint: 1.2 };
}

function buildLightString(): PrefabDef {
  const body = new GeoBuilder();
  body.box(0x1f2228, [0.05, 0.03, 5.2], [0, 3.35, 0]);
  body.box(0x1f2228, [0.05, 0.03, 5.2], [0, 3.05, 0]);
  const glow = new GeoBuilder();
  for (let i = 0; i < 6; i += 1) {
    const z = -2.2 + i * 0.88;
    const sag = Math.sin((i / 5) * Math.PI) * 0.16;
    glow.sphere(0xffffff, 0.055, [0, 3.3 - sag, z], 5);
    glow.sphere(0xffffff, 0.045, [0, 3.0 - sag, z + 0.3], 5);
  }
  return { key: 'lights', body: body.build(), glow: glow.build(), footprint: 5.2 };
}

interface Slot {
  z: number;
  kind: number;
  instance: number;
  side: number;
  x: number;
  scale: number;
  rotY: number;
  tint: number;
  reflectWidth: number;
  reflectLength: number;
}

interface StreamOptions {
  slots: number;
  spacing: readonly [number, number];
  kinds: number[];
  withReflection: boolean;
}

/**
 * 街景：两条独立流。
 * - 立面流：店铺几乎首尾相接，两侧都排满，形成「巷子」的包裹感
 * - 家具流：伞/凳/电线杆/灯串，稀疏摆放
 * 每条流都是定长槽位循环复用，帧内只重写 instanceMatrix。
 */
export class PrefabField {
  readonly group = new THREE.Group();

  private readonly defs: PrefabDef[] = [
    buildFacadeA(),
    buildFacadeB(),
    buildFacadeC(),
    buildUmbrella(),
    buildStoolStack(),
    buildPole(),
    buildLightString(),
  ];
  // 56 个立面槽位按三种变体平摊，各留余量
  private readonly capacity = [24, 24, 24, 12, 12, 12, 12];
  private readonly bodies: THREE.InstancedMesh[] = [];
  private readonly glows: (THREE.InstancedMesh | null)[] = [];
  private readonly free: number[][] = [];
  private readonly streams: { options: StreamOptions; slots: Slot[]; tails: number[] }[] = [];
  private readonly reflections: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(private readonly rng: () => number) {
    const materialBody = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 });
    const materialGlow = new THREE.MeshBasicMaterial({ vertexColors: true });
    const materialReflect = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.defs.forEach((def, index) => {
      const body = new THREE.InstancedMesh(def.body, materialBody, this.capacity[index]);
      body.frustumCulled = false;
      this.group.add(body);
      this.bodies.push(body);

      if (def.glow) {
        const glow = new THREE.InstancedMesh(def.glow, materialGlow, this.capacity[index]);
        glow.frustumCulled = false;
        this.group.add(glow);
        this.glows.push(glow);
      } else {
        this.glows.push(null);
      }
      this.free.push(Array.from({ length: this.capacity[index] }, (_, i) => i));
    });

    this.reflections = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.01, 1), materialReflect, 48);
    this.reflections.frustumCulled = false;
    this.group.add(this.reflections);

    this.streams = [
      {
        options: { slots: FACADE_SLOT_COUNT, spacing: FACADE_SPACING, kinds: [0, 1, 2], withReflection: true },
        slots: [],
        tails: [6, 6],
      },
      {
        options: { slots: FURNITURE_SLOT_COUNT, spacing: FURNITURE_SPACING, kinds: [3, 4, 5, 6], withReflection: false },
        slots: [],
        tails: [12, 12],
      },
    ];
    for (const stream of this.streams) {
      for (let i = 0; i < stream.options.slots; i += 1) {
        stream.slots.push({ z: 0, kind: -1, instance: -1, side: 1, x: 0, scale: 1, rotY: 0, tint: 0, reflectWidth: 0.4, reflectLength: 3 });
      }
    }
    this.reset();
  }

  reset(): void {
    for (const bucket of this.free) bucket.length = 0;
    this.capacity.forEach((size, index) => {
      for (let i = 0; i < size; i += 1) this.free[index].push(i);
    });
    for (const stream of this.streams) {
      stream.tails = [6, 12];
      for (const slot of stream.slots) {
        slot.kind = -1;
        slot.instance = -1;
      }
      // 左右交替铺满，保证开局两侧就是连续立面
      for (const slot of stream.slots) {
        const side = this.rng() < 0.5 ? -1 : 1;
        this.place(stream, slot, side);
      }
    }
    this.flush();
  }

  update(playerZ: number): void {
    let moved = false;
    for (const stream of this.streams) {
      for (const slot of stream.slots) {
        if (slot.z > playerZ + PREFAB_DESPAWN_BEHIND) {
          const side = slot.side;
          this.release(slot);
          this.place(stream, slot, side);
          moved = true;
        }
      }
    }
    if (moved) this.flush();
  }

  private release(slot: Slot): void {
    if (slot.kind >= 0 && slot.instance >= 0) this.free[slot.kind].push(slot.instance);
    slot.kind = -1;
    slot.instance = -1;
  }

  private place(stream: { options: StreamOptions; slots: Slot[]; tails: number[] }, slot: Slot, side: number): void {
    const sideIndex = side < 0 ? 0 : 1;
    stream.tails[sideIndex] -= stream.options.spacing[0] + this.rng() * (stream.options.spacing[1] - stream.options.spacing[0]);
    slot.z = stream.tails[sideIndex];
    slot.side = side;

    const kinds = stream.options.kinds;
    const offset = kinds.length > 1 ? Math.floor(this.rng() * kinds.length) % kinds.length : 0;
    let chosen = -1;
    let instance = -1;
    for (let attempt = 0; attempt < kinds.length; attempt += 1) {
      const candidate = kinds[(offset + attempt) % kinds.length];
      const taken = this.free[candidate].pop();
      if (taken !== undefined) {
        chosen = candidate;
        instance = taken;
        break;
      }
    }
    if (chosen < 0) {
      slot.kind = -1;
      slot.instance = -1;
      return;
    }
    slot.kind = chosen;
    slot.instance = instance;
    const isFacade = chosen <= 2;
    slot.x = side * (ROAD_HALF_WIDTH + (isFacade ? 1.85 : 1.15) + this.rng() * (isFacade ? 0.5 : 1.5));
    slot.scale = isFacade ? 0.96 + this.rng() * 0.1 : 0.92 + this.rng() * 0.2;
    slot.rotY = -side * (Math.PI / 2) + (this.rng() - 0.5) * (isFacade ? 0.05 : 0.2);
    slot.tint = Math.floor(this.rng() * GLOW_TINTS.length) % GLOW_TINTS.length;
    slot.reflectWidth = 0.35 + this.rng() * 0.45;
    slot.reflectLength = this.defs[chosen].footprint * (1.4 + this.rng() * 1.2);
  }

  private flush(): void {
    for (const body of this.bodies) {
      for (let i = 0; i < body.count; i += 1) body.setMatrixAt(i, this.hidden);
      body.instanceMatrix.needsUpdate = true;
    }
    for (const glow of this.glows) {
      if (!glow) continue;
      for (let i = 0; i < glow.count; i += 1) glow.setMatrixAt(i, this.hidden);
      glow.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < 48; i += 1) this.reflections.setMatrixAt(i, this.hidden);

    let reflectCount = 0;
    for (const stream of this.streams) {
      for (const slot of stream.slots) {
        if (slot.kind < 0 || slot.instance < 0) continue;
        this.dummy.position.set(slot.x, 0, slot.z);
        this.dummy.rotation.set(0, slot.rotY, 0);
        this.dummy.scale.setScalar(slot.scale);
        this.dummy.updateMatrix();
        this.bodies[slot.kind].setMatrixAt(slot.instance, this.dummy.matrix);

        const glow = this.glows[slot.kind];
        if (glow) {
          glow.setMatrixAt(slot.instance, this.dummy.matrix);
          glow.setColorAt(slot.instance, GLOW_TINTS[slot.tint]);
        }

        if (!stream.options.withReflection || reflectCount >= 48) continue;
        const side = slot.x < 0 ? -1 : 1;
        this.dummy.position.set(side * (ROAD_HALF_WIDTH - 0.8), 0.008, slot.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(slot.reflectWidth, 1, slot.reflectLength);
        this.dummy.updateMatrix();
        this.reflections.setMatrixAt(reflectCount, this.dummy.matrix);
        this.reflections.setColorAt(reflectCount, REFLECT_TINTS[slot.tint % REFLECT_TINTS.length]);
        reflectCount += 1;
      }
    }

    for (const glow of this.glows) {
      if (!glow) continue;
      glow.instanceMatrix.needsUpdate = true;
      if (glow.instanceColor) glow.instanceColor.needsUpdate = true;
    }
    this.reflections.instanceMatrix.needsUpdate = true;
    if (this.reflections.instanceColor) this.reflections.instanceColor.needsUpdate = true;
  }
}
