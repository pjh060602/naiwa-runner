import { mustGet } from '../core/dom';

export interface RunStats {
  distance: number;
  elapsed: number;
  bottles: number;
  hits: number;
  best: number;
  isRecord: boolean;
  /** 还能不能用复活（本局没用过） */
  canRevive: boolean;
  /** 本局已经用过复活 → 显示「不计入历史纪录」 */
  revived: boolean;
}

/**
 * 结算面板：标题「被追上了」+ 大号距离 / 用时 / 奶瓶 / 撞击次数 / 历史最高纪录。
 * 两个按钮各自绑定：再跑一次 / 返回主菜单；键盘 R（重开）由 Game 的输入层负责。
 */
export class ResultsPanel {
  private readonly root = mustGet('overlay');
  private readonly distanceElement = mustGet('result-distance');
  private readonly timeElement = mustGet('result-time');
  private readonly bottleElement = mustGet('result-bottles');
  private readonly hitElement = mustGet('result-hits');
  private readonly bestElement = mustGet('result-best');
  private readonly recordBadge = mustGet('result-record');
  private readonly restartButton = mustGet('result-restart');
  private readonly menuButton = mustGet('result-menu');
  private readonly reviveButton = mustGet('result-revive');
  private readonly reviveNote = mustGet('result-revive-note');

  constructor(onRestart: () => void, onBackToMenu: () => void, onRevive: () => void) {
    this.restartButton.addEventListener('click', onRestart);
    this.menuButton.addEventListener('click', onBackToMenu);
    this.reviveButton.addEventListener('click', onRevive);
  }

  show(stats: RunStats): void {
    this.distanceElement.textContent = `${stats.distance} m`;
    this.timeElement.textContent = `${stats.elapsed.toFixed(1)} s`;
    this.bottleElement.textContent = `${stats.bottles}`;
    this.hitElement.textContent = `${stats.hits}`;
    this.bestElement.textContent = `${stats.best} m`;
    this.recordBadge.classList.toggle('hidden', !stats.isRecord);
    this.reviveButton.classList.toggle('hidden', !stats.canRevive);
    this.reviveNote.textContent = stats.revived ? '本局已使用复活 · 只记录复活前的成绩' : '';
    this.reviveNote.classList.toggle('hidden', !stats.revived);
    this.root.classList.remove('hidden');
    this.root.scrollTop = 0;
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
