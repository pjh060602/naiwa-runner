import * as THREE from 'three';
import {
  CHASER_HIT_PULL,
  CHASER_MODEL_RANGE,
  CHASER_RECOVER,
  CHASER_START,
  CHASER_VISIBLE_RANGE,
  clamp01,
} from '../core/config';

export type ChaserState = 'run' | 'catch' | 'angry' | 'lunge';

/** 与 docs 里约定的接口一致；character/chaser.ts 由另一个执行者提供 */
export interface ChaserRig {
  readonly root: THREE.Group;
  setSpeed(ratio: number): void;
  setState(state: ChaserState): void;
  update(dt: number): void;
  dispose(): void;
}

/**
 * 追兵距离模型：撞障碍拉近、闲时自然拉开、吃完奶瓶加速额外拉开。
 * 距离 ≤ 0 就是「被追上」= 本局结束。
 */
export class ChaseModel {
  distance = CHASER_START;

  reset(): void {
    this.distance = CHASER_START;
  }

  hit(): void {
    this.distance -= CHASER_HIT_PULL;
  }

  push(amount: number): void {
    this.distance = Math.min(CHASER_START, this.distance + amount);
  }

  update(dt: number): void {
    if (this.distance < CHASER_START) {
      this.distance = Math.min(CHASER_START, this.distance + CHASER_RECOVER * dt);
    }
  }

  get caught(): boolean {
    return this.distance <= 0;
  }

  /**
   * 是否渲染模型。
   * 相机吊臂会随追兵靠近而拉长（见 Game.updateCamera），拉到 3.4m 以内时
   * 追兵与镜头之间已经有 ≥2m 净空，可以和角色同框；更远时它在相机后面，渲染也看不见。
   */
  get visible(): boolean {
    return this.caught || this.distance < CHASER_MODEL_RANGE;
  }

  get danger(): boolean {
    return this.distance < CHASER_VISIBLE_RANGE;
  }
}

/** 占位追兵：2.0m 灰色胶囊（原点在脚底、面朝 -Z），带两只红眼指示朝向 */
export function createPlaceholderChaser(): ChaserRig {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x6f747c, roughness: 0.8, metalness: 0 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: new THREE.Color(0xff2020), emissiveIntensity: 0.9 });

  const bodyGeometry = new THREE.CapsuleGeometry(0.36, 1.28, 6, 14);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 1.0;
  pivot.add(body);

  const headGeometry = new THREE.SphereGeometry(0.26, 12, 10);
  const head = new THREE.Mesh(headGeometry, bodyMaterial);
  head.position.y = 1.78;
  pivot.add(head);

  const eyeGeometry = new THREE.SphereGeometry(0.06, 8, 6);
  for (const offsetX of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(offsetX, 1.84, -0.2);
    pivot.add(eye);
  }

  let state: ChaserState = 'run';
  let speedRatio = 1;
  let clock = 0;

  return {
    root,
    setSpeed(ratio: number): void {
      speedRatio = Math.max(0, Math.min(1, ratio));
    },
    setState(next: ChaserState): void {
      state = next;
    },
    update(dt: number): void {
      clock += dt;
      if (state === 'catch') {
        pivot.rotation.x = -0.5;
        pivot.position.y = -0.25;
        pivot.position.z = 0.35;
        return;
      }
      if (state === 'angry') {
        pivot.rotation.x = -0.18;
        pivot.rotation.z = Math.sin(clock * Math.PI * 1.6) * 0.06;
        pivot.position.z = 0;
        pivot.position.y = Math.abs(Math.sin(clock * Math.PI * 3.2)) * 0.09;
        return;
      }
      if (state === 'lunge') {
        pivot.rotation.x = 0.32;
        pivot.rotation.z = 0;
        pivot.position.z = -0.3;
        pivot.position.y = 0.12;
        return;
      }
      pivot.rotation.x = 0.1;
      pivot.rotation.z = 0;
      pivot.position.z = 0;
      pivot.position.y = Math.abs(Math.sin(clock * Math.PI * (2.4 + speedRatio * 1.6))) * 0.06;
    },
    dispose(): void {
      bodyGeometry.dispose();
      headGeometry.dispose();
      eyeGeometry.dispose();
      bodyMaterial.dispose();
      eyeMaterial.dispose();
    },
  };
}

type ChaserModule = { createChaser?: () => ChaserRig };

/** 优先用 src/character/chaser.ts 的 createChaser()；模块没就绪就落回灰色胶囊 */
export async function loadChaser(): Promise<ChaserRig> {
  const modules = import.meta.glob<ChaserModule>('../character/chaser.ts');
  const loader = modules['../character/chaser.ts'];
  if (loader) {
    try {
      const module = await loader();
      if (typeof module.createChaser === 'function') {
        console.log('[chaser] 使用 src/character/chaser.ts 的 createChaser()');
        return module.createChaser();
      }
    } catch (error) {
      console.warn('[chaser] chaser 模块加载失败，回退灰色胶囊占位', error);
    }
  }
  console.log('[chaser] 未找到 src/character/chaser.ts，使用灰色胶囊占位');
  return createPlaceholderChaser();
}

/** 把追兵摆到玩家身后，只在 6m 以内渲染 */
export class ChaserView {
  private x = 0;

  constructor(private readonly rig: ChaserRig) {}

  get root(): THREE.Group {
    return this.rig.root;
  }

  /** 过场里由时间轴直接摆位（对峙站位、朝向） */
  placeManual(x: number, z: number, rotation: number, state: ChaserState, dt: number): void {
    const rig = this.rig;
    rig.root.visible = true;
    rig.root.position.set(x, 0, z);
    rig.root.rotation.y = rotation;
    rig.setState(state);
    rig.setSpeed(1);
    rig.update(dt);
  }

  hide(): void {
    this.rig.root.visible = false;
  }

  update(dt: number, model: ChaseModel, playerZ: number, playerX: number): void {
    const visible = model.visible;
    this.rig.root.visible = visible;
    if (!visible) return;

    this.x += (playerX - this.x) * Math.min(1, dt * 6);
    const behind = Math.max(0.8, model.distance);
    // 贴近时向侧面让开一点：否则它正好挡在角色正后方，会把奶蛙完全盖住（实测）
    const avoid = Math.max(0, Math.min(1, (4 - model.distance) / 4)) * 1.05;
    this.rig.root.position.set(this.x + avoid, 0, playerZ + behind);
    this.rig.root.rotation.y = 0;
    this.rig.setSpeed(clamp01(1 - model.distance / CHASER_START));
    this.rig.setState(model.caught ? 'catch' : 'run');
    this.rig.update(dt);
  }
}
