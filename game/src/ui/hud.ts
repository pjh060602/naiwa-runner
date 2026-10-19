import { mustGet } from '../core/dom';

export interface HudInfo {
  distance: number;
  speed: number;
  bottles: number;
  bottlesPerBoost: number;
  boostLeft: number;
  boostTotal: number;
  state: string;
  chaserDistance: number;
  chaserMax: number;
  chaserDanger: boolean;
}

export class Hud {
  private readonly distanceElement = mustGet('hud-distance');
  private readonly speedElement = mustGet('hud-speed');
  private readonly bottleElement = mustGet('hud-bottles');
  private readonly stateElement = mustGet('hud-state');
  private readonly boostRoot = mustGet('hud-boost');
  private readonly boostFill = mustGet('hud-boost-fill');
  private readonly chaseRoot = mustGet('hud-chase');
  private readonly chaseFill = mustGet('hud-chase-fill');
  private readonly chaseValue = mustGet('hud-chase-value');

  update(info: HudInfo): void {
    this.distanceElement.textContent = `${Math.floor(info.distance)} m`;
    this.speedElement.textContent = `${info.speed.toFixed(1)} m/s`;
    this.bottleElement.textContent = `${info.bottles} / ${info.bottlesPerBoost}`;
    this.stateElement.textContent = info.state;

    // 追兵：0m = 被追上（满格），18m = 安全（空条）；<6m 变红闪烁
    const closeness = 1 - Math.max(0, Math.min(1, info.chaserDistance / info.chaserMax));
    this.chaseFill.style.width = `${(closeness * 100).toFixed(1)}%`;
    this.chaseValue.textContent = `${Math.max(0, info.chaserDistance).toFixed(1)} m`;
    this.chaseRoot.classList.toggle('danger', info.chaserDanger);
    this.chaseValue.classList.toggle('danger', info.chaserDanger);

    if (info.boostLeft > 0) {
      this.boostRoot.classList.remove('hidden');
      const ratio = Math.max(0, Math.min(1, info.boostLeft / info.boostTotal));
      this.boostFill.style.width = `${(ratio * 100).toFixed(1)}%`;
    } else {
      this.boostRoot.classList.add('hidden');
    }
  }
}
