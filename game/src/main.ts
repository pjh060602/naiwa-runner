import './style.css';
import { Game } from './game';
import { loadRig } from './player/rig';
import { loadChaser } from './world/chaser';

const GALLERY_KINDS = ['stool', 'cart', 'awning', 'pole', 'cat', 'fence'] as const;
type GalleryKind = (typeof GALLERY_KINDS)[number];

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed') ?? '');
const seed = Number.isFinite(seedParam) && seedParam > 0 ? Math.floor(seedParam) : Date.now() % 100000;
const bot = params.get('bot') === '1';
const bestParam = params.get('best');
const forcedBest = bestParam !== null && Number.isFinite(Number(bestParam)) ? Math.max(0, Math.floor(Number(bestParam))) : null;
const chaserParam = Number(params.get('chaser') ?? '');
const chaserStart = Number.isFinite(chaserParam) && chaserParam > 0 ? chaserParam : null;
const stageParam = params.get('stage');
const tParam = params.get('t');
const debugStage =
  stageParam === 'caught'
    ? {
        stage: tParam === 'laugh' ? ('laugh' as const) : ('line' as const),
        time: tParam !== null && Number.isFinite(Number(tParam)) ? Number(tParam) : 0.9,
      }
    : null;
const camYaw = params.get('cam') === 'side' ? (40 * Math.PI) / 180 : 0;
const bench = params.get('bench') === '1';
const shot = params.get('shot') === '1';
const benchPR = Number(params.get('benchPR') ?? '0') || 0;
const galleryParam = params.get('gallery');
const gallery: GalleryKind | null =
  galleryParam && (GALLERY_KINDS as readonly string[]).includes(galleryParam) ? (galleryParam as GalleryKind) : null;

const host = document.getElementById('app');
if (!host) throw new Error('缺少 #app 容器');

// ── 日落标题页：任意键 / 点击 / 触屏 / 按钮 触发后，等 body.game-ready 再淡出 ──
// 双条件防「提前按了键但主菜单还没就绪」的空窗：用户已触发 AND body 有 game-ready 类。
const splash = document.getElementById('splash');
const splashEnter = document.getElementById('splash-enter');
let splashTriggered = false;
let splashClosed = false;

function closeSplash(): void {
  if (splashClosed || !splash) return;
  splashClosed = true;
  window.removeEventListener('keydown', onSplashInput);
  window.removeEventListener('pointerdown', onSplashInput);
  window.removeEventListener('touchstart', onSplashInput);
  splashEnter?.removeEventListener('click', onSplashInput);
  splash.classList.add('closing');
  // 移动端幽灵点击防护：手指抬起后浏览器可能在 ~300ms 补发一次 click，
  // 此时封面若已让开，该 click 会落在同坐标的菜单按钮上（曾误触「历史纪录」）。
  // 这段窗口内让菜单不接受指针事件，窗口结束再放开。
  document.body.classList.add('splash-dismissing');
  // CSS 过渡 200ms，结束后彻底让开（display:none），不残留透明全屏层挡点击
  window.setTimeout(() => splash.classList.add('hidden'), 230);
  window.setTimeout(() => document.body.classList.remove('splash-dismissing'), 450);
}

function tryCloseSplash(): void {
  if (splashTriggered && document.body.classList.contains('game-ready')) closeSplash();
}

function onSplashInput(): void {
  // 不 stopPropagation / preventDefault：game.ts 的 audio.unlock()+startBgm() 依赖同一批事件冒泡到 window
  splashTriggered = true;
  tryCloseSplash();
}

if (splash) {
  window.addEventListener('keydown', onSplashInput);
  window.addEventListener('pointerdown', onSplashInput);
  window.addEventListener('touchstart', onSplashInput, { passive: true });
  splashEnter?.addEventListener('click', onSplashInput);
}

void Promise.all([loadRig(), loadChaser()]).then(([rig, chaser]) => {
  const game = new Game(host, rig, chaser, { bot, seed, gallery, forcedBest, chaserStart, debugStage, camYaw, bench, benchPixelRatio: benchPR, shot });
  game.start();
  (window as unknown as Record<string, unknown>).__naiwaGame = game;
  document.body.classList.remove('loading');
  document.body.classList.add('game-ready');
  // 用户若在菜单就绪前已触发过，此时立即关闭封面（主菜单已在背后渲染好，切换无空窗）
  tryCloseSplash();
  console.log(
    `[main] 启动完成（seed=${seed}, bot=${bot}, gallery=${gallery ?? 'off'}, 历史纪录=${forcedBest ?? 'localStorage'}）`,
  );
});
