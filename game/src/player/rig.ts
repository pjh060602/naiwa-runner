import * as THREE from 'three';

/** 与 docs/M1-接口契约.md 的 NaiwaRig 保持一致（结构相同，避免依赖不存在的模块）。 */
export type NaiwaState = 'idle' | 'run' | 'jump' | 'fall' | 'slide' | 'hit' | 'taunt' | 'startle' | 'fly';

export interface NaiwaRig {
  readonly root: THREE.Group;
  setState(next: NaiwaState): void;
  setSpeed(ratio: number): void;
  setBellySlide(active: boolean): void;
  /** 0 = 地面，1 = 一段跳，2 = 二段跳（角色模块可选实现） */
  setJumpStage?(stage: 0 | 1 | 2): void;
  update(dt: number): void;
  dispose(): void;
}

/** 占位角色：1.5m 灰色胶囊体（脚底为原点），只在 character 模块缺席时使用。 */
export function createPlaceholderRig(): NaiwaRig {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.75, metalness: 0 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x5e8f5a, roughness: 0.75, metalness: 0 });

  const bodyGeometry = new THREE.CapsuleGeometry(0.31, 0.88, 6, 16);
  const body = new THREE.Mesh(bodyGeometry, bodyMat);
  body.position.y = 0.75;
  pivot.add(body);

  const headGeometry = new THREE.SphereGeometry(0.24, 14, 10);
  const head = new THREE.Mesh(headGeometry, bodyMat);
  head.position.y = 1.3;
  pivot.add(head);

  const eyeGeometry = new THREE.SphereGeometry(0.06, 8, 6);
  for (const offsetX of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMat);
    eye.position.set(offsetX, 1.34, -0.22);
    pivot.add(eye);
  }

  let state: NaiwaState = 'idle';
  let speedRatio = 0;
  let belly = false;
  let clock = 0;
  let squash = 1;
  let tilt = 0;

  return {
    root,
    setState(next: NaiwaState): void {
      state = next;
    },
    setSpeed(ratio: number): void {
      speedRatio = ratio;
    },
    setBellySlide(active: boolean): void {
      belly = active;
    },
    update(dt: number): void {
      clock += dt;
      const targetSquash = belly || state === 'slide' ? 0.42 : 1;
      const targetTilt = state === 'hit' ? 0.45 : state === 'slide' ? -0.35 : 0;
      squash += (targetSquash - squash) * Math.min(1, dt * 18);
      tilt += (targetTilt - tilt) * Math.min(1, dt * 14);
      pivot.scale.y = squash;
      pivot.rotation.x = tilt;

      if (state === 'run') {
        const frequency = 2.2 * Math.max(0.6, speedRatio);
        pivot.position.y = Math.abs(Math.sin(clock * Math.PI * frequency)) * 0.04;
      } else if (state === 'idle') {
        pivot.position.y = Math.sin(clock * Math.PI * 2 * 0.75) * 0.01;
      } else {
        pivot.position.y = 0;
      }
    },
    dispose(): void {
      bodyGeometry.dispose();
      headGeometry.dispose();
      eyeGeometry.dispose();
      bodyMat.dispose();
      eyeMat.dispose();
    },
  };
}

type NaiwaModule = { createNaiwa?: () => NaiwaRig };

/**
 * 优先用 src/character/naiwa.ts 的 createNaiwa()；模块不存在或抛错时落回灰色胶囊体。
 * 用 import.meta.glob 而不是静态 import，保证 character 模块缺席也能 build。
 */
export async function loadRig(): Promise<NaiwaRig> {
  const modules = import.meta.glob<NaiwaModule>('../character/naiwa.ts');
  const loader = modules['../character/naiwa.ts'];
  if (loader) {
    try {
      const module = await loader();
      if (typeof module.createNaiwa === 'function') {
        console.log('[rig] 使用 src/character/naiwa.ts 的 createNaiwa()');
        return module.createNaiwa();
      }
    } catch (error) {
      console.warn('[rig] naiwa 模块加载失败，回退灰色胶囊体占位', error);
    }
  }
  console.log('[rig] 未找到 src/character/naiwa.ts，使用灰色胶囊体占位');
  return createPlaceholderRig();
}
