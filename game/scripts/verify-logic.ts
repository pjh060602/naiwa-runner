/**
 * 无浏览器的逻辑自检：相机臂收近的射线数学 + 笑声闸门的配额规则。
 * 跑法：node scripts/verify-logic.mjs（先由 npm run verify:logic 用 esbuild 打包）
 * 浏览器版同样的断言在 /collision-selftest.html 与 /laugh-policy-selftest.html。
 */
import {
  CAM_BACK,
  STAGE_ORBIT_SECONDS,
  STAGE_TURN_SECONDS,
  CAM_HEIGHT,
  CHASE_CAM_EXTEND_MAX,
  CHASER_MODEL_RANGE,
  LAUGH_COOLDOWN,
  LAUGH_MAX_PER_RUN,
  MILESTONE_LAUGH_MAX,
} from '../src/core/config';
import { rayAabbEntry } from '../src/player/collision';
import { Player } from '../src/player/player';
import { KINDS } from '../src/world/obstacles';
import { TIER_WEIGHTS } from '../src/world/director';
import { stagePose } from '../src/world/stage';
import { createScoreStore, isRecordRow, mergeScore } from '../src/ui/menu';
import type { ScoreEntry, StorageLike } from '../src/ui/menu';
import { ChaseModel } from '../src/world/chaser';
import * as THREE from 'three';
import { Track } from '../src/world/track';
import type { Assets } from '../src/core/assets';

let failed = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} | expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
}

// ── 相机臂：和 game.ts 里完全相同的几何与公式 ──
const CAM_BACK = 4.2;
const CAM_HEIGHT = 2.2;
const CAM_MIN_BOOM = 1.2;
const CAM_RADIUS = 0.28;

function boomFor(playerZ: number, obstacleZ: number) {
  const pivotY = 1.05;
  const offsetY = CAM_HEIGHT - pivotY;
  const offsetZ = CAM_BACK;
  const full = Math.hypot(0, offsetY, offsetZ);
  const awning = KINDS.awning;
  const box = {
    minX: -awning.halfWidth,
    maxX: awning.halfWidth,
    minY: awning.minY,
    maxY: awning.maxY,
    minZ: obstacleZ - awning.halfDepth,
    maxZ: obstacleZ + awning.halfDepth,
  };
  const t = rayAabbEntry(0, pivotY, playerZ, 0, offsetY, offsetZ, box, CAM_RADIUS);
  const desired = Math.max(CAM_MIN_BOOM, Math.min(full, t * full - 0.25));
  return { boom: desired, full, blocked: t < 1 };
}

console.log('—— 相机臂收近 ——');
const under = boomFor(0, 0);
check('钻遮阳棚正下方 → 被判定遮挡', under.blocked, true);
check('钻下方时臂长明显缩短', under.boom < under.full - 0.5, true);
check('缩短不低于 1.2m 下限', under.boom >= CAM_MIN_BOOM, true);
const far = boomFor(14, 0);
check('14m 外 → 不收近', far.blocked, false);
check('不收近 = 完整臂长', Math.abs(far.boom - far.full) < 1e-6, true);
const ahead = boomFor(2, 0);
check('从棚前 2m 处（棚在身前）→ 不算遮挡', ahead.blocked, false);
const justPast = boomFor(-2, 0);
check('刚穿过棚 2m → 棚在相机与角色之间，收近到下限附近', justPast.blocked && justPast.boom >= CAM_MIN_BOOM && justPast.boom < justPast.full, true);
console.log(
  `   实测：正下方 boom=${under.boom.toFixed(2)}m（全长 ${under.full.toFixed(2)}m）｜棚前 2m boom=${ahead.boom.toFixed(2)}m｜刚过棚 2m boom=${justPast.boom.toFixed(2)}m`,
);

// ── 笑声闸门 ──
// ── 演出（INTRO / CAUGHT）：镜头与贴图 ──
console.log('');
console.log('—— 跳跃落地即可滑铲（0 帧延迟）——');
{
  const landSlide = new Player();
  landSlide.jump();
  for (let i = 0; i < 180 && !landSlide.grounded; i += 1) landSlide.update(1 / 60);
  const pressed = landSlide.pressSlide();
  check('落地后立刻按 ↓ → 当帧进入 slide', [pressed, landSlide.sliding], [true, true]);

  const buffered = new Player();
  buffered.jump();
  // 下落途中（离地还有约 0.1m）就按下 ↓
  let guard = 0;
  while (!(buffered.vy < 0 && buffered.y < 0.12) && guard < 180) {
    buffered.update(1 / 60);
    guard += 1;
  }
  const airbornePressed = buffered.pressSlide();
  check('空中按 ↓ 不会滑（不取消跳跃）', [airbornePressed, buffered.sliding, buffered.grounded], [false, false, false]);
  let ticks = 0;
  while (!buffered.grounded && ticks < 180) {
    buffered.update(1 / 60);
    ticks += 1;
  }
  check(`落地当帧兑现缓冲的 ↓（落地用了 ${ticks} tick）→ slide`, [buffered.grounded, buffered.sliding], [true, true]);

  const stale = new Player();
  stale.jump();
  stale.pressSlide(); // 起跳瞬间就按：缓冲 0.15s 早就过期
  for (let i = 0; i < 180 && !stale.grounded; i += 1) stale.update(1 / 60);
  check('起跳瞬间按的 ↓ 不会在落地后误触发（缓冲已过期）', stale.sliding, false);
}


console.log('');
console.log('—— 排行榜（纯函数 + 可注入存储）——');
{
  const fakeStorage = (): StorageLike => {
    const map = new Map<string, string>();
    return {
      getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
      setItem: (k, value) => void map.set(k, value),
      removeItem: (k) => void map.delete(k),
    };
  };
  const entry = (distance: number, elapsed: number): ScoreEntry => ({ distance, elapsed, hits: 0, date: '2024-01-01T00:00:00.000Z' });

  check('空榜 + 一条 → 长度 1', mergeScore([], entry(120, 8)).length, 1);

  const twelve = Array.from({ length: 12 }, (_, i) => entry(100 + i * 10, 10));
  const capped = mergeScore(twelve, entry(999, 1));
  check('12 条 + 1 条 → 截断到 10', capped.length, 10);
  check('截断后第 1 条是最高分', capped[0].distance, 999);

  const slow = mergeScore([entry(200, 12)], entry(200, 9));
  check('同距离只留一行', slow.length, 1);
  check('同距离保留用时更短的那条', slow[0].elapsed, 9);

  const same = mergeScore([entry(200, 9)], entry(200, 9));
  check('同距离同用时不重复插入', same.length, 1);

  const storage = fakeStorage();
  const store = createScoreStore(storage);
  const written = store.add(entry(321, 15));
  const reread = store.read();
  check('写入后能从 storage 读回同样的数组', JSON.stringify(reread), JSON.stringify(written));
  check('读回内容可 JSON 解析且距离一致', JSON.parse(storage.getItem('naiwa-scores-v1') as string)[0].distance, 321);

  store.clear();
  check('清空后 key 不存在', storage.getItem('naiwa-scores-v1'), null);
  check('清空后读回为空数组', store.read().length, 0);

  check('高亮：距离与用时都等于本局写入值 → true', isRecordRow(entry(321, 15), entry(321, 15)), true);
  check('高亮：距离不同 → false', isRecordRow(entry(300, 15), entry(321, 15)), false);
}


console.log('');
console.log('—— 二段跳 ——');
{
  const jumpSpy: Array<0 | 1 | 2> = [];
  const rigSpy = { setJumpStage: (stage: 0 | 1 | 2) => jumpSpy.push(stage) };
  const jumper = new Player();
  jumper.reset();

  const first = jumper.jump();
  const firstVy = jumper.vy;
  jumper.update(1 / 60);
  rigSpy.setJumpStage(jumper.jumpStage);
  check('起跳：返回 1（一段）、初速 = JUMP_SPEED', [first, Math.round(firstVy)], [1, 9]);

  const second = jumper.jump();
  jumper.update(1 / 60);
  rigSpy.setJumpStage(jumper.jumpStage);
  check('空中再按跳：二段生效，垂直速度重新变为正', [second, jumper.vy > 0], [2, true]);
  // 二段初速 = JUMP_SPEED * 1.05：一段顶点 1.27m，二段再补 1.40m，合计约 2.2m，可越过 1.8m 系船柱
  check('二段初速 = 一段 ×1.05（可越过 1.8m 障碍）', Math.round(jumper.vy + 32 / 60), 9);

  const vyBefore = jumper.vy;
  const third = jumper.jump();
  check('二段之后再按跳：无效，垂直速度不变', [third, jumper.vy], [0, vyBefore]);

  while (!jumper.grounded) jumper.update(1 / 60);
  rigSpy.setJumpStage(jumper.jumpStage);
  check('落地：jumpStage 归 0', jumper.jumpStage, 0);
  const afterLand = jumper.jump();
  check('落地后可跳次数恢复（能再起跳）', afterLand, 1);

  check('setJumpStage 被调用且出现过 2', jumpSpy.includes(2), true);
  check('setJumpStage 调用序列含 1 → 2 → 0', jumpSpy.join(','), '1,2,0');
}

console.log('');
console.log('—— 演出：INTRO / CAUGHT ——');
const poseAtStage = (id: Parameters<typeof stagePose>[0], t: number) => stagePose(id, t);
check('INTRO 第一段：奶蛙捧腹大笑 + 袋鼠生气', [
  poseAtStage('intro-laugh', 0).naiwaTexture,
  poseAtStage('intro-laugh', 0).naiwaState,
  poseAtStage('intro-laugh', 0).chaserState,
], ['laugh', 'taunt', 'angry']);
check('INTRO 第二段：台词期间奶蛙仍是大笑', poseAtStage('intro-line', 0).naiwaTexture, 'laugh');
check('INTRO 第三段：切回露肚之后才摇镜头', poseAtStage('intro-turn', 0).naiwaTexture, 'auto');
check('INTRO 第三段结束：镜头落到背后跟随机位', [
  Math.round(poseAtStage('intro-turn', STAGE_TURN_SECONDS).cameraX * 100) / 100,
  Math.round(poseAtStage('intro-turn', STAGE_TURN_SECONDS).cameraY * 100) / 100,
  Math.round(poseAtStage('intro-turn', STAGE_TURN_SECONDS).cameraZ * 100) / 100,
], [0, 2.2, 4.35]);
check('INTRO 结束时袋鼠回到 18m', Math.round(poseAtStage('intro-turn', STAGE_TURN_SECONDS).chaserGap), 18);

check('CAUGHT 第一段：镜头绕到胸口高度的正面 3/4', [
  Math.round(poseAtStage('caught-line', 3).cameraY * 100) / 100,
  Math.round(poseAtStage('caught-line', 3).cameraZ * 100) / 100,
], [1.45, 4.7]);
check('CAUGHT 镜头到位后完全静止（0.9s 之后不再动）', [
  Math.round(poseAtStage('caught-line', 2.5).cameraX * 1000) / 1000,
  Math.round(poseAtStage('caught-line', 99).cameraX * 1000) / 1000,
], [
  Math.round(poseAtStage('caught-line', 99).cameraX * 1000) / 1000,
  Math.round(poseAtStage('caught-line', 99).cameraX * 1000) / 1000,
]);
check('CAUGHT 第二段：奶蛙切大笑', poseAtStage('caught-laugh', 0).naiwaTexture, 'laugh');

// 连续运镜：任意相邻两帧位移都要很小（不切镜）
let maxJump = 0;
const scan = (id: Parameters<typeof stagePose>[0], seconds: number) => {
  let prev = stagePose(id, 0);
  for (let t = 0.016; t <= seconds; t += 0.016) {
    const next = stagePose(id, t);
    const jump = Math.hypot(next.cameraX - prev.cameraX, next.cameraY - prev.cameraY, next.cameraZ - prev.cameraZ);
    if (jump > maxJump) maxJump = jump;
    prev = next;
  }
};
scan('intro-turn', STAGE_TURN_SECONDS);
scan('caught-line', STAGE_ORBIT_SECONDS);
check(`连续运镜：单帧最大机位位移 ${maxJump.toFixed(3)}m < 0.5m（无切镜）`, maxJump < 0.5, true);

// ── 海堤栏杆：reset() 之后实例矩阵必须已就位。InstancedMesh 初始是单位矩阵，
//    不 flush 就会让 120 根柱子全叠在世界原点，等跑过 2m 才被 update() 摆正。
const stubMat = new THREE.MeshStandardMaterial();
const stubAssets = {
  unitBox: new THREE.BoxGeometry(1, 1, 1),
  matRoad: stubMat, matCurb: stubMat, matGrass: stubMat, matSand: stubMat,
  matSeam: stubMat, matProp: stubMat, matRail: stubMat,
} as unknown as Assets;
const track = new Track(stubAssets, () => 0.5);
const railPosts = (track as unknown as { railPosts: THREE.InstancedMesh }).railPosts;
const longSeams = (track as unknown as { longSeams: THREE.InstancedMesh }).longSeams;
const m = new THREE.Matrix4();
const spots = new Set<string>();
let railX = 0;
let railZFront = 0;
let railZBack = 0;
for (let i = 0; i < railPosts.count; i += 1) {
  railPosts.getMatrixAt(i, m);
  railX += m.elements[12];
  spots.add(`${m.elements[12].toFixed(2)},${m.elements[14].toFixed(2)}`);
  if (i === 0) railZFront = m.elements[14];
  if (i === railPosts.count - 1) railZBack = m.elements[14];
}
check('海堤栏杆 reset() 后 120 根各就各位（不是全叠在原点）', spots.size, railPosts.count);
check('海堤栏杆贴海侧路肩外 x=4.5', Math.round((railX / railPosts.count) * 100) / 100, 4.5);
check('海堤栏杆前端 z=6、末根 z=-279.6（间距 2.4m）',
  [Math.round(railZFront * 10) / 10, Math.round(railZBack * 10) / 10], [6, -279.6]);
longSeams.getMatrixAt(0, m);
check('长接缝 reset() 后不在原点', Math.abs(m.elements[14]) > 50, true);

// 长距离段（dense）必须保留「只能滑铲」和「只能跳」两类解法，否则跑到后期某类障碍会彻底消失
for (const tier of ['near', 'mid', 'dense'] as const) {
  const answers = new Set(TIER_WEIGHTS[tier].map(([kind]) => KINDS[kind].answer));
  check(`${tier} 档权重同时含 jump 与 slide 解`, [answers.has('jump'), answers.has('slide')], [true, true]);
}
check('dense 档包含高门架 fence（游泳圈木架子）', TIER_WEIGHTS.dense.map(([k]) => k).includes('fence'), true);


console.log('');
console.log(`VERIFY LOGIC ${failed === 0 ? 'ALL PASS' : `FAILED ${failed}`}`);
if (failed > 0) process.exitCode = 1;
