import {
  BOTTLE_FIRST_Z,
  BOTTLE_GAP,
  BOTTLE_SPAWN_AHEAD,
  DOUBLE_OBSTACLE_CHANCE,
  GAP_DENSE,
  GAP_MID,
  GAP_NEAR,
  LANE_CENTERS,
  OBSTACLE_FIRST_Z,
  OBSTACLE_SPAWN_AHEAD,
  RHYTHM_COUNT,
  RHYTHM_EVERY,
  RHYTHM_GAP,
  TIER_MID_END,
  TIER_NEAR_END,
} from '../core/config';
import type { BottleField } from './collectibles';
import type { ObstacleField, ObstacleKind } from './obstacles';

export type Tier = 'near' | 'mid' | 'dense';

type Weight = readonly [ObstacleKind, number];

const WEIGHTS: Record<Tier, readonly Weight[]> = {
  near: [
    ['stool', 30],
    ['cat', 20],
    ['awning', 26],
    ['fence', 12],
    ['pole', 10],
    ['cart', 10],
  ],
  mid: [
    ['stool', 22],
    ['cat', 20],
    ['awning', 20],
    ['fence', 10],
    ['pole', 16],
    ['cart', 20],
  ],
  dense: [
    ['stool', 18],
    ['cat', 20],
    ['awning', 18],
    ['pole', 20],
    ['cart', 24],
  ],
};

const tierOf = (distance: number): Tier => {
  if (distance < TIER_NEAR_END) return 'near';
  if (distance < TIER_MID_END) return 'mid';
  return 'dense';
};

const gapOf = (tier: Tier): readonly [number, number] => {
  if (tier === 'near') return GAP_NEAR;
  if (tier === 'mid') return GAP_MID;
  return GAP_DENSE;
};

const LANE_COUNT = LANE_CENTERS.length;

/**
 * 关卡节奏：按「玩家到达该点时已跑的距离」分三档决定密度与组合，
 * 每 250m 插一次节奏事件（连续 3 个同类障碍）。
 */
export class LevelDirector {
  private nextObstacleZ = OBSTACLE_FIRST_Z;
  private nextBottleZ = BOTTLE_FIRST_Z;
  private nextRhythmDistance = RHYTHM_EVERY;
  rhythmEvents = 0;
  lastTier: Tier = 'near';
  /** 难度缩放：障碍间距统一乘这个系数，开局前由 game.ts 按难度设置 */
  gapScale = 1;

  constructor(
    private readonly obstacles: ObstacleField,
    private readonly bottles: BottleField,
    private readonly rng: () => number,
  ) {}

  reset(): void {
    this.nextObstacleZ = OBSTACLE_FIRST_Z;
    this.nextBottleZ = BOTTLE_FIRST_Z;
    this.nextRhythmDistance = RHYTHM_EVERY;
    this.rhythmEvents = 0;
    this.lastTier = 'near';
  }

  /** 玩家刚开跑时先把整段路填满 */
  prime(playerZ: number): void {
    this.update(playerZ);
  }

  /** 正式开局：把第一个障碍推到「至少 delay 秒之后」再铺满 */
  beginRun(playerZ: number, speed: number, delaySeconds: number): void {
    const firstGap = Math.max(-OBSTACLE_FIRST_Z, speed * delaySeconds * 1.15);
    this.nextObstacleZ = playerZ - firstGap;
    this.nextBottleZ = playerZ - 26;
    this.update(playerZ);
    console.log(
      `[level] 开局：第一个障碍在 ${firstGap.toFixed(0)}m 之后（约 ${(firstGap / Math.max(1, speed)).toFixed(1)}s）`,
    );
  }

  update(playerZ: number): void {
    while (this.nextObstacleZ > playerZ - OBSTACLE_SPAWN_AHEAD) this.emitObstacle();
    while (this.nextBottleZ > playerZ - BOTTLE_SPAWN_AHEAD) this.emitBottle();
  }

  private emitObstacle(): void {
    const z = this.nextObstacleZ;
    const distance = -z;
    const tier = tierOf(distance);
    this.lastTier = tier;

    if (distance >= this.nextRhythmDistance) {
      const kind = this.pickKind(tier);
      const lane = this.pickLane();
      for (let i = 0; i < RHYTHM_COUNT; i += 1) this.obstacles.spawn(kind, lane, z - i * RHYTHM_GAP, this.rng);
      this.rhythmEvents += 1;
      this.nextRhythmDistance += RHYTHM_EVERY;
      this.nextObstacleZ = z - (RHYTHM_COUNT - 1) * RHYTHM_GAP - this.rollGap(tier);
      console.log(`[level] 节奏事件 #${this.rhythmEvents} @${Math.round(distance)}m：${kind} ×${RHYTHM_COUNT}（车道 ${lane}）`);
      return;
    }

    if (tier === 'dense' && this.rng() < DOUBLE_OBSTACLE_CHANCE) {
      const free = Math.floor(this.rng() * LANE_COUNT) % LANE_COUNT;
      for (let lane = 0; lane < LANE_COUNT; lane += 1) {
        if (lane === free) continue;
        this.obstacles.spawn(this.pickKind(tier), lane, z + (this.rng() - 0.5) * 1.6, this.rng);
      }
      console.log(`[level] 双连障碍 @${Math.round(distance)}m（空车道 ${free}）`);
    } else {
      this.obstacles.spawn(this.pickKind(tier), this.pickLane(), z, this.rng);
    }

    this.nextObstacleZ = z - this.rollGap(tier);
  }

  private emitBottle(): void {
    const z = this.nextBottleZ;
    const lane = this.pickLane();
    if (!this.obstacles.laneBusy(lane, z, 4.5)) {
      const count = this.rng() < 0.3 ? 3 : 1;
      for (let i = 0; i < count; i += 1) this.bottles.spawn(lane, z - i * 2.4);
    }
    this.nextBottleZ = z - (BOTTLE_GAP[0] + this.rng() * (BOTTLE_GAP[1] - BOTTLE_GAP[0]));
  }

  private rollGap(tier: Tier): number {
    const [min, max] = gapOf(tier);
    return (min + this.rng() * (max - min)) * this.gapScale;
  }

  private pickLane(): number {
    return Math.floor(this.rng() * LANE_COUNT) % LANE_COUNT;
  }

  private pickKind(tier: Tier): ObstacleKind {
    const table = WEIGHTS[tier];
    let total = 0;
    for (const [, weight] of table) total += weight;
    let roll = this.rng() * total;
    for (const [kind, weight] of table) {
      roll -= weight;
      if (roll <= 0) return kind;
    }
    return table[table.length - 1][0];
  }
}
