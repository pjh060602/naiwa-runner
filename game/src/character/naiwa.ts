import type { NaiwaRig } from './naiwa-types';
import { createNaiwaBillboard } from './naiwa-billboard';

export type { NaiwaState, NaiwaRig } from './naiwa-types';

/** 奶蛙角色：官方立绘纸片人（正面朝相机，贴图切换表现大笑）。 */
export function createNaiwa(): NaiwaRig {
  return createNaiwaBillboard();
}
