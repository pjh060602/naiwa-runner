import { FIXED_DT, MAX_FRAME_DT, MAX_SUBSTEPS } from './config';

export type StepFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

/**
 * 固定步长循环：逻辑只以 FIXED_DT 前进，渲染用 alpha 做插值。
 * 掉帧时最多补 MAX_SUBSTEPS 步，避免"死亡螺旋"。
 */
export class GameLoop {
  fps = 0;

  private raf = 0;
  private last = -1;
  private accumulator = 0;
  private frames = 0;
  private fpsClock = 0;

  constructor(
    private readonly step: StepFn,
    private readonly render: RenderFn,
  ) {}

  get running(): boolean {
    return this.raf !== 0;
  }

  start(): void {
    if (this.raf !== 0) return;
    this.last = -1;
    this.accumulator = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.raf !== 0) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.last = -1;
    this.accumulator = 0;
  }

  private tick = (nowMs: number): void => {
    this.raf = requestAnimationFrame(this.tick);

    const now = nowMs / 1000;
    if (this.last < 0) {
      this.last = now;
      return;
    }

    let frameDt = now - this.last;
    this.last = now;
    if (frameDt > MAX_FRAME_DT) frameDt = MAX_FRAME_DT;

    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === MAX_SUBSTEPS) this.accumulator = 0;

    this.render(this.accumulator / FIXED_DT);

    this.frames += 1;
    this.fpsClock += frameDt;
    if (this.fpsClock >= 0.5) {
      this.fps = this.frames / this.fpsClock;
      this.frames = 0;
      this.fpsClock = 0;
    }
  };
}
