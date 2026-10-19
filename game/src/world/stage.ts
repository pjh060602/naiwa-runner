import { STAGE_ORBIT_SECONDS, STAGE_TURN_SECONDS } from '../core/config';

export type StageId = 'intro-laugh' | 'intro-line' | 'intro-turn' | 'caught-line' | 'caught-laugh';
/** 'auto' = 让角色模块用自己的默认贴图（奶蛙全程正面）；'laugh' = 捧腹大笑 */
export type NaiwaTextureKey = 'auto' | 'laugh';
export type NaiwaStageState = 'idle' | 'run' | 'taunt' | 'startle';
export type ChaserStageState = 'run' | 'angry' | 'lunge' | 'catch';

export interface StagePose {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  chaserX: number;
  chaserZ: number;
  chaserRotation: number;
  chaserState: ChaserStageState;
  naiwaState: NaiwaStageState;
  naiwaTexture: NaiwaTextureKey;
  chaserGap: number;
}

/** 背后跟随机位（az=0 在 +Z；-Z 是奶蛙的正面朝向） */
const BEHIND = { az: 0, r: 4.35, h: 2.2 };
/**
 * 正面 3/4 机位。奶蛙是单面纸片人（贴图朝 +Z，转向由引擎侧决定），
 * 所以机位必须待在 +Z 这一侧才看得到正脸；偏左 3.0m 让袋鼠（在 -Z）也能进画。
 */
const FRONT = { az: Math.atan2(-3.4, 4.0), r: Math.hypot(3.4, 4.0), h: 2.1 };
/** 袋鼠站在奶蛙「面前」（奶蛙脸朝 +Z）2.5m 左右，偏右让两人都入画 */
const KANG_X = 2.4;
const KANG_Z = 0.55;

/** 脚本要求：袋鼠与奶蛙间距 2.5m */
/**
 * 追兵也是单面纸片人（正面朝 +Z）。别让它「转身面对奶蛙」——那会把正面转离相机被背面剔除。
 * 纸片人的朝向交给相机侧，这里恒为 0。
 */
const KANG_ROT = 0;
const MID_LOOK = { x: KANG_X * 0.45, y: 1.08, z: KANG_Z * 0.5 };
/** CAUGHT 用胸口高度的机位（不俯视），并且把两人都收进画面 */
const CAUGHT_CAM = { az: -0.35, r: 5.0, h: 1.45 };
const CAUGHT_LOOK = { x: KANG_X * 0.5, y: 1.05, z: KANG_Z * 0.5 };
const RUN_LOOK = { x: 0, y: 1.15, z: -3 };

const smoothstep = (t: number): number => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** 沿弧线绕角色转机位，避免直线插值穿过角色身体 */
const orbitPose = (k: number) => {
  const az = lerp(FRONT.az, BEHIND.az, k);
  const r = lerp(FRONT.r, BEHIND.r, k);
  const h = lerp(FRONT.h, BEHIND.h, k);
  return { x: Math.sin(az) * r, y: h, z: Math.cos(az) * r };
};
const blendLook = (k: number) => ({
  x: lerp(MID_LOOK.x, RUN_LOOK.x, k),
  y: lerp(MID_LOOK.y, RUN_LOOK.y, k),
  z: lerp(MID_LOOK.z, RUN_LOOK.z, k),
});

/**
 * 每个演出段的姿态。t = 这一段已经播放的时间（秒）。
 * INTRO：正面 3/4 停住 → 最后一段沿弧线摇到背后。
 * CAUGHT：从背后沿弧线绕到正面 3/4，让观众看到奶蛙的笑脸。
 */
export function stagePose(id: StageId, t: number): StagePose {

  if (id === 'intro-laugh' || id === 'intro-line' || id === 'intro-turn') {
    const k = id === 'intro-turn' ? smoothstep(t / STAGE_TURN_SECONDS) : 0;
    const cam = orbitPose(k);
    const look = blendLook(k);
    // 固定机位：奶蛙捧腹大笑时镜头必须完全不动（只有 intro-turn 那一段才摇镜）
    return {
      cameraX: cam.x,
      cameraY: cam.y,
      cameraZ: cam.z,
      lookX: look.x,
      lookY: look.y,
      lookZ: look.z,
      chaserX: lerp(KANG_X, 0, k),
      chaserZ: lerp(KANG_Z, 18, k),
      chaserRotation: KANG_ROT,
      chaserState: id === 'intro-turn' ? 'run' : 'angry',
      naiwaState: id === 'intro-turn' ? 'run' : id === 'intro-laugh' ? 'taunt' : 'idle',
      // 台词段奶蛙仍然保持捧腹大笑（贴图切换发生在台词播完之后，见 Game.endStage）
      naiwaTexture: id === 'intro-turn' ? 'auto' : 'laugh',
      chaserGap: lerp(2.5, 18, k),
    };
  }

  const k = smoothstep(t / STAGE_ORBIT_SECONDS);
  // 被抓后的收尾：袋鼠停在奶蛙面前，镜头从背后绕到胸口高度的正面 3/4，
  // 到位（0.9s）之后不再动，给「定格」的感觉。
  const az = lerp(BEHIND.az, CAUGHT_CAM.az, k);
  const r = lerp(BEHIND.r, CAUGHT_CAM.r, k);
  const h = lerp(BEHIND.h, CAUGHT_CAM.h, k);
  const look = {
    x: lerp(RUN_LOOK.x, CAUGHT_LOOK.x, k),
    y: lerp(RUN_LOOK.y, CAUGHT_LOOK.y, k),
    z: lerp(RUN_LOOK.z, CAUGHT_LOOK.z, k),
  };
  return {
    cameraX: Math.sin(az) * r,
    cameraY: h,
    cameraZ: Math.cos(az) * r,
    lookX: look.x,
    lookY: look.y,
    lookZ: look.z,
    chaserX: KANG_X,
    chaserZ: KANG_Z,
    chaserRotation: KANG_ROT,
    chaserState: 'angry',
    naiwaState: 'idle',
    naiwaTexture: id === 'caught-laugh' ? 'laugh' : 'auto',
    chaserGap: 2.5,
  };
}
