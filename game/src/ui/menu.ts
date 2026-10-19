import { mustGet } from '../core/dom';

export interface Settings {
  master: boolean;
  bgm: number;
  sfx: number;
  voice: number;
  difficulty: 'casual' | 'standard' | 'hard';
}

export const DEFAULT_SETTINGS: Settings = {
  master: true,
  bgm: 0.6,
  sfx: 0.8,
  voice: 0.9,
  difficulty: 'standard',
};

export interface ScoreEntry {
  distance: number;
  elapsed: number;
  hits: number;
  date: string;
}

export interface HistoryEntry {
  distance: number;
  elapsed: number;
  hits: number;
  bottles: number;
  difficulty: Settings['difficulty'];
  date: string;
}

const SETTINGS_KEY = 'naiwa-settings-v1';
const SCORES_KEY = 'naiwa-scores-v1';
const HISTORY_KEY = 'naiwa-history-v1';
const HISTORY_MAX = 50;
const HISTORY_SHOW = 10;

const DIFFICULTIES: ReadonlyArray<Settings['difficulty']> = ['casual', 'standard', 'hard'];
const DIFFICULTY_LABELS: Record<Settings['difficulty'], string> = { casual: '休闲', standard: '标准', hard: '硬核' };

/** 主菜单按键引导：PC 一套、触屏一套，互斥渲染（只保留一套 DOM） */
const GUIDE_DESKTOP = `
  <div class="guide-col">
    <h3 class="guide-title">基础操作</h3>
    <ul class="guide-list">
      <li><span class="guide-key">← →</span><span>换道</span></li>
      <li><span class="guide-key">↑</span><span>跳（空中再按 ↑ 二段跳）</span></li>
      <li><span class="guide-key">↓</span><span>点按滑铲 / 长按肚皮滑行</span></li>
      <li><span class="guide-key">Esc / P</span><span>暂停</span></li>
    </ul>
  </div>
  <div class="guide-col">
    <h3 class="guide-title">进阶技巧</h3>
    <ul class="guide-list">
      <li>每 5 个奶瓶加速 4s</li>
      <li>撞到障碍只让袋鼠拉近 4m（硬核 5m）</li>
      <li>被追上才结束</li>
    </ul>
  </div>`;

const GUIDE_TOUCH = `
  <div class="guide-col">
    <h3 class="guide-title">基础操作</h3>
    <ul class="guide-list">
      <li>左右滑动换道</li>
      <li>上滑跳（空中再滑一次二段跳）</li>
      <li>下滑滑铲 / 长按肚皮滑行</li>
    </ul>
  </div>
  <div class="guide-col">
    <h3 class="guide-title">进阶技巧</h3>
    <ul class="guide-list">
      <li>每 5 个奶瓶加速 4s</li>
      <li>撞到障碍只让袋鼠拉近 4m（硬核 5m）</li>
      <li>被追上才结束</li>
      <li>点按屏幕可跳过演出</li>
    </ul>
  </div>`;

function isDifficulty(value: unknown): value is Settings['difficulty'] {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    // 只认已知字段：老存档里的 quality 等已删除的键不再带进来
    const p = JSON.parse(raw) as Partial<Settings>;
    const pick = <K extends keyof Settings>(key: K): Settings[K] =>
      typeof p[key] === typeof DEFAULT_SETTINGS[key] ? (p[key] as Settings[K]) : DEFAULT_SETTINGS[key];
    const difficulty = pick('difficulty');
    return {
      master: pick('master'),
      bgm: pick('bgm'),
      sfx: pick('sfx'),
      voice: pick('voice'),
      // 难度只认三个枚举值：手改坏的存档回默认
      difficulty: isDifficulty(difficulty) ? difficulty : DEFAULT_SETTINGS.difficulty,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* 隐私模式忽略 */
  }
}


export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * 成绩合并（纯函数）：距离降序 → 同距离只留用时更短的一条 → 截断前 10。
 * 与浏览器、localStorage 无关，可被 node 断言直接覆盖。
 */
export function mergeScore(list: readonly ScoreEntry[], next: ScoreEntry): ScoreEntry[] {
  const kept: ScoreEntry[] = [];
  for (const entry of [...list, next]) {
    const index = kept.findIndex((item) => item.distance === entry.distance);
    if (index < 0) kept.push(entry);
    else if (entry.elapsed < kept[index].elapsed) kept[index] = entry;
  }
  return kept.sort((a, b) => b.distance - a.distance || a.elapsed - b.elapsed).slice(0, 10);
}

/** 高亮判据：这条成绩是否等同于本局写入值 */
export function isRecordRow(entry: ScoreEntry, lastWritten: ScoreEntry | null): boolean {
  if (!lastWritten) return false;
  return entry.distance === lastWritten.distance && entry.elapsed === lastWritten.elapsed;
}

/** 存储层：生产传 window.localStorage，测试传假对象 */
export function createScoreStore(storage: StorageLike, key = SCORES_KEY) {
  const read = (): ScoreEntry[] => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ScoreEntry[];
      return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
    } catch {
      return [];
    }
  };
  return {
    read,
    write(list: ScoreEntry[]): void {
      try {
        storage.setItem(key, JSON.stringify(list));
      } catch {
        /* ignore */
      }
    },
    add(entry: ScoreEntry): ScoreEntry[] {
      const list = mergeScore(read(), entry);
      this.write(list);
      return list;
    },
    clear(): void {
      try {
        storage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScoreEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

/** 低于这个距离的试玩成绩不进榜，避免榜位被垃圾数据占满 */
export const MIN_SCORE_DISTANCE = 50;

/**
 * 写入一局成绩，返回它在榜单里的名次（1 起，未进前十返回 0）。
 * 规则：同距离只留用时更短的一条；不足 MIN_SCORE_DISTANCE 不写。
 */
export function addScore(entry: ScoreEntry): number {
  if (entry.distance < MIN_SCORE_DISTANCE) {
    console.log('[scores] 距离 ' + entry.distance + 'm < ' + MIN_SCORE_DISTANCE + 'm，不入榜');
    return 0;
  }
  const before = loadScores();
  const list = mergeScore(before, entry);
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  console.log('[scores] 写入后榜单 ' + JSON.stringify(list));
  return list.findIndex((item) => item.distance === entry.distance) + 1;
}

export function clearScores(): void {
  try {
    localStorage.removeItem(SCORES_KEY);
  } catch {
    /* ignore */
  }
}

function sanitizeHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: HistoryEntry[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Partial<HistoryEntry>;
    const difficulty = entry.difficulty;
    if (
      typeof entry.distance === 'number' &&
      Number.isFinite(entry.distance) &&
      typeof entry.elapsed === 'number' &&
      Number.isFinite(entry.elapsed) &&
      typeof entry.hits === 'number' &&
      Number.isFinite(entry.hits) &&
      typeof entry.bottles === 'number' &&
      Number.isFinite(entry.bottles) &&
      typeof entry.date === 'string' &&
      isDifficulty(difficulty)
    ) {
      out.push({
        distance: entry.distance,
        elapsed: entry.elapsed,
        hits: entry.hits,
        bottles: entry.bottles,
        difficulty,
        date: entry.date,
      });
    }
  }
  return out;
}

function sortHistory(list: HistoryEntry[]): HistoryEntry[] {
  return list.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, HISTORY_MAX);
}

function writeHistory(list: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* 隐私模式忽略 */
  }
}

/**
 * 读取历史纪录；旧成绩 key 只迁一次：没有奶瓶与难度数据，按标准难度、0 奶瓶补全。
 */
export function loadHistory(): HistoryEntry[] {
  const stored: HistoryEntry[] = [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) stored.push(...sanitizeHistory(JSON.parse(raw)));
  } catch {
    /* ignore */
  }
  const legacy = loadScores();
  for (const entry of legacy) {
    stored.push({ distance: entry.distance, elapsed: entry.elapsed, hits: entry.hits, bottles: 0, difficulty: 'standard', date: entry.date });
  }
  const sorted = sortHistory(stored);
  if (legacy.length > 0) {
    writeHistory(sorted);
    try {
      localStorage.removeItem(SCORES_KEY);
    } catch {
      /* ignore */
    }
  }
  return sorted;
}

export function addHistory(entry: HistoryEntry): HistoryEntry[] {
  const list = loadHistory();
  list.push(entry);
  const sorted = sortHistory(list);
  writeHistory(sorted);
  console.log('[history] 写入后共 ' + sorted.length + ' 条');
  return sorted;
}

/** 最高纪录：距离最大优先，同距离取用时短的一条 */
export function bestHistory(list: HistoryEntry[]): HistoryEntry | null {
  let best: HistoryEntry | null = null;
  for (const entry of list) {
    if (
      best === null ||
      entry.distance > best.distance ||
      (entry.distance === best.distance && entry.elapsed < best.elapsed)
    ) {
      best = entry;
    }
  }
  return best;
}

export function clearHistory(): void {
  try {
    // 新旧两个 key 都清掉，避免旧 key 里的数据下次读取时又迁移回来
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(SCORES_KEY);
  } catch {
    /* ignore */
  }
}

interface MenuHandlers {
  onStart: () => void;
  onSettingsChange: (settings: Settings) => void;
  onPauseResume?: () => void;
  onPauseRestart?: () => void;
  onPauseMenu?: () => void;
}

/** 主菜单 / 设置 / 历史纪录 / 暂停（纯 DOM，不碰 three） */
export class MenuUI {
  private readonly root = mustGet('menu');
  private readonly panelMenu = mustGet('menu-main');
  private readonly panelSettings = mustGet('panel-settings');
  private readonly panelScores = mustGet('panel-scores');
  private readonly panelPause = mustGet('panel-pause');
  private readonly scoreList = mustGet('score-list');
  private readonly scoreEmpty = mustGet('score-empty');
  private readonly historyBest = mustGet('history-best');
  private readonly confirmRow = mustGet('score-confirm');
  private readonly versionLabel = mustGet('menu-version');
  private readonly diffRoot = mustGet('menu-difficulty');
  private readonly guide = mustGet('menu-guide');
  private readonly guideToggle = mustGet('guide-toggle');

  private settings: Settings;

  constructor(private readonly handlers: MenuHandlers) {
    this.settings = loadSettings();
    this.versionLabel.textContent = 'v0.4 · 本地历史纪录';
    this.renderDeviceTexts();

    mustGet('menu-start').addEventListener('click', () => {
      this.hide();
      this.handlers.onStart();
    });
    mustGet('menu-scores').addEventListener('click', () => this.showScores());
    mustGet('menu-settings').addEventListener('click', () => this.showSettings());
    mustGet('panel-settings-back').addEventListener('click', () => this.showMain());
    mustGet('panel-scores-back').addEventListener('click', () => this.showMain());

    // 矮视口下折叠/展开操作说明（CSS 默认折叠，这里只负责切换与无障碍状态）
    this.guideToggle.addEventListener('click', () => {
      const open = this.panelMenu.classList.toggle('guide-open');
      this.guideToggle.setAttribute('aria-expanded', String(open));
      this.guideToggle.textContent = open ? '操作说明 ▴' : '操作说明 ▾';
    });

    // 难度三选一：改完立即生效并持久化
    this.diffRoot.querySelectorAll<HTMLButtonElement>('button[data-difficulty]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.difficulty;
        if (!isDifficulty(value)) return;
        this.settings.difficulty = value;
        this.renderDifficulty();
        this.commit();
      });
    });
    this.renderDifficulty();

    // 音量总开关
    const master = mustGet('set-master') as HTMLInputElement;
    master.checked = this.settings.master;
    master.addEventListener('change', () => {
      this.settings.master = master.checked;
      this.commit();
    });

    for (const [id, key] of [
      ['set-bgm', 'bgm'],
      ['set-sfx', 'sfx'],
      ['set-voice', 'voice'],
    ] as const) {
      const input = mustGet(id) as HTMLInputElement;
      const label = mustGet(id + '-value');
      input.value = String(Math.round(this.settings[key] * 100));
      label.textContent = input.value;
      input.addEventListener('input', () => {
        this.settings[key] = Number(input.value) / 100;
        label.textContent = input.value;
        this.commit();
      });
    }

    // 暂停面板按钮：只负责回调，面板开合由 game 侧调用 showPause / hidePause
    mustGet('pause-resume').addEventListener('click', () => this.handlers.onPauseResume?.());
    mustGet('pause-restart').addEventListener('click', () => this.handlers.onPauseRestart?.());
    mustGet('pause-menu').addEventListener('click', () => this.handlers.onPauseMenu?.());

    mustGet('score-clear').addEventListener('click', () => {
      this.confirmRow.classList.remove('hidden');
    });
    mustGet('score-cancel').addEventListener('click', () => this.confirmRow.classList.add('hidden'));
    mustGet('score-confirm-yes').addEventListener('click', () => {
      clearHistory();
      this.confirmRow.classList.add('hidden');
      this.renderHistory([]);
    });

    window.addEventListener('resize', () => {
      this.renderDeviceTexts();
    });
    const coarseQuery = window.matchMedia('(pointer: coarse)');
    coarseQuery.addEventListener('change', () => this.renderDeviceTexts());

    this.commit(false);
  }

  get current(): Settings {
    return { ...this.settings };
  }

  show(): void {
    this.root.classList.remove('hidden');
    this.showMain();
    this.applyMenuOpenClass();
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.applyMenuOpenClass();
  }

  showPause(): void {
    this.root.classList.remove('hidden');
    this.panelMenu.classList.add('hidden');
    this.panelSettings.classList.add('hidden');
    this.panelScores.classList.add('hidden');
    this.panelPause.classList.remove('hidden');
    this.applyMenuOpenClass();
  }

  hidePause(): void {
    this.panelPause.classList.add('hidden');
    this.root.classList.add('hidden');
    this.applyMenuOpenClass();
  }

  /** 结算时把本局成绩写进旧榜单（兼容入口；历史纪录面板走 submitHistory） */
  submitScore(entry: ScoreEntry): number {
    return addScore(entry);
  }

  /** 结算时写入历史纪录，返回写入后的总条数 */
  submitHistory(entry: HistoryEntry): number {
    return addHistory(entry).length;
  }

  private showMain(): void {
    this.panelMenu.classList.remove('hidden');
    this.panelSettings.classList.add('hidden');
    this.panelScores.classList.add('hidden');
    this.panelPause.classList.add('hidden');
  }

  private showSettings(): void {
    this.panelMenu.classList.add('hidden');
    this.panelSettings.classList.remove('hidden');
    this.panelScores.classList.add('hidden');
    this.panelPause.classList.add('hidden');
  }

  private showScores(): void {
    this.panelMenu.classList.add('hidden');
    this.panelSettings.classList.add('hidden');
    this.panelPause.classList.add('hidden');
    this.panelScores.classList.remove('hidden');
    this.confirmRow.classList.add('hidden');
    this.renderHistory(loadHistory());
  }

  private renderDifficulty(): void {
    this.diffRoot.querySelectorAll<HTMLButtonElement>('button[data-difficulty]').forEach((button) => {
      button.classList.toggle('active', button.dataset.difficulty === this.settings.difficulty);
    });
  }

  private renderHistory(list: HistoryEntry[]): void {
    const recent = list.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, HISTORY_SHOW);
    this.scoreList.innerHTML = '';
    this.scoreEmpty.classList.toggle('hidden', recent.length > 0);
    const best = bestHistory(list);
    this.historyBest.classList.toggle('hidden', best === null);
    if (best) {
      this.historyBest.textContent =
        '最高纪录：' + best.distance + ' m · 用时 ' + best.elapsed.toFixed(1) + 's · ' + DIFFICULTY_LABELS[best.difficulty];
    }
    recent.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'score-row';
      row.dataset.difficulty = entry.difficulty;
      const date = entry.date.slice(5, 16).replace('T', ' ');
      row.innerHTML =
        '<span class="score-date">' + date + '</span>' +
        '<span class="score-diff">' + DIFFICULTY_LABELS[entry.difficulty] + '</span>' +
        '<span class="score-dist">' + entry.distance + ' m</span>' +
        '<span class="score-time">' + entry.elapsed.toFixed(1) + 's</span>' +
        '<span class="score-bottles">' + entry.bottles + '</span>' +
        '<span class="score-hits">' + entry.hits + '</span>';
      this.scoreList.appendChild(row);
    });
  }

  private applyMenuOpenClass(): void {
    document.body.classList.toggle('menu-open', !this.root.classList.contains('hidden'));
  }

  /** 主菜单操作说明按设备互斥渲染（只保留一套 DOM，避免读屏读到两套） */
  private renderDeviceTexts(): void {
    const touch = this.isTouchLayout();
    this.guide.innerHTML = touch ? GUIDE_TOUCH : GUIDE_DESKTOP;
  }

  private isTouchLayout(): boolean {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
  }

  private commit(persist = true): void {
    if (persist) saveSettings(this.settings);
    this.handlers.onSettingsChange(this.current);
  }
}
