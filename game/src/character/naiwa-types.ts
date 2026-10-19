export type NaiwaState = 'idle' | 'run' | 'jump' | 'fall' | 'slide' | 'hit' | 'taunt' | 'startle';

export interface NaiwaRig {
  readonly root: Group;
  setState(next: NaiwaState): void;
  setSpeed(ratio: number): void;
  setBellySlide(active: boolean): void;
  update(dt: number): void;
  dispose(): void;
  /** 演出用：'laugh' 进入捧腹大笑，'auto' 还原 */
  setLook?(key: 'auto' | 'laugh'): void;
  /** 跳跃阶段：0 地面 / 1 一段跳 / 2 二段跳（二段跳用专门的跳跃形象） */
  setJumpStage?(stage: 0 | 1 | 2): void;
}

import type { Group } from 'three';
