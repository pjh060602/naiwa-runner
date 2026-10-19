import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Texture,
  TextureLoader,
  SRGBColorSpace,
  type BufferGeometry,
} from 'three';
import type { ChaserSkin } from '../world/chaser';

export type ChaserState = 'run' | 'catch' | 'angry' | 'lunge';

export interface ChaserRig {
  readonly root: Group;
  setSpeed(ratio: number): void;
  setState(s: ChaserState): void;
  setSkin(skin: ChaserSkin): void;
  update(dt: number): void;
  dispose(): void;
}

/** 追兵身高 2.0m，比奶蛙高一头。 */
const HEIGHT = 2.0;
const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const DAMP = 12;

const damp = (current: number, target: number, lambda: number, dt: number): number =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));

/** 袋鼠追兵：与奶蛙同样的正面纸片人，永远朝向相机。 */
export function createChaser(): ChaserRig {
  const root = new Group();
  root.name = 'chaser2d';

  const geometry: BufferGeometry = new PlaneGeometry(HEIGHT, HEIGHT);
  const material = new MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.35,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.y = HEIGHT / 2;
  mesh.name = 'chaser2d.sprite';
  root.add(mesh);

  const loader = new TextureLoader();
  const textures = new Map<ChaserSkin, Texture>();
  let currentSkin: ChaserSkin = 'meituan';
  const skinFiles: ReadonlyArray<[ChaserSkin, string]> = [
    ['meituan', 'models/kang_front_tex.png'],
    ['gdut', 'models/kang_gdut_tex.png'],
  ];
  for (const [skin, file] of skinFiles) {
    loader.load(BASE + file, (t) => {
      t.colorSpace = SRGBColorSpace;
      textures.set(skin, t);
      if (skin === currentSkin) {
        material.map = t;
        material.needsUpdate = true;
      }
    }, undefined, () => undefined);
  }

  let state: ChaserState = 'run';
  let speedRatio = 1;
  let clock = 0;
  let bob = 0;
  let squash = 1;
  let tilt = 0;
  let lean = 0;

  return {
    root,
    setState(next: ChaserState) { state = next; },
    setSkin(skin: ChaserSkin) {
      currentSkin = skin;
      const next = textures.get(skin);
      if (next) {
        material.map = next;
        material.needsUpdate = true;
      }
    },
    setSpeed(ratio: number) { speedRatio = ratio; },
    update(dt: number) {
      clock += dt;
      const freq = 2.4 * Math.max(0.6, speedRatio);
      const phase = clock * Math.PI * freq;
      let bobT = 0;
      let squashT = 1;
      let tiltT = 0;
      let leanT = 0;

      switch (state) {
        case 'run':
          bobT = Math.abs(Math.sin(phase)) * 0.09;
          squashT = 1 + Math.sin(phase * 2) * 0.04;
          tiltT = Math.sin(phase) * 0.07;
          leanT = -0.12;
          break;
        case 'angry':
          bobT = Math.abs(Math.sin(clock * 6.5)) * 0.03;
          squashT = 1 + Math.sin(clock * 6.5) * 0.045;
          tiltT = Math.sin(clock * 5.1) * 0.12;
          leanT = 0.10;
          break;
        case 'lunge':
          squashT = 1.10;
          leanT = 0.34;
          break;
        case 'catch':
          squashT = 0.92;
          leanT = 0.42;
          break;
        default:
          squashT = 1 + Math.sin(clock * 2.0) * 0.02;
          break;
      }

      bob = damp(bob, bobT, DAMP, dt);
      squash = damp(squash, squashT, DAMP, dt);
      tilt = damp(tilt, tiltT, DAMP, dt);
      lean = damp(lean, leanT, DAMP, dt);

      root.position.y = bob;
      mesh.scale.set(1 / Math.sqrt(squash), squash, 1);
      mesh.rotation.z = tilt;
      mesh.rotation.x = lean;
      material.color.setRGB(1, 1, 1);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      for (const t of textures.values()) t.dispose();
    },
  };
}
