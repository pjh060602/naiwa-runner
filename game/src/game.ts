import * as THREE from 'three';
import { AudioBus } from './audio/audio';
import { Assets } from './core/assets';
import {
  BOTTLE_PER_BOOST,
  BOOST_MULT,
  BOOST_TIME,
  CAM_BACK,
  CAM_HEIGHT,
  CAM_LATERAL_LAG,
  CAM_LOOK_AHEAD,
  CAM_LOOK_HEIGHT,
  CHASE_CAM_EXTEND_MAX,
  CHASER_BOOST_PUSH,
  CHASER_RECOVER,
  CHASER_VISIBLE_RANGE,
  CLIP_KANG_FALLBACK,
  CLIP_KANG_URL,
  CLIP_LAUGH_FALLBACK,
  CLIP_LAUGH_URL,
  DIFFICULTY,
  FIXED_DT,
  FOV_FAR,
  FOV_NEAR,
  INTRO_FIRST_OBSTACLE_DELAY,
  LANE_CENTERS,
  MILESTONE_EVERY,
  SPEED_BASE,
  SPEED_MAX,
  STAGE_TURN_SECONDS,
  clamp01,
  lerp,
  speedAt,
} from './core/config';
import { mustGet } from './core/dom';
import { createInput } from './core/input';
import type { Intent } from './core/input';
import { GameLoop } from './core/loop';
import { mulberry32 } from './core/rng';
import { Player } from './player/player';
import type { NaiwaRig, NaiwaState } from './player/rig';
import { Hud } from './ui/hud';
import { ResultsPanel } from './ui/overlay';
import { MenuUI, bestHistory, loadHistory, loadScores, MIN_SCORE_DISTANCE } from './ui/menu';
import type { Settings } from './ui/menu';
import { BottleField } from './world/collectibles';
import { LevelDirector } from './world/director';
import { ObstacleField } from './world/obstacles';
import type { ObstacleKind, ObstacleRecord } from './world/obstacles';
import { rayAabbEntry } from './player/collision';
import { ChaseModel, ChaserView } from './world/chaser';
import type { ChaserRig } from './world/chaser';
import { SunPatches } from './world/glow';
import { Backdrop } from './world/backdrop';
import { NaiwaTextures } from './world/naiwa-texture';
import { STAGE_ORBIT_SECONDS } from './core/config';
import { stagePose } from './world/stage';
import type { StageId, StagePose } from './world/stage';
import { ParkField } from './world/park';
import { Track } from './world/track';

export interface GameOptions {
  bot: boolean;
  seed: number;
  gallery: ObstacleKind | null;
  forcedBest: number | null;
  chaserStart: number | null;
  debugStage: { stage: 'line' | 'laugh'; time: number } | null;
  camYaw?: number;
  /** ?bench=1：同步连渲三档，输出 JSON 给光影定阈值 */
  bench?: boolean;
  /** ?benchPR=N：bench 时临时把 pixelRatio 拉高，打破 vsync 上限 */
  benchPixelRatio?: number;
  /** ?shot=1：4 秒后把当前帧降采样成 ASCII 亮度图打到 console（绕开 bsk 截图节流） */
  shot?: boolean;
}

type GameState = 'boot' | 'menu' | 'intro' | 'running' | 'caught' | 'result';

const HISTORY_SIZE = 64;
const BOT_JUMP_TIME = 0.28;
const BOT_LANE_LOOK = 16;
const CAM_MIN_BOOM = 1.2;
const CAM_BOOM_TAU = 0.06;

// ?smooth=0 关闭角色的渲染帧插值，用于对比「抖」是不是插值本身造成的
const RIG_LERP = new URLSearchParams(location.search).get('smooth') !== '0';

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly assets = new Assets();
  private readonly player = new Player();
  private readonly hud = new Hud();
  private readonly overlay: ResultsPanel;
  private readonly menu: MenuUI;
  private readonly audio = new AudioBus();
  private readonly naiwaTextures: NaiwaTextures;
  private readonly track: Track;
  private readonly park: ParkField;
  private readonly sunPatches: SunPatches;
  private readonly backdrop: Backdrop;
  private readonly groundPlane: THREE.Mesh;
  private readonly grassPlane: THREE.Mesh;
  private readonly footShadows: THREE.Mesh[] = [];
  private readonly obstacles: ObstacleField;
  private readonly bottles: BottleField;
  private readonly director: LevelDirector;
  private readonly chaser = new ChaseModel();
  private readonly chaserView: ChaserView;
  private readonly chaserRig: ChaserRig;
  private readonly rig: NaiwaRig;
  private readonly rng: () => number;
  private readonly bot: boolean;
  private readonly gallery: ObstacleKind | null;
  private readonly camYaw: number;
  private readonly chaserStartOverride: number | null;
  private readonly benchPixelRatio: number;
  private readonly fade = mustGet('fade');
  private readonly skipHint = mustGet('skip-hint');
  private readonly input: { dispose(): void };
  private readonly loop!: GameLoop;
  private readonly onResize = (): void => this.resize();

  private state: GameState = 'boot';
  private difficulty: Settings['difficulty'] = 'standard';
  private paused = false;
  private stageQueue: StageId[] = [];
  private stageIndex = 0;
  private stageToken = 0;
  private stageTime = 0;
  private stageTimer = 0;
  private stagingPaused = false;
  private naiwaPop = 0;
  private distanceOrigin = 0;
  private elapsed = 0;
  private speed = SPEED_BASE;
  private rigState: NaiwaState = 'idle';
  private bottleCount = 0;
  private boostLeft = 0;
  private hits = 0;
  private stepTimer = 0;
  private lastPassed = 0;
  private dodgeStreak = 0;
  private bellyWas = false;
  private kangWasVisible = false;
  private milestoneNext = MILESTONE_EVERY;
  private readonly camera: THREE.PerspectiveCamera;

  private readonly xHistory = new Float32Array(HISTORY_SIZE);
  private xHead = 0;
  private camX = 0;
  private camY = CAM_HEIGHT;
  private camZ = CAM_BACK;
  private camPrevX = 0;
  private camPrevY = CAM_HEIGHT;
  private camPrevZ = CAM_BACK;
  private lookX = 0;
  private lookY = CAM_LOOK_HEIGHT;
  private lookZ = -CAM_LOOK_AHEAD;
  private lookPrevX = 0;
  private lookPrevY = CAM_LOOK_HEIGHT;
  private lookPrevZ = -CAM_LOOK_AHEAD;
  private fov = FOV_NEAR;
  private fovPrev = FOV_NEAR;
  private camFollowY = 0;
  private readonly rigPrev = new THREE.Vector3();
  private readonly rigCur = new THREE.Vector3();
  private boomLength = CAM_BACK;
  private cpuAccum = 0;
  private cpuFrames = 0;
  private perfTimer = 0;
  private sessionSeconds = 0;
  private drawPeak = 0;
  private triPeak = 0;

  constructor(host: HTMLElement, rig: NaiwaRig, chaserRig: ChaserRig, options: GameOptions) {
    this.rig = rig;
    this.naiwaTextures = new NaiwaTextures(rig);
    this.chaserView = new ChaserView(chaserRig);
    this.chaserRig = chaserRig;
    this.bot = options.bot;
    this.gallery = options.gallery;
    this.camYaw = options.camYaw ?? 0;
    this.chaserStartOverride = options.chaserStart;
    this.benchPixelRatio = options.benchPixelRatio ?? 0;
    this.rng = mulberry32(options.seed);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xdcefff);
    this.scene.fog = new THREE.Fog(0xdcefff, 40, 280);

    this.camera = new THREE.PerspectiveCamera(FOV_NEAR, window.innerWidth / window.innerHeight, 0.1, 420);
    this.camera.position.set(0, CAM_HEIGHT, CAM_BACK);


    this.track = new Track(this.assets, this.rng);
    this.scene.add(this.track.group);
    this.park = new ParkField(this.assets, this.rng);
    this.scene.add(this.park.group);
    this.sunPatches = new SunPatches(this.rng);
    this.scene.add(this.sunPatches.group);
    this.backdrop = new Backdrop({ side: 1, shoreX: 9.65, rng: this.rng });
    this.scene.add(this.backdrop.group);

    const sandGround = new THREE.PlaneGeometry(340, 560);
    sandGround.rotateX(-Math.PI / 2);
    this.groundPlane = new THREE.Mesh(sandGround, this.assets.matSand);
    this.groundPlane.position.set(140, -0.02, 0);
    this.scene.add(this.groundPlane);
    const grassGround = new THREE.PlaneGeometry(340, 560);
    grassGround.rotateX(-Math.PI / 2);
    this.grassPlane = new THREE.Mesh(grassGround, this.assets.matGrass);
    this.grassPlane.position.set(-140, -0.03, 0);
    this.scene.add(this.grassPlane);

    const shadowGeometry = new THREE.CircleGeometry(0.52, 20);
    shadowGeometry.rotateX(-Math.PI / 2);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x2f3a26,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      toneMapped: false,
    });
    for (let i = 0; i < 2; i += 1) {
      const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
      shadow.position.y = 0.02;
      this.footShadows.push(shadow);
      this.scene.add(shadow);
    }

    // 角色必须由 Game 加进场景（main.ts 只负责把 rig 传进来）
    this.scene.add(this.rig.root);
    if (!this.chaserView.root.parent) this.scene.add(this.chaserView.root);

    this.obstacles = new ObstacleField();
    this.scene.add(this.obstacles.group);
    this.bottles = new BottleField();
    this.bottles.setBlockCheck((x, z) => this.park.isBlocked(x, z, 0.8));
    this.scene.add(this.bottles.group);
    this.director = new LevelDirector(this.obstacles, this.bottles, this.rng);

    this.overlay = new ResultsPanel(() => this.restart(), () => this.backToMenu());
    console.log('[scores] 启动时读到的榜单 ' + JSON.stringify(loadScores()));
    this.menu = new MenuUI({
      onStart: () => this.startRun(),
      onSettingsChange: (settings) => this.applySettings(settings),
      onPauseResume: () => this.resume(),
      onPauseRestart: () => this.restartFromPause(),
      onPauseMenu: () => this.backToMenu(),
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (this.state === 'running') this.pause();
        else this.backToMenu();
      } else if (event.key === 'p' || event.key === 'P') {
        this.togglePause();
      }
    });
    mustGet('hud-pause').addEventListener('click', () => {
      if (this.state === 'running') this.pause();
    });

    if (options.gallery) {
      this.player.lane = 0;
      this.player.x = LANE_CENTERS[0];
      this.obstacles.spawn(this.gallery as ObstacleKind, 1, -6, this.rng);
      this.bottles.spawn(1, -13);
      this.state = 'running';
      this.distanceOrigin = this.player.z;
      this.fade.style.opacity = '0';
      this.skipHint.classList.add('hidden');
    }
    if (options.debugStage) this.enterStagingDebug(options.debugStage);

    // 光照必须最后调：它会扫描场景挑投影物、打 receiveShadow、压淡接地暗斑
    // 日光（取消实时阴影后回到三盏灯的简化方案）
    const sun = new THREE.DirectionalLight(0xfff6e0, 2.9);
    sun.position.set(0.35, 0.75, 0.45).normalize().multiplyScalar(60);
    sun.target.position.set(0, 0, -20);
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.scene.add(new THREE.HemisphereLight(0xcfe9ff, 0xe8d9b5, 1.2));
    const fill = new THREE.DirectionalLight(0xdff0ff, 0.55);
    fill.position.set(-0.4, 0.5, 0.7).normalize().multiplyScalar(40);
    this.scene.add(fill);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.applySettings(this.menu.current);

    // 首次用户交互解锁 AudioContext（浏览器自动播放策略）；unlock() 是幂等的
    const unlockAudio = (): void => {
      this.audio.unlock();
      this.audio.startBgm();
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });

    this.input = createInput(this.renderer.domElement, {
      onIntent: (intent) => this.handleIntent(intent),
      onRestart: () => {
        if (this.state === 'result') this.restart();
      },
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'running' && !this.paused) this.pause();
    });
    window.addEventListener('resize', this.onResize);

    if (options.bench) {
      this.runBench();
      return;
    }

    if (options.shot) window.setTimeout(() => this.captureAscii(), 6000);

    // 预热：把场景里所有材质的着色器先编译好，否则起跑瞬间会卡住约 1 秒（场景与障碍还没画出来）
    // 障碍物是跑起来才生成的，compile 之前先各放一个到远处，把它们的材质也编译掉
    this.obstacles.warmupObstacles(this.player.z - 400);
    this.obstacles.reset();
    this.loop = new GameLoop(this.step, this.render);
    this.loop.start();
    console.log(`[game] ready (seed=${options.seed}, bot=${this.bot}, pixelRatio=${this.renderer.getPixelRatio()})`);
    if (this.state === 'boot') this.enterMenu();
  }

  get distance(): number {
    if (this.state === 'boot' || this.state === 'menu' || this.state === 'intro') return 0;
    return this.player.distance - this.distanceOrigin;
  }

  private step = (dt: number): void => {
    if (this.paused) return;
    const cpuStart = performance.now();
    this.sessionSeconds += dt;
    this.backdrop.update(dt, this.player.x, this.player.z);

    if (this.state === 'menu' || this.state === 'boot') {
      this.applyStagePose(stagePose('intro-laugh', 0), dt, false);
      this.cpuAccum += performance.now() - cpuStart;
      return;
    }

    if (this.state === 'intro' || this.state === 'caught') {
      this.updateStage(dt);
      this.cpuAccum += performance.now() - cpuStart;
      return;
    }

    if (this.state === 'running') {
      this.elapsed += dt;
      if (this.boostLeft > 0) this.boostLeft = Math.max(0, this.boostLeft - dt);
      this.speed =
        speedAt(this.elapsed) *
        this.player.speedMult *
        (this.boostLeft > 0 ? BOOST_MULT : 1) *
        this.player.staggerMult *
        DIFFICULTY[this.difficulty].speedScale;
      this.player.update(dt);
      if (this.player.belly && !this.bellyWas) this.audio.play('belly');
      this.bellyWas = this.player.belly;
      this.player.advance(this.speed * dt);
      this.track.update(this.player.z);
      this.park.update(this.player.z);
      this.sunPatches.update(this.player.z);
      this.obstacles.update(dt, this.player.z);
      this.director.update(this.player.z);
      this.bottles.update(dt, this.player.z);
      this.countDodges();
      this.collectBottles();
      this.footsteps(dt);
      this.checkMilestones();
      const chaserMax = DIFFICULTY[this.difficulty].chaserStart;
      if (this.chaser.distance < chaserMax) {
        this.chaser.distance = Math.min(chaserMax, this.chaser.distance + CHASER_RECOVER * dt);
      }
      const kangVisible = this.chaser.visible;
      if (kangVisible) {
        if (!this.kangWasVisible) {
          this.audio.play('kangAppear');
          this.audio.startChaseBed();
        }
        this.audio.setChaseBedIntensity(clamp01(1 - this.chaser.distance / this.chaser.visibleRange));
      } else if (this.kangWasVisible) {
        this.audio.stopChaseBed();
      }
      this.kangWasVisible = kangVisible;
      if (this.bot) this.autoPilot();
      const hit = this.obstacles.hits(this.player.aabb());
      if (hit) this.takeHit(hit);
      this.hud.update({
        distance: this.distance,
        speed: this.speed,
        bottles: this.bottleCount % BOTTLE_PER_BOOST,
        bottlesPerBoost: BOTTLE_PER_BOOST,
        boostLeft: this.boostLeft,
        boostTotal: BOOST_TIME,
        state: this.statusText(),
        chaserDistance: this.chaser.distance,
        chaserMax,
        chaserDanger: this.chaser.danger,
      });
    }

    this.chaserView.update(dt, this.chaser, this.player.z, this.player.x);
    this.syncFootShadows();
    this.updateRig(dt);
    this.updateCamera(dt);
    this.pushX(this.player.x);
    this.cpuAccum += performance.now() - cpuStart;
  };

  private renderAlpha = 1;

  private render = (alphaIn: number): void => {
    this.renderAlpha = alphaIn;
    const cpuStart = performance.now();
    const alpha = this.renderAlpha;
    this.camera.position.set(
      lerp(this.camPrevX, this.camX, alpha),
      lerp(this.camPrevY, this.camY, alpha),
      lerp(this.camPrevZ, this.camZ, alpha),
    );
    this.camera.fov = lerp(this.fovPrev, this.fov, alpha);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(lerp(this.lookPrevX, this.lookX, alpha), lerp(this.lookPrevY, this.lookY, alpha), lerp(this.lookPrevZ, this.lookZ, alpha));
    // 角色位置按 alpha 插值，和相机一致；否则 60Hz 步进在 144fps 下会一格一格跳
    if (RIG_LERP) this.rig.root.position.lerpVectors(this.rigPrev, this.rigCur, alpha);
    else this.rig.root.position.copy(this.rigCur);
    this.renderer.render(this.scene, this.camera);
    this.cpuAccum += performance.now() - cpuStart;
    this.cpuFrames += 1;
    this.reportPerformance();
  };

  private statusText(): string {
    if (this.player.belly) return '肚皮滑行 ×1.1';
    if (this.boostLeft > 0) return `加速 ×1.25 ${this.boostLeft.toFixed(1)}s`;
    if (this.player.sliding) return '滑铲';
    return '';
  }

  private footsteps(dt: number): void {
    if (!this.player.grounded || this.player.sliding) {
      this.stepTimer = 0.18;
      return;
    }
    this.stepTimer += dt;
    const interval = 0.34 - 0.1 * clamp01((this.speed - SPEED_BASE) / (SPEED_MAX - SPEED_BASE));
    if (this.stepTimer >= interval) {
      this.stepTimer = 0;
      this.audio.play('step');
    }
  }

  private checkMilestones(): void {
    if (this.distance >= this.milestoneNext) {
      this.audio.play('milestone');
      console.log(`[game] 里程碑达成：${this.milestoneNext} m（不放笑声）`);
      this.milestoneNext += MILESTONE_EVERY;
    }
  }

  private countDodges(): void {
    const passed = this.obstacles.passedCount;
    if (passed === this.lastPassed) return;
    this.dodgeStreak += passed - this.lastPassed;
    this.lastPassed = passed;
    if (this.dodgeStreak >= 6) {
      this.dodgeStreak = 0;
      this.audio.play('dodge');
    }
  }

  private collectBottles(): void {
    const gained = this.bottles.collect(this.player.x, this.player.z, 0.9);
    if (gained <= 0) return;
    this.bottleCount += gained;
    this.audio.play('bottle');
    if (this.bottleCount % BOTTLE_PER_BOOST === 0) {
      this.boostLeft = BOOST_TIME;
      this.chaser.distance = Math.min(DIFFICULTY[this.difficulty].chaserStart, this.chaser.distance + CHASER_BOOST_PUSH);
      this.audio.play('boost');
    }
  }

  private takeHit(record: ObstacleRecord): void {
    if (record.consumed) return;
    record.consumed = true;
    this.hits += 1;
    this.player.stagger();
    const hitPull = DIFFICULTY[this.difficulty].hitPull;
    this.chaser.distance -= hitPull;
    this.audio.play('hit');
    console.log(
      `[chase] 撞到 ${record.label ?? record.kind} → 玩家踉跄 0.35s（速度 ×0.6），追兵拉近 ${hitPull}m，还剩 ${this.chaser.distance.toFixed(1)}m`,
    );
    if (this.chaser.caught) this.startCaught();
  }

  private autoPilot(): void {
    const player = this.player;
    const ahead = this.obstacles.firstAhead(player.lane, player.z);
    if (!ahead) {
      if (player.sliding) player.releaseSlide();
      return;
    }
    const gap = player.z - ahead.maxZ;
    if (gap > BOT_LANE_LOOK) return;
    if (ahead.kind === 'stool' || ahead.kind === 'cat') {
      if (player.grounded && gap < Math.max(4, this.speed * BOT_JUMP_TIME)) player.jump();
      return;
    }
    if (ahead.kind === 'awning') {
      if (player.grounded && !player.sliding && gap < Math.max(3, this.speed * 0.3)) player.pressSlide();
      return;
    }
    const free = this.freeLane(ahead.z, player.lane);
    if (free !== null && free !== player.lane) player.moveLane(free > player.lane ? 1 : -1);
  }

  private freeLane(z: number, current: number): number | null {
    for (const lane of [current - 1, current + 1, current - 2, current + 2]) {
      if (lane < 0 || lane > 2) continue;
      if (!this.obstacles.laneBusy(lane, z, 6)) return lane;
    }
    return null;
  }

  private syncFootShadows(): void {
    this.groundPlane.position.z = this.player.z;
    this.grassPlane.position.z = this.player.z;
    const player = this.footShadows[0];
    if (player) {
      player.position.set(this.player.x, 0.02, this.player.z);
      player.scale.setScalar(1 - Math.min(0.35, this.player.y * 0.3));
    }
    const chaser = this.footShadows[1];
    if (chaser) {
      const root = this.chaserView.root;
      chaser.visible = root.visible;
      chaser.position.set(root.position.x, 0.02, root.position.z);
      chaser.scale.setScalar(1.15);
    }
  }

  private updateRig(dt: number): void {
    let next: NaiwaState;
    if (this.player.staggering) next = 'hit';
    else if (this.player.sliding) next = 'slide';
    else if (!this.player.grounded) next = this.player.vy > 0 ? 'jump' : 'fall';
    else next = 'run';
    if (next !== this.rigState) {
      this.rig.setState(next);
      this.rigState = next;
    }
    this.rigPrev.copy(this.rigCur);
    this.rigCur.set(this.player.x, this.player.y, this.player.z);
    this.rig.root.position.copy(this.rigCur);
    this.rig.setSpeed(this.speed / SPEED_MAX);
    this.rig.setJumpStage?.(this.player.jumpStage);
    this.rig.update(dt);
  }

  private updateCamera(dt: number): void {
    this.xHistory[this.xHead % HISTORY_SIZE] = this.player.x;
    const targetX = this.player.x;
    this.camPrevX = this.camX;
    this.camX = lerp(this.camX, targetX, 1 - Math.exp(-dt / CAM_LATERAL_LAG));
    // 相机只跟随 25% 的纵向位移并阻尼：完全跟随会让跳跃变成镜头上升、跑步起伏变成整屏抽搐
    this.camFollowY += (this.player.y * 0.25 - this.camFollowY) * (1 - Math.exp(-dt / 0.12));
    const pivotY = this.camFollowY + 1.05;
    const baseLength = Math.hypot(0, CAM_HEIGHT - 1.05, CAM_BACK);
    const chase = clamp01((this.chaser.visibleRange - this.chaser.distance) / this.chaser.visibleRange);
    const targetLength = baseLength + chase * CHASE_CAM_EXTEND_MAX;
    const dirY = (CAM_HEIGHT - 1.05) / baseLength;
    const dirZ = CAM_BACK / baseLength;
    const obstruction = this.cameraObstruction(pivotY);
    const cap = Math.max(CAM_MIN_BOOM, obstruction);
    const want = Math.min(targetLength, cap);
    // 收近要快（防止穿模），拉回要慢（否则刚钻过障碍时会「往前突一下」）
    const boomTau = want < this.boomLength ? CAM_BOOM_TAU : CAM_BOOM_TAU * 3;
    this.boomLength += (want - this.boomLength) * (1 - Math.exp(-dt / boomTau));
    this.camPrevY = this.camY;
    this.camPrevZ = this.camZ;
    this.camY = pivotY + dirY * this.boomLength;
    this.camZ = this.player.z + dirZ * this.boomLength;
    this.lookPrevX = this.lookX;
    this.lookPrevY = this.lookY;
    this.lookPrevZ = this.lookZ;
    this.lookX = this.camX;
    this.lookY = this.camFollowY + CAM_LOOK_HEIGHT;
    this.lookZ = this.player.z - CAM_LOOK_AHEAD;
    this.fovPrev = this.fov;
    this.fov = lerp(FOV_NEAR, FOV_FAR, clamp01((this.speed - SPEED_BASE) / (SPEED_MAX - SPEED_BASE)));
    this.pushX(this.player.x);

    if (this.camYaw !== 0) {
      const dx = this.camX - this.player.x;
      const dz = this.camZ - this.player.z;
      const cos = Math.cos(this.camYaw);
      const sin = Math.sin(this.camYaw);
      this.camX = this.player.x + dx * cos - dz * sin;
      this.camZ = this.player.z + dx * sin + dz * cos;
    }
  }

  private cameraObstruction(pivotY: number): number {
    let nearest = Infinity;
    const list: ObstacleRecord[] = [];
    this.obstacles.appendNearby(this.player.z - 8, 20, list);
    for (const record of list) {
      // 只有「要低头钻」的障碍才可能真的挡住镜头（遮阳棚那种头顶障碍）。
      // 侧面的细高柱子（路标、系船柱）只是从旁边经过，不该把镜头往前拽。
      if (record.kind !== 'awning') continue;
      const hit = rayAabbEntry(this.player.x, pivotY, this.player.z, 0, (CAM_HEIGHT - 1.05) / CAM_BACK, 1, record);
      if (hit !== null && hit < nearest) nearest = hit;
    }
    return nearest === Infinity ? Infinity : Math.max(CAM_MIN_BOOM, nearest - 0.2);
  }

  private pushX(x: number): void {
    this.xHistory[this.xHead % HISTORY_SIZE] = x;
    this.xHead += 1;
  }

  private handleIntent(intent: Intent): void {
    if (this.handleFirstInput()) return;
    if (intent === 'left') {
      if (this.player.moveLane(-1)) this.audio.play('lane');
    } else if (intent === 'right') {
      if (this.player.moveLane(1)) this.audio.play('lane');
    } else if (intent === 'jump') {
      const stage = this.player.jump();
      if (stage === 1) this.audio.play('jump');
      else if (stage === 2) {
        this.audio.play('jump2');
        console.log('[jump] 二段跳（初速 ×0.8，空中只剩这一次）');
      }
    } else if (intent === 'slideStart') {
      if (this.player.pressSlide()) this.audio.play('slide');
    } else if (intent === 'slideEnd') this.player.releaseSlide();
  }

  private handleFirstInput(): boolean {
    if (this.state === 'menu') return true;
    if (this.stagingPaused) {
      this.stagingPaused = false;
      this.skipHint.textContent = '任意键 / 点击 跳过演出';
      console.log('[debug] 继续演出');
      this.enterStage();
      return true;
    }
    if (this.state === 'intro' || this.state === 'caught') return this.skipStage();
    return false;
  }

  private enterMenu(): void {
    this.state = 'menu';
    this.fade.style.opacity = '0';
    this.skipHint.classList.add('hidden');
    this.menu.show();
    console.log('[menu] 启动即进入主菜单');
  }

  private startRun(): void {
    this.paused = false;
    this.audio.stopChaseBed();
    this.bellyWas = false;
    this.kangWasVisible = false;
    this.player.reset();
    this.elapsed = 0;
    this.speed = SPEED_BASE;
    this.bottleCount = 0;
    this.boostLeft = 0;
    this.hits = 0;
    this.milestoneNext = MILESTONE_EVERY;
    this.obstacles.reset();
    this.bottles.reset();
    this.track.reset();
    this.park.reset(this.rng);
    this.sunPatches.reset();
    this.director.gapScale = DIFFICULTY[this.difficulty].gapScale;
    this.audio.setBgmRate(DIFFICULTY[this.difficulty].bgmRate);
    this.chaser.visibleRange = DIFFICULTY[this.difficulty].hitPull + 1;
    console.log(`[chase] 袋鼠出现距离 = ${this.chaser.visibleRange}m（再撞一次就结束）`);
    // 场景物体在 reset() 后已就位，编译一次即可；running 每帧编译会白吃约 12% 帧预算
    this.renderer.compile(this.scene, this.camera);
    this.overlay.hide();
    this.stageQueue = [];
    this.stageIndex = 0;
    console.log('[menu] 开始游戏 → INTRO');
    this.beginSequence(['intro-laugh', 'intro-line', 'intro-turn'], 'intro');
  }

  private beginSequence(queue: StageId[], state: 'intro' | 'caught'): void {
    this.stageQueue = queue;
    this.stageIndex = 0;
    this.state = state;
    this.stageToken += 1;
    this.fade.style.opacity = '0';
    this.skipHint.textContent = '任意键 / 点击 跳过演出';
    this.skipHint.classList.remove('hidden');
    console.log(`[stage] ${state === 'intro' ? 'INTRO' : 'CAUGHT'} 开始：${queue.join(' → ')}`);
    this.enterStage();
  }

  private get currentStage(): StageId {
    return this.stageQueue[this.stageIndex] ?? 'intro-line';
  }

  private enterStage(): void {
    this.stageTime = 0;
    this.stageTimer = 0;
    const token = ++this.stageToken;
    const stage = this.currentStage;
    console.log(`[stage] 进入 ${stage}（第 ${this.stageIndex + 1}/${this.stageQueue.length} 段）`);
    if (stage === 'intro-turn') {
      this.stageTimer = STAGE_TURN_SECONDS;
      return;
    }
    const clip = stage === 'intro-laugh' || stage === 'caught-laugh' ? CLIP_LAUGH_URL : CLIP_KANG_URL;
    const fallback = clip === CLIP_LAUGH_URL ? CLIP_LAUGH_FALLBACK : CLIP_KANG_FALLBACK;
    void this.audio.playClip(clip, fallback).then(() => {
      if (token === this.stageToken) this.endStage();
    });
  }

  private endStage(): void {
    if (this.state !== 'intro' && this.state !== 'caught') return;
    if (this.currentStage === 'intro-line') this.switchToFrontTexture();
    this.stageIndex += 1;
    if (this.stageIndex >= this.stageQueue.length) {
      this.finishSequence();
      return;
    }
    this.enterStage();
  }

  private switchToFrontTexture(): void {
    this.naiwaTextures.set('auto');
    this.naiwaPop = 0.22;
    console.log('[stage] 袋鼠台词结束 → 奶蛙贴图切回露肚（3% 纵向挤压回弹）');
  }

  private skipStage(): boolean {
    if (this.state !== 'intro' && this.state !== 'caught') return false;
    this.audio.stopClip();
    this.stageToken += 1;
    console.log(`[stage] 跳过 ${this.currentStage}`);
    this.endStage();
    return true;
  }

  private finishSequence(): void {
    if (this.state === 'intro') this.beginRun();
    else this.showResult();
  }

  private updateStage(dt: number): void {
    if (this.stagingPaused) {
      const poseT = this.currentStage === 'caught-laugh' ? this.stageTime + STAGE_ORBIT_SECONDS : this.stageTime;
    this.applyStagePose(stagePose(this.currentStage, poseT), dt, false);
      return;
    }
    this.stageTime += dt;
    if (this.stageTimer > 0) {
      this.stageTimer -= dt;
      if (this.stageTimer <= 0) {
        this.stageTimer = 0;
        this.endStage();
        if (this.state !== 'intro' && this.state !== 'caught') return;
      }
    }
    this.applyStagePose(stagePose(this.currentStage, this.currentStage === 'caught-laugh' ? this.stageTime + STAGE_ORBIT_SECONDS : this.stageTime), dt, this.currentStage === 'intro-turn');
  }

  private applyStagePose(pose: StagePose, dt: number, advanceWorld: boolean): void {
    if (advanceWorld) {
      this.player.advance(speedAt(0) * dt);
      this.track.update(this.player.z);
      this.park.update(this.player.z);
      this.sunPatches.update(this.player.z);
    }
    this.player.update(dt);
    this.rigPrev.copy(this.rigCur);
    this.rigCur.set(this.player.x, this.player.y, this.player.z);
    this.rig.root.position.copy(this.rigCur);
    this.rig.root.rotation.y = 0;
    if (pose.naiwaState !== this.rigState) {
      this.rig.setState(pose.naiwaState);
      this.rigState = pose.naiwaState;
    }
    this.rig.setSpeed(0.6);
    this.rig.update(dt);
    this.naiwaTextures.set(pose.naiwaTexture);
    this.updateNaiwaPop(dt);
    this.chaserView.placeManual(this.player.x + pose.chaserX, this.player.z + pose.chaserZ, pose.chaserRotation, pose.chaserState, dt);
    this.camPrevX = this.camX;
    this.camPrevY = this.camY;
    this.camPrevZ = this.camZ;
    this.camX = this.player.x + pose.cameraX;
    this.camY = pose.cameraY;
    this.camZ = this.player.z + pose.cameraZ;
    this.lookPrevX = this.lookX;
    this.lookPrevY = this.lookY;
    this.lookPrevZ = this.lookZ;
    this.lookX = this.player.x + pose.lookX;
    this.lookY = pose.lookY;
    this.lookZ = this.player.z + pose.lookZ;
    this.fovPrev = this.fov;
    this.fov = FOV_NEAR;
    this.syncFootShadows();
    this.hud.update({
      distance: 0,
      speed: 0,
      bottles: 0,
      bottlesPerBoost: BOTTLE_PER_BOOST,
      boostLeft: 0,
      boostTotal: BOOST_TIME,
      state: this.currentStage === 'intro-laugh' ? '奶蛙：先笑为敬' : this.currentStage === 'intro-line' ? '袋鼠：你的胆子真是肥嘟嘟的' : '',
      chaserDistance: pose.chaserGap,
      chaserMax: DIFFICULTY[this.difficulty].chaserStart,
      chaserDanger: pose.chaserGap < CHASER_VISIBLE_RANGE,
    });
    this.pushX(this.player.x);
  }

  private updateNaiwaPop(dt: number): void {
    if (this.naiwaPop <= 0) return;
    this.naiwaPop = Math.max(0, this.naiwaPop - dt);
    const progress = 1 - this.naiwaPop / 0.22;
    const squash = Math.sin(Math.PI * progress) * 0.03;
    if (this.naiwaPop === 0) this.rig.root.scale.set(1, 1, 1);
    else this.rig.root.scale.set(1 + squash, 1 - squash, 1);
  }

  private beginRun(): void {
    this.state = 'running';
    this.audio.stopClip();
    this.fade.style.opacity = '0';
    this.skipHint.classList.add('hidden');
    this.naiwaTextures.set('auto');
    this.naiwaPop = 0;
    this.rig.root.scale.set(1, 1, 1);
    this.distanceOrigin = this.player.z;
    const chaserStart = DIFFICULTY[this.difficulty].chaserStart;
    this.chaser.reset();
    this.chaser.distance = chaserStart;
    if (this.chaserStartOverride !== null) {
      this.chaser.distance = this.chaserStartOverride;
      console.log(`[chase] 调试：开局追兵距离设为 ${this.chaserStartOverride}m`);
    }
    this.rig.root.rotation.y = 0;
    this.rigState = 'run';
    this.rig.setState('run');
    this.boomLength = Math.hypot(0, CAM_HEIGHT - 1.05, CAM_BACK);
    this.camX = this.player.x;
    this.camPrevX = this.camX;
    this.obstacles.reset();
    this.bottles.reset();
    this.director.reset();
    this.director.beginRun(this.player.z, speedAt(0), INTRO_FIRST_OBSTACLE_DELAY);
    this.elapsed = 0;
    this.speed = speedAt(0);
    console.log(`[intro] 演出结束 → RUNNING（追兵 ${chaserStart}m，计时/距离归零，第一个障碍 ≥${INTRO_FIRST_OBSTACLE_DELAY}s 后）`);
  }

  private startCaught(): void {
    this.audio.stopChaseBed();
    console.log(`[caught] 被追上（距离 ${Math.floor(this.distance)}m，奶瓶 ${this.bottleCount}，撞击 ${this.hits} 次）→ 收尾演出`);
    this.beginSequence(['caught-line', 'caught-laugh'], 'caught');
  }

  private showResult(): void {
    this.state = 'result';
    this.audio.stopClip();
    this.fade.style.opacity = '0';
    this.skipHint.classList.add('hidden');
    this.naiwaTextures.set('auto');
    const distance = Math.floor(this.distance);
    const bestBefore = bestHistory(loadHistory());
    const qualifies = distance >= MIN_SCORE_DISTANCE;
    const isRecord =
      qualifies &&
      (bestBefore === null ||
        distance > bestBefore.distance ||
        (distance === bestBefore.distance && this.elapsed < bestBefore.elapsed));
    if (qualifies) {
      const count = this.menu.submitHistory({
        distance,
        elapsed: this.elapsed,
        hits: this.hits,
        bottles: this.bottleCount,
        difficulty: this.difficulty,
        date: new Date().toISOString(),
      });
      console.log(`[history] 写入后共 ${count} 条`);
    } else {
      console.log(`[history] 距离 ${distance}m < ${MIN_SCORE_DISTANCE}m，不入纪录`);
    }
    if (isRecord) {
      console.log(`[game] 打破个人纪录：${distance} m（原纪录 ${bestBefore ? bestBefore.distance : '无'} m）`);
    }
    const best = isRecord ? distance : (bestBefore?.distance ?? 0);
    this.overlay.show({ distance, elapsed: this.elapsed, bottles: this.bottleCount, hits: this.hits, best, isRecord });
    console.log(`[result] 结算：距离 ${distance}m / 用时 ${this.elapsed.toFixed(1)}s / 奶瓶 ${this.bottleCount} / 撞击 ${this.hits} 次 / 历史最高 ${best}m`);
  }

  private backToMenu(): void {
    this.paused = false;
    if (this.state !== 'result' && this.state !== 'running' && this.state !== 'caught') return;
    this.audio.stopChaseBed();
    this.state = 'menu';
    this.overlay.hide();
    this.menu.show();
    console.log('[menu] 返回主菜单');
  }

  private restart(): void {
    if (this.state !== 'result' && this.state !== 'running') return;
    this.startRun();
    console.log('[game] 重开 → 再走一遍开场演出');
  }

  private pause(): void {
    if (this.paused || this.state !== 'running') return;
    this.paused = true;
    this.audio.stopChaseBed();
    this.menu.showPause();
    console.log('[pause] 已暂停');
  }

  private resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.menu.hidePause();
    if (this.chaser.danger) {
      this.kangWasVisible = false;
      this.audio.startChaseBed();
    }
    console.log('[pause] 继续');
  }

  private togglePause(): void {
    if (this.state !== 'running') return;
    if (this.paused) this.resume();
    else this.pause();
  }

  private restartFromPause(): void {
    this.paused = false;
    this.menu.hidePause();
    this.restart();
  }

  private enterStagingDebug(debug: { stage: 'line' | 'laugh'; time: number }): void {
    this.state = 'caught';
    this.stageQueue = ['caught-line', 'caught-laugh'];
    this.stageIndex = debug.stage === 'laugh' ? 1 : 0;
    this.stageTime = debug.time;
    this.stagingPaused = true;
    this.stageTimer = 0;
    this.fade.style.opacity = '0';
    this.skipHint.textContent = '调试定格 · 空格继续';
    this.skipHint.classList.remove('hidden');
    console.log(`[debug] 定格在 ${this.currentStage} t=${debug.time.toFixed(2)}s（按空格继续演出）`);
  }

  private applySettings(settings: Settings): void {
    this.difficulty = settings.difficulty;
    this.audio.setBgmRate(DIFFICULTY[settings.difficulty].bgmRate);
    const scale = settings.master ? 1 : 0;
    this.audio.setVolumes(settings.sfx * scale, settings.voice * scale, settings.bgm * scale);
    this.chaserRig.setSkin(settings.chaserSkin);
    // 画质档位已取消，固定最高（原「高」档）：像素比顶到设备 dpr 上限 2
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    if (this.renderer.getPixelRatio() !== pixelRatio) this.renderer.setPixelRatio(pixelRatio);
    console.log(
      `[settings] master=${settings.master} sfx=${settings.sfx.toFixed(2)} voice=${settings.voice.toFixed(2)} bgm=${settings.bgm.toFixed(2)}`,
    );
  }

  private reportPerformance(): void {
    this.perfTimer += FIXED_DT;
    if (this.perfTimer < 5) return;
    this.perfTimer = 0;
    const info = this.renderer.info.render;
    this.drawPeak = Math.max(this.drawPeak, info.calls);
    this.triPeak = Math.max(this.triPeak, info.triangles);
    const cpuMs = this.cpuFrames > 0 ? this.cpuAccum / this.cpuFrames : 0;
    this.cpuAccum = 0;
    this.cpuFrames = 0;
    console.log(
      `[perf] drawCalls=${info.calls} (max ${this.drawPeak}) triangles=${info.triangles} (max ${this.triPeak}) ` +
        `cpuMs=${cpuMs.toFixed(2)} dist=${Math.floor(this.distance)}m speed=${this.speed.toFixed(1)} chaser=${this.chaser.distance.toFixed(1)}m`,
    );
  }

  private resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  /** 兼容入口：循环已在构造里启动 */
  start(): void {
    if (!this.loop.running) this.loop.start();
  }

  /** ?bench=1：三档各同步连渲 3 轮 × 60 帧，readPixels 强制同步，取各轮最小值 */
  private runBench(): void {
    if (this.benchPixelRatio && this.benchPixelRatio > 0) {
      this.renderer.setPixelRatio(this.benchPixelRatio);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      console.log('[bench] pixelRatio 强制设为 ' + this.benchPixelRatio + '（打破 vsync 上限用）');
    }
    this.state = 'running';
    this.player.z -= 30;
    this.updateCamera(FIXED_DT);
    this.camera.position.set(this.camX, this.camY, this.camZ);
    this.camera.lookAt(this.lookX, this.lookY, this.lookZ);
    const gl = this.renderer.getContext();
    const pixel = new Uint8Array(4);
    const sync = (): void => { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); };
    const tiers = ['low', 'mid', 'high'] as const;
    const results: Array<{ tier: string; rounds: number[]; minMs: number; fps: number; drawCalls: number; triangles: number }> = [];
    for (const tier of tiers) {
      const rounds: number[] = [];
      for (let round = 0; round < 3; round += 1) {
        this.renderer.render(this.scene, this.camera);
        sync();
        const start = performance.now();
        for (let i = 0; i < 60; i += 1) {
          this.renderer.render(this.scene, this.camera);
          sync();
        }
        rounds.push((performance.now() - start) / 60);
      }
      const info = this.renderer.info.render;
      const minMs = Math.min(...rounds);
      results.push({ tier, rounds: rounds.map((r) => Number(r.toFixed(2))), minMs: Number(minMs.toFixed(2)), fps: Number((1000 / minMs).toFixed(1)), drawCalls: info.calls, triangles: info.triangles });
    }
    console.log('[perf][bench] drawCalls=' + results.map((r) => r.drawCalls).join('/') + ' triangles=' + results.map((r) => r.triangles).join('/'));
    console.log('[bench] ' + JSON.stringify({ pixelRatio: this.renderer.getPixelRatio(), size: [window.innerWidth, window.innerHeight], results }));
  }


  /** 页面内 readPixels → 降采样 ASCII 亮度图：不依赖外部截图，避免后台节流拿到旧帧 */
  private captureAscii(cols = 64, rows = 26): void {
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    this.renderer.render(this.scene, this.camera);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const ramp = ' .:-=+*#%@';
    const lines: string[] = [];
    for (let ry = rows - 1; ry >= 0; ry -= 1) {
      let line = '';
      for (let rx = 0; rx < cols; rx += 1) {
        const x0 = Math.floor((rx / cols) * w);
        const x1 = Math.floor(((rx + 1) / cols) * w);
        const y0 = Math.floor((ry / rows) * h);
        const y1 = Math.floor(((ry + 1) / rows) * h);
        let sum = 0;
        let n = 0;
        for (let y = y0; y < y1; y += 3) {
          for (let x = x0; x < x1; x += 3) {
            const i = (y * w + x) * 4;
            sum += 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
            n += 1;
          }
        }
        const lum = n > 0 ? sum / n : 0;
        line += ramp[Math.min(ramp.length - 1, Math.floor((lum / 255) * ramp.length))];
      }
      lines.push(line);
    }
    console.log('[shot:ascii] ' + w + 'x' + h + '\n' + lines.join('\n'));
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    window.removeEventListener('resize', this.onResize);
    this.audio.stopClip();
    this.audio.stopBgm();
    this.audio.stopChaseBed();
    this.backdrop.dispose();
    this.rig.dispose();
    this.renderer.dispose();
  }
}
