import { mustGet } from '../core/dom';

export interface RunStats {
  distance: number;
  elapsed: number;
  bottles: number;
  hits: number;
  best: number;
  isRecord: boolean;
}

/**
 * 结算面板：本局距离 / 用时 / 奶瓶 / 本局笑声次数 / 历史最高纪录。
 * 按 R 或点击重开；重开后由 Game 负责把各计数器清零。
 */
export class ResultsPanel {
  private readonly root = mustGet('overlay');
  private readonly distanceElement = mustGet('result-distance');
  private readonly timeElement = mustGet('result-time');
  private readonly bottleElement = mustGet('result-bottles');
  private readonly hitElement = mustGet('result-hits');
  private readonly bestElement = mustGet('result-best');
  private readonly recordBadge = mustGet('result-record');

  constructor(private readonly onRestart: () => void) {
    this.root.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.onRestart();
    });
  }

  show(stats: RunStats): void {
    this.distanceElement.textContent = `${stats.distance} m`;
    this.timeElement.textContent = `${stats.elapsed.toFixed(1)} s`;
    this.bottleElement.textContent = `${stats.bottles}`;
    this.hitElement.textContent = `${stats.hits}`;
    this.bestElement.textContent = `${stats.best} m`;
    this.recordBadge.classList.toggle('hidden', !stats.isRecord);
    this.root.classList.remove('hidden');
    this.root.scrollTop = 0;
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
