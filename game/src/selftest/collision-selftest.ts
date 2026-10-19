import { BELLY_HEIGHT, GRAVITY, JUMP_SPEED, PLAYER_HEIGHT, SLIDE_HEIGHT } from '../core/config';
import { Player } from '../player/player';
import { aabbOverlap, rayAabbEntry } from '../player/collision';
import { KINDS } from '../world/obstacles';
import type { ObstacleKind } from '../world/obstacles';

const report = document.getElementById('report');
if (!report) throw new Error('缺少 #report');

const lines: string[] = [];
let failed = 0;

function check(name: string, actual: boolean | string | number, expected: boolean | string | number): void {
  const ok = actual === expected;
  if (!ok) failed += 1;
  lines.push(`${ok ? 'PASS' : 'FAIL'} ${name} | expected=${String(expected)} actual=${String(actual)}`);
}

/** 障碍在 z=-3、指定车道中心的碰撞盒 */
function obstacleBox(kind: ObstacleKind, lane: number) {
  const spec = KINDS[kind];
  const x = [-2.6, 0, 2.6][lane];
  return {
    minX: x - spec.halfWidth,
    maxX: x + spec.halfWidth,
    minY: spec.minY,
    maxY: spec.maxY,
    minZ: -3 - spec.halfDepth,
    maxZ: -3 + spec.halfDepth,
  };
}

/** 把玩家摆到指定姿态：跑 / 起跳顶点 / 普通滑铲 / 肚皮滑行 */
function playerIn(posture: 'run' | 'jumpApex' | 'slide' | 'belly'): Player {
  const player = new Player();
  player.z = -3;
  if (posture === 'jumpApex') {
    player.grounded = false;
    player.y = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY);
  } else if (posture === 'slide') {
    player.sliding = true;
    player.height = SLIDE_HEIGHT;
  } else if (posture === 'belly') {
    player.sliding = true;
    player.belly = true;
    player.height = BELLY_HEIGHT;
  }
  return player;
}

const lane = 1;
const overlap = (kind: ObstacleKind, posture: 'run' | 'jumpApex' | 'slide' | 'belly'): boolean =>
  aabbOverlap(playerIn(posture).aabb(), obstacleBox(kind, lane));

// 五种障碍 × 四种姿态：true = 撞上
const matrix: Record<string, boolean[]> = {};
for (const kind of ['stool', 'cart', 'awning', 'pole', 'cat', 'fence'] as ObstacleKind[]) {
  matrix[kind] = (['run', 'jumpApex', 'slide', 'belly'] as const).map((posture) => overlap(kind, posture));
}

lines.push('障碍 \\ 姿态        站立跑   跳跃顶点   普通滑铲   肚皮滑行');
for (const [kind, row] of Object.entries(matrix)) {
  lines.push(`${kind.padEnd(10)}   ${row.map((hit) => (hit ? '撞上' : '通过').padEnd(8)).join('  ')}`);
}

check('塑料凳 0.4m：站立跑撞', matrix.stool[0], true);
check('塑料凳 0.4m：跳跃通过', matrix.stool[1], false);
check('塑料凳 0.4m：滑铲仍撞（0.6m 盒子高过凳子）', matrix.stool[2], true);
check('夜宵推车 1.8m：跳跃仍撞（必须换道）', matrix.cart[1], true);
check('夜宵推车 1.8m：滑铲仍撞', matrix.cart[2], true);
check('遮阳棚 1.2m 悬空：站立跑撞', matrix.awning[0], true);
check('遮阳棚 1.2m 悬空：跳跃撞（跳到 1.27m 也躲不开）', matrix.awning[1], true);
check('遮阳棚 1.2m 悬空：普通滑铲通过（盒高 0.6）', matrix.awning[2], false);
check('遮阳棚 1.2m 悬空：肚皮滑行通过（盒高 0.5）', matrix.awning[3], false);
check('电线杆 6m：跳跃仍撞（必须换道）', matrix.pole[1], true);
check('流浪猫 0.52m：跳跃通过', matrix.cat[1], false);
check('流浪猫 0.52m：站立跑撞', matrix.cat[0], true);

check('站立盒高 = 1.6', PLAYER_HEIGHT, 1.6);
check('普通滑铲盒高 = 0.6', SLIDE_HEIGHT, 0.6);
check('肚皮滑行盒高 = 0.5', BELLY_HEIGHT, 0.5);
check('跳跃峰高 ≈ 1.27m', Math.abs((JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY) - 1.266) < 0.01, true);
check('滞空 ≈ 0.56s', Math.abs((2 * JUMP_SPEED) / GRAVITY - 0.5625) < 0.01, true);


// ── 相机臂收近：用真实的 rayAabbEntry + 真实障碍盒复算 ──
const CAM_BACK = 4.2;
const CAM_HEIGHT = 2.2;
const CAM_MIN_BOOM = 1.2;
const CAM_RADIUS = 0.28;

function boomFor(playerZ: number, obstacleZ: number): { boom: number; full: number; blocked: boolean } {
  const pivotX = 0;
  const pivotY = 1.05;
  const pivotZ = playerZ;
  const offsetX = 0;
  const offsetY = CAM_HEIGHT - pivotY;
  const offsetZ = playerZ + CAM_BACK - pivotZ;
  const full = Math.hypot(offsetX, offsetY, offsetZ);
  const box = { ...obstacleBox('awning', 1), minZ: obstacleZ - KINDS.awning.halfDepth, maxZ: obstacleZ + KINDS.awning.halfDepth };
  const t = rayAabbEntry(pivotX, pivotY, pivotZ, offsetX, offsetY, offsetZ, box, CAM_RADIUS);
  const desired = Math.max(CAM_MIN_BOOM, Math.min(full, t * full - 0.25));
  return { boom: desired, full, blocked: t < 1 };
}

const under = boomFor(0, 0);
check('钻到遮阳棚正下方 → 相机臂被缩短', under.blocked && under.boom < under.full - 0.5, true);
check('缩短后不低于 1.2m 下限', under.boom >= CAM_MIN_BOOM, true);
const far = boomFor(14, 0);
check('距遮阳棚 14m → 不收近', far.blocked, false);
check('不收近时等于完整臂长', Math.abs(far.boom - far.full) < 0.001, true);
const near = boomFor(2.0, 0);
check('贴近遮阳棚（2m）→ 收近但不清零', near.blocked && near.boom > CAM_MIN_BOOM && near.boom < near.full, true);
console.log(`[camera] 复算：正下方 boom=${under.boom.toFixed(2)}m（全长 ${under.full.toFixed(2)}m）、14m 外 boom=${far.boom.toFixed(2)}m、2m 时 boom=${near.boom.toFixed(2)}m`);

report.textContent = lines.join('\n');
for (const line of lines) console.log(line);
console.log(`COLLISION SELFTEST ${failed === 0 ? 'ALL PASS' : `FAILED ${failed}`} (${lines.length} lines)`);