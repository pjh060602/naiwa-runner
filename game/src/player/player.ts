import {
  BELLY_HEIGHT,
  BELLY_HOLD_ENTER,
  BELLY_LANE_CHANGE_MULT,
  BELLY_MAX_TIME,
  BELLY_POP_HEIGHT,
  BELLY_SPEED_MULT,
  GRAVITY,
  JUMP_SPEED,
  LANE_CENTERS,
  LANE_CHANGE_TIME,
  PLAYER_HALF_DEPTH,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  SLIDE_COOLDOWN,
  SLIDE_HEIGHT,
  SLIDE_TIME,
  STAGGER_SPEED_MULT,
  STAGGER_TIME,
} from '../core/config';
import type { AABB } from './collision';

const easeInOutQuad = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
/** 空中按 ↓ 的输入缓冲窗口：落地当帧立刻滑铲，手感和"落地瞬间按下"一致 */
const SLIDE_BUFFER = 0.15;
/** 二段跳初速倍率：9.0 → 7.2，像空中再蹬一下 */
const DOUBLE_JUMP_MULT = 1.05;

/**
 * 三车道玩家状态机 + 抛物线竖直物理 + AABB。
 * 滑铲分两种：轻点 = 0.5s 普通滑铲（盒高 0.6）；长按 = 肚皮滑行（盒高 0.5、最长 1.4s、速度 ×1.1、换道变笨、松手小跳）。
 */
export class Player {
  lane = 1;
  x = 0;
  y = 0;
  z = 0;
  vy = 0;
  grounded = true;
  sliding = false;
  belly = false;
  height: number = PLAYER_HEIGHT;

  prevX = 0;
  prevY = 0;
  prevZ = 0;

  private moving = false;
  private moveFromX = 0;
  private moveToX = 0;
  private moveElapsed = 0;
  private moveDuration = LANE_CHANGE_TIME;
  private slideElapsed = 0;
  private bellyElapsed = 0;
  private pressElapsed = 0;
  private holding = false;
  private cooldown = 0;
  /** 空中按下 ↓ 的缓冲：落地那一帧立刻转成滑铲（不取消跳跃，空中不会滑） */
  private slideBuffer = 0;
  /** 本次离地已经跳了几段（落地清零） */
  private jumpsUsed = 0;
  /** 撞到障碍后的踉跄剩余时间：速度 ×0.6，无无敌帧（同一个障碍只算一次） */
  private staggerLeft = 0;

  get distance(): number {
    return -this.z;
  }

  /** 肚皮滑行时整体速度 ×1.1 */
  get speedMult(): number {
    return this.belly ? BELLY_SPEED_MULT : 1;
  }

  /** 踉跄中整体速度 ×0.6 */
  get staggerMult(): number {
    return this.staggerLeft > 0 ? STAGGER_SPEED_MULT : 1;
  }

  get staggering(): boolean {
    return this.staggerLeft > 0;
  }

  stagger(): void {
    this.staggerLeft = STAGGER_TIME;
  }

  /** 滑铲冷却剩余（秒），供 HUD 调试 */
  get cooldownLeft(): number {
    return this.cooldown;
  }

  reset(): void {
    this.lane = 1;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.prevZ = 0;
    this.vy = 0;
    this.grounded = true;
    this.sliding = false;
    this.belly = false;
    this.height = PLAYER_HEIGHT;
    this.moving = false;
    this.moveElapsed = 0;
    this.moveDuration = LANE_CHANGE_TIME;
    this.slideElapsed = 0;
    this.bellyElapsed = 0;
    this.pressElapsed = 0;
    this.holding = false;
    this.cooldown = 0;
    this.slideBuffer = 0;
    this.jumpsUsed = 0;
    this.staggerLeft = 0;
  }

  /** 换道：真位移，缓动 0.16s；肚皮滑行时 ×1.4 变笨 */
  moveLane(dir: -1 | 1): boolean {
    const nextLane = Math.min(LANE_CENTERS.length - 1, Math.max(0, this.lane + dir));
    if (nextLane === this.lane) return false;
    this.lane = nextLane;
    this.moveFromX = this.x;
    this.moveToX = LANE_CENTERS[nextLane];
    this.moveElapsed = 0;
    this.moveDuration = LANE_CHANGE_TIME * (this.belly ? BELLY_LANE_CHANGE_MULT : 1);
    this.moving = true;
    return true;
  }

  /**
   * 跳跃：地面 = 一段（JUMP_SPEED），空中可再补一次二段（0.8 倍初速）。
   * 返回本次是第几段（0 = 本次没跳成），调用方据此外放音效与贴图。
   */
  jump(): 0 | 1 | 2 {
    if (!this.grounded && this.jumpsUsed >= 2) return 0;
    const stage: 1 | 2 = this.grounded ? 1 : 2;
    if (this.sliding) this.endSlide(false);
    this.vy = stage === 1 ? JUMP_SPEED : JUMP_SPEED * DOUBLE_JUMP_MULT;
    this.grounded = false;
    this.jumpsUsed = stage;
    return stage;
  }

  /** 0 = 在地面，1 = 一段跳中，2 = 二段跳中（给 rig.setJumpStage 用） */
  get jumpStage(): 0 | 1 | 2 {
    if (this.grounded) return 0;
    return this.jumpsUsed >= 2 ? 2 : 1;
  }

  /** 按下 ↓：起滑（轻点=普通滑铲，按住 0.15s 后升级为肚皮滑行） */
  pressSlide(): boolean {
    if (this.sliding || this.cooldown > 0) return false;
    if (!this.grounded) {
      // 空中按下：不取消跳跃、也不会滑，只记 0.15s，落地当帧生效
      this.slideBuffer = SLIDE_BUFFER;
      return false;
    }
    this.startSlide();
    return true;
  }

  private startSlide(): void {
    this.sliding = true;
    this.belly = false;
    this.holding = true;
    this.pressElapsed = 0;
    this.slideElapsed = 0;
    this.bellyElapsed = 0;
    this.slideBuffer = 0;
    this.height = SLIDE_HEIGHT;
  }

  /** 松开 ↓：肚皮滑行立刻收势并弹起 0.8m；普通滑铲照常跑完 0.5s */
  releaseSlide(): void {
    this.holding = false;
    if (this.sliding && this.belly) this.endSlide(true);
  }

  endSlide(pop: boolean): void {
    const wasBelly = this.belly;
    this.sliding = false;
    this.belly = false;
    this.height = PLAYER_HEIGHT;
    this.slideElapsed = 0;
    this.bellyElapsed = 0;
    this.pressElapsed = 0;
    this.cooldown = SLIDE_COOLDOWN;
    if (pop && wasBelly && this.grounded) {
      this.vy = Math.sqrt(2 * GRAVITY * BELLY_POP_HEIGHT);
      this.grounded = false;
    }
  }

  advance(dz: number): void {
    this.z -= dz;
  }

  update(dt: number): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevZ = this.z;

    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.staggerLeft > 0) this.staggerLeft = Math.max(0, this.staggerLeft - dt);

    if (this.moving) {
      this.moveElapsed += dt;
      const t = Math.min(1, this.moveElapsed / this.moveDuration);
      this.x = this.moveFromX + (this.moveToX - this.moveFromX) * easeInOutQuad(t);
      if (t >= 1) {
        this.moving = false;
        this.x = this.moveToX;
      }
    }

    if (this.sliding) {
      this.slideElapsed += dt;
      if (this.holding) this.pressElapsed += dt;

      if (!this.belly && this.holding && this.pressElapsed >= BELLY_HOLD_ENTER) {
        this.belly = true;
        this.bellyElapsed = 0;
        this.height = BELLY_HEIGHT;
      }

      if (this.belly) {
        this.bellyElapsed += dt;
        if (this.bellyElapsed >= BELLY_MAX_TIME) this.endSlide(false);
        else if (!this.holding) this.endSlide(false);
      } else if (this.slideElapsed >= SLIDE_TIME) {
        this.endSlide(false);
      }
    }

    if (this.slideBuffer > 0) this.slideBuffer = Math.max(0, this.slideBuffer - dt);

    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        this.jumpsUsed = 0;
        // 落地当帧：把空中的 ↓ 兑现成滑铲（0 帧延迟）
        if (this.slideBuffer > 0 && !this.sliding && this.cooldown <= 0) this.startSlide();
        this.slideBuffer = 0;
      }
    }
  }

  aabb(): AABB {
    return {
      minX: this.x - PLAYER_HALF_WIDTH,
      maxX: this.x + PLAYER_HALF_WIDTH,
      minY: this.y,
      maxY: this.y + this.height,
      minZ: this.z - PLAYER_HALF_DEPTH,
      maxZ: this.z + PLAYER_HALF_DEPTH,
    };
  }
}
