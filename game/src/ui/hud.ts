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
  magnetLeft: number;
  shieldActive: boolean;
  flyLeft: number;
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
  private readonly buffRoot = mustGet('hud-buffs');
  private readonly magnetBuff = mustGet('hud-buff-magnet');
  private readonly shieldBuff = mustGet('hud-buff-shield');
  private readonly flyBuff = mustGet('hud-buff-fly');

  update(info: HudInfo): void {
    this.distanceElement.textContent = Math.floor(info.distance) + ' m';
    this.speedElement.textContent = info.speed.toFixed(1) + ' m/s';
    this.bottleElement.textContent = info.bottles + ' / ' + info.bottlesPerBoost;
    this.stateElement.textContent = info.state;

    const closeness = 1 - Math.max(0, Math.min(1, info.chaserDistance / info.chaserMax));
    this.chaseFill.style.width = (closeness * 100).toFixed(1) + '%';
    this.chaseValue.textContent = Math.max(0, info.chaserDistance).toFixed(1) + ' m';
    this.chaseRoot.classList.toggle('danger', info.chaserDanger);
    this.chaseValue.classList.toggle('danger', info.chaserDanger);

    if (info.boostLeft > 0) {
      this.boostRoot.classList.remove('hidden');
      const ratio = Math.max(0, Math.min(1, info.boostLeft / info.boostTotal));
      this.boostFill.style.width = (ratio * 100).toFixed(1) + '%';
    } else {
      this.boostRoot.classList.add('hidden');
    }

    let anyBuff = false;
    // 0.05s 以下别再显示「0.0s」残留读数
    if (info.magnetLeft > 0.05) {
      this.magnetBuff.textContent = '磁铁 ' + info.magnetLeft.toFixed(1) + 's';
      this.magnetBuff.classList.remove('hidden');
      anyBuff = true;
    } else {
      this.magnetBuff.classList.add('hidden');
    }
    if (info.shieldActive) {
      this.shieldBuff.classList.remove('hidden');
      anyBuff = true;
    } else {
      this.shieldBuff.classList.add('hidden');
    }
    if (info.flyLeft > 0.05) {
      this.flyBuff.textContent = '飞行 ' + info.flyLeft.toFixed(1) + 's';
      this.flyBuff.classList.remove('hidden');
      anyBuff = true;
    } else {
      this.flyBuff.classList.add('hidden');
    }
    this.buffRoot.classList.toggle('hidden', !anyBuff);
  }
}
