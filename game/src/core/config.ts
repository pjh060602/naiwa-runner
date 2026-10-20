// 手感基准值：来源 docs/M1-接口契约.md、设计文档 §3 与 M2 任务书
export const FIXED_DT = 1 / 60;
export const MAX_FRAME_DT = 0.25;
export const MAX_SUBSTEPS = 5;

// 车道
export const LANE_COUNT = 3;
export const LANE_WIDTH = 2.6;
export const LANE_CENTERS = [-LANE_WIDTH, 0, LANE_WIDTH] as const;
export const LANE_CHANGE_TIME = 0.16;

// 跳跃
export const GRAVITY = 32;
export const JUMP_SPEED = 9;

// 普通滑铲
export const SLIDE_TIME = 0.5;
export const PLAYER_HEIGHT = 1.6;
export const SLIDE_HEIGHT = 0.6;
export const PLAYER_HALF_WIDTH = 0.31;
export const PLAYER_HALF_DEPTH = 0.25;

// 肚皮滑铲（核心记忆点）：长按 ↓，最长 1.4s，盒子压到 0.5m，速度 ×1.1，换道变笨，松手小跳
export const BELLY_HEIGHT = 0.5;
export const BELLY_HOLD_ENTER = 0.15;
export const BELLY_MAX_TIME = 1.4;
export const BELLY_SPEED_MULT = 1.1;
export const BELLY_LANE_CHANGE_MULT = 1.4;
export const BELLY_POP_HEIGHT = 0.8;
export const SLIDE_COOLDOWN = 0.4;

// 速度曲线 v(t) = 14 + 16 * (1 - e^(-t/60))
export const SPEED_BASE = 14;
export const SPEED_GAIN = 16;
export const SPEED_TAU = 60;
export const SPEED_MAX = SPEED_BASE + SPEED_GAIN;

export const speedAt = (t: number): number => SPEED_BASE + SPEED_GAIN * (1 - Math.exp(-t / SPEED_TAU));

// 难度系数：只缩放速度/追兵起点/撞击拉近/障碍间距/BGM 速率，不动基础手感常量
export const DIFFICULTY: Record<'casual' | 'standard' | 'hard', {
  speedScale: number;
  chaserStart: number;
  hitPull: number;
  gapScale: number;
  bgmRate: number;
}> = {
  casual: { speedScale: 0.8, chaserStart: 22, hitPull: 3, gapScale: 1.15, bgmRate: 0.9 },
  standard: { speedScale: 1.0, chaserStart: 18, hitPull: 4, gapScale: 1.0, bgmRate: 1.0 },
  hard: { speedScale: 1.2, chaserStart: 14, hitPull: 5, gapScale: 0.9, bgmRate: 1.1 },
};

// 相机：M2 收紧到后 4.2m / 高 2.2m（角色约占屏高 25%）
export const CAM_BACK = 4.2;
export const CAM_HEIGHT = 2.2;
export const CAM_LATERAL_LAG = 0.12;
export const CAM_LOOK_HEIGHT = 1.15;
export const CAM_LOOK_AHEAD = 3.0;
export const FOV_NEAR = 62;
export const FOV_FAR = 70;

// 世界
// 路面收窄：三车道 ±3.9，留 0.05 边；两侧人行道 + 台阶把视线兜住
export const ROAD_HALF_WIDTH = 3.95;
export const SIDEWALK_WIDTH = 1.75;
export const CURB_HEIGHT = 0.18;
export const CHUNK_LENGTH = 60;
export const CHUNK_COUNT = 4;

// 障碍
export const OBSTACLE_SPAWN_AHEAD = 220;
export const OBSTACLE_DESPAWN_BEHIND = 16;
export const OBSTACLE_FIRST_Z = -40;

// 难度分档（按距离）
export const TIER_NEAR_END = 400;
export const TIER_MID_END = 900;
export const GAP_NEAR: readonly [number, number] = [32, 46];
export const GAP_MID: readonly [number, number] = [22, 32];
export const GAP_DENSE: readonly [number, number] = [15, 23];
export const DOUBLE_OBSTACLE_CHANCE = 0.45;

// 节奏事件：每 250m 连续 3 个同类障碍
export const RHYTHM_EVERY = 250;
export const RHYTHM_COUNT = 3;
export const RHYTHM_GAP = 15;

// 道具与 buff（磁铁 / 烟花 / 护盾）：低频刷新，间隔 150–300m
export const ITEM_FIRST_Z = -140;
export const ITEM_SPAWN_AHEAD = 220;
export const ITEM_GAP: readonly [number, number] = [150, 300];
export const ITEM_FLOAT_Y = 1.05;
export const ITEM_PICKUP_RADIUS = 0.9;

export const MAGNET_TIME = 8;
export const MAGNET_RADIUS = 8;
export const MAGNET_ATTRACT_SPEED = 16;
export const MAGNET_COLLECT_RADIUS = 0.75;

export const FIREWORK_TIME = 3;
export const FIREWORK_SPEED_MULT = 3;
export const FIREWORK_LANDING_GRACE = 0.5;

export const SHIELD_BREAK_INVULN = 0.4;
export const WALL_BUMP_COOLDOWN = 0.6;

// 收集物：奶瓶
export const BOTTLE_PER_BOOST = 20;
export const BOOST_MULT = 1.25;
export const BOOST_TIME = 4;
export const BOTTLE_FLOAT_Y = 1.05;
export const BOTTLE_FIRST_Z = -26;
export const BOTTLE_SPAWN_AHEAD = 200;
export const BOTTLE_GAP: readonly [number, number] = [9, 16];
export const BOTTLE_RADIUS = 0.42;

// 沿街 prefab（路两侧装饰）
export const PREFAB_DESPAWN_BEHIND = 26;
/** 店铺立面：几乎首尾相接，形成连续墙立面 */
export const FACADE_SPACING: readonly [number, number] = [6.05, 6.6];
export const FACADE_SLOT_COUNT = 56;
/** 街边家具（伞/凳/电线杆/灯串）：稀疏摆放 */
export const FURNITURE_SPACING: readonly [number, number] = [9, 15];
export const FURNITURE_SLOT_COUNT = 34;

// 地面光斑（暖黄/品红落点）
export const LIGHT_POOL_SPACING: readonly [number, number] = [9, 15];
export const LIGHT_POOL_SLOT_COUNT = 22;

// 远景灯海（不随风移动，跟随玩家，形成纵深）
export const DISTANT_GLOW_COUNT = 420;

// 演出（INTRO / CAUGHT）：时长由音频驱动，只有镜头过渡段用固定时长
export const STAGE_TURN_SECONDS = 0.9;
export const STAGE_ORBIT_SECONDS = 0.9;
export const CLIP_LAUGH_URL = 'audio/laugh_mid.mp3';
export const CLIP_LAUGH_FALLBACK = 4.0;
export const CLIP_KANG_URL = 'audio/kang_line.mp3';
export const CLIP_KANG_FALLBACK = 2.8;

// 开场对峙过场（INTRO）：总长 4.6s，可跳过
export const INTRO_TOTAL = 4.6;
export const INTRO_FADE_END = 0.5;
export const INTRO_STANDOFF_END = 2.2;
export const INTRO_LUNGE_END = 2.6;
export const INTRO_TURN_END = 3.6;
/** 对峙时追兵相对玩家的站位（正前方，稍偏一侧让两人都入画） */
export const INTRO_CHASER_OFFSET_X = 1.9;
export const INTRO_CHASER_OFFSET_Z = 3.4;
/** 转身后追兵从这个距离开始被拉回 18m */
export const INTRO_CHASE_FROM = 4.0;
/** 正式开局后，第一个障碍至少晚这么久出现（秒） */
export const INTRO_FIRST_OBSTACLE_DELAY = 2.0;

// 追兵（被梗角色追杀）：撞障碍不再直接死，被追上才死
export const CHASER_START = 18;
export const CHASER_HIT_PULL = 4;
export const CHASER_RECOVER = 0.35;
/** HUD 变红/危险阈值（模型渲染只在「被抓住」瞬间，见 world/chaser.ts 的 visible 注释） */
export const CHASER_VISIBLE_RANGE = 6;
/** 追兵 <6m 起相机吊臂线性加长，最多 +2.5m（4.2 → 6.7） */
export const CHASE_CAM_EXTEND_MAX = 2.5;
/**
 * 模型渲染阈值：相机吊臂 base 4.35m、拉长最多 6.85m。
 * 要让追兵在镜头前留 ≥2m 的净空（否则糊满屏幕），解 4.35+(6-d)/6*2.5-d ≥ 2 得 d ≤ 3.4m。
 */
export const CHASER_MODEL_RANGE = 3.4;
export const CHASER_BOOST_PUSH = 6;
export const STAGGER_TIME = 0.35;
export const STAGGER_SPEED_MULT = 0.6;

// 笑声闸门：用户要求笑声只在关键时刻用
export const MILESTONE_EVERY = 500;
export const EASTER_EGG_DISTANCE = 1500;
export const LAUGH_MAX_PER_RUN = 3;
/** 局内里程碑最多用 2 个名额，第 3 个预留给阵亡/结算 */
export const MILESTONE_LAUGH_MAX = 2;
export const LAUGH_COOLDOWN = 20;

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
