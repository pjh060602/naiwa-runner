import type { NaiwaState, NaiwaRig } from './naiwa-types';
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Texture,
  TextureLoader,
  SRGBColorSpace,
  type BufferGeometry,
} from 'three';

const HEIGHT = 1.5;
const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
const assetUrl = (name: string): string => BASE + 'models/' + name;
const DAMP = 12;

const damp = (c: number, t: number, l: number, dt: number): number => c + (t - c) * (1 - Math.exp(-l * dt));

type TexKey = 'front' | 'laugh' | 'slide' | 'jump' | 'fly' | 'ascend';
/** 奶蛙第 5 个状态名：'fly'（飞行）。只在 billboard 内部使用，NaiwaState 由外部扩展。 */
type BillboardState = NaiwaState | 'fly' | 'ascend';

export function createNaiwaBillboard(): NaiwaRig {
  const root = new Group();
  root.name = 'naiwa2d';

  const geometry: BufferGeometry = new PlaneGeometry(HEIGHT, HEIGHT);
  const material = new MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.35,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.y = HEIGHT / 2;
  mesh.name = 'naiwa2d.sprite';
  root.add(mesh);

  const loader = new TextureLoader();
  const textures: Partial<Record<TexKey, Texture>> = {};
  const load = (key: TexKey, file: string): void => {
    loader.load(
      assetUrl(file),
      (t) => {
        t.colorSpace = SRGBColorSpace;
        textures[key] = t;
        if (key === 'front') material.map = t;
        material.needsUpdate = true;
      },
      undefined,
      () => undefined,
    );
  };
  load('front', 'naiwa_front_tex.png');
  load('laugh', 'naiwa_laugh_tex.png');
  load('slide', 'naiwa_slide_tex.png');
  load('jump', 'naiwa_jump_tex.png');
  load('fly', 'naiwa_fly_tex.png');
  load('ascend', 'naiwa_ascend_tex.png');

  let state: BillboardState = 'idle';
  let bellySlide = false;
  let look: 'auto' | 'laugh' = 'auto';
  let clock = 0;
  let bob = 0;
  let squash = 1;
  let xScale = 1;
  let tilt = 0;
  let lean = 0;
  let hitAmt = 0;
  let appliedTex: TexKey = 'front';
  let jumpStage: 0 | 1 | 2 = 0;

  const pick = (): TexKey => {
    if (look === 'laugh') return 'laugh';
    if (state === 'fly') return 'fly';
    if (state === 'ascend') return 'ascend';
    if (state === 'slide' || bellySlide) return 'slide';
    if (jumpStage === 2) return 'jump';
    return 'front';
  };

  return {
    root,
    setState(next: BillboardState) { state = next; },
    // 跑步起伏已关闭（见 update），速度比暂时没有使用者
    setSpeed(_ratio: number) {},
    setBellySlide(active: boolean) { bellySlide = active; },
    setLook(key: 'auto' | 'laugh') { look = key; },
    setJumpStage(stage: 0 | 1 | 2) { jumpStage = stage; },
    update(dt: number) {
      clock += dt;

      const want = pick();
      if (want !== appliedTex) {
        const tex = textures[want];
        if (tex) {
          material.map = tex;
          material.needsUpdate = true;
          appliedTex = want;
        }
      }

      let bobT = 0;
      let squashT = 1;
      let xScaleT = 1;
      let tiltT = 0;
      let leanT = 0;

      const prone = state === 'slide' || bellySlide;

      if (prone) {
        // 扑倒贴地：换俯卧贴图，贴地但不再横向拉长（用户反馈原来左右太长）
        xScaleT = 1.0;
        squashT = 1;
        leanT = 0;
        bobT = 0;
      } else {
        switch (state) {
          case 'run':
            bobT = 0; // 先关掉跑步起伏：它是 60Hz 步进更新的，和 144fps 的相机插值不同步，会读成「抖」
            squashT = 1;
            tiltT = 0;
            leanT = -0.10;
            break;
          case 'jump':
            squashT = 1.06; leanT = 0.12;
            break;
          case 'fall':
            squashT = 0.97; leanT = -0.06;
            break;
          case 'hit':
            squashT = 1.04; leanT = -0.16;
            break;
          case 'taunt':
            bobT = Math.abs(Math.sin(clock * 4.2)) * 0.03;
            squashT = 1 + Math.sin(clock * 4.2) * 0.035;
            tiltT = Math.sin(clock * 3.1) * 0.10;
            leanT = 0.06;
            break;
          case 'startle':
            squashT = 0.9; leanT = 0.20;
            break;
          case 'fly':
            squashT = 1.02; leanT = -0.04;
            break;
          case 'ascend':
            squashT = 1.03; leanT = 0;
            break;
          default:
            squashT = 1 + Math.sin(clock * Math.PI * 1.5) * 0.015;
            break;
        }
      }

      bob = damp(bob, bobT, DAMP, dt);
      squash = damp(squash, squashT, DAMP, dt);
      xScale = damp(xScale, xScaleT, 10, dt);
      tilt = damp(tilt, tiltT, DAMP, dt);
      lean = damp(lean, leanT, DAMP, dt);
      hitAmt = damp(hitAmt, state === 'hit' ? 1 : 0, 18, dt);

      // 起伏只作用在贴图本身；root.position 由 game.ts 写入玩家世界坐标（含跳跃高度）
      mesh.position.y = HEIGHT / 2 + bob;
      mesh.scale.set(xScale / Math.sqrt(squash), squash, 1);
      mesh.rotation.z = tilt;
      mesh.rotation.x = lean;
      material.color.setRGB(1, 1 - hitAmt * 0.45, 1 - hitAmt * 0.45);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      textures.front?.dispose();
      textures.laugh?.dispose();
      textures.slide?.dispose();
      textures.jump?.dispose();
      textures.fly?.dispose();
    },
  };
}
