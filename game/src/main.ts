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

void Promise.all([loadRig(), loadChaser()]).then(([rig, chaser]) => {
  const game = new Game(host, rig, chaser, { bot, seed, gallery, forcedBest, chaserStart, debugStage, camYaw, bench, benchPixelRatio: benchPR, shot });
  game.start();
  (window as unknown as Record<string, unknown>).__naiwaGame = game;
  document.body.classList.remove('loading');
  console.log(
    `[main] 启动完成（seed=${seed}, bot=${bot}, gallery=${gallery ?? 'off'}, 历史纪录=${forcedBest ?? 'localStorage'}）`,
  );
});
