import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 赛道拾取道具：磁铁 / 火箭 / 护盾。
 * 全部图元用 three.js 自带几何（Torus / Cylinder / Lathe / Shape+Extrude），
 * 每个图元 toNonIndexed 后写入 color 顶点属性，再 mergeGeometries 合并成
 * 单个带 position + normal + color 的 BufferGeometry（1 次 draw call）。
 * 预算：单件 ≤260 tris，三件合计 ≤780 tris。
 */

// ---- 配色：海滨玩具风，明快、互相区分 ----
// 马蹄磁铁经典配色：N 极红 / S 极蓝，一眼就能认出是磁铁
const MAGNET_RED = 0xd8443c;
const MAGNET_BLUE = 0x3f74d8;
const MAGNET_RED_POLE = 0xe9716a;
const MAGNET_BLUE_POLE = 0x6e9bea;
const ROCKET_CREAM = 0xf5eeda;
const ROCKET_GOLD = 0xf2c230;
const ROCKET_RED = 0xd94f3d;
const ROCKET_NOZZLE = 0x6b6259;
const SHIELD_CYAN = 0x9ed6e8;
const SHIELD_GOLD = 0xdfae4e;
const SHIELD_EMBLEM = 0xfff6e0;

const C_MAGNET_RED = new THREE.Color().setHex(MAGNET_RED, THREE.SRGBColorSpace);
const C_MAGNET_BLUE = new THREE.Color().setHex(MAGNET_BLUE, THREE.SRGBColorSpace);
const C_MAGNET_RED_POLE = new THREE.Color().setHex(MAGNET_RED_POLE, THREE.SRGBColorSpace);
const C_MAGNET_BLUE_POLE = new THREE.Color().setHex(MAGNET_BLUE_POLE, THREE.SRGBColorSpace);
const C_ROCKET_CREAM = new THREE.Color().setHex(ROCKET_CREAM, THREE.SRGBColorSpace);
const C_ROCKET_GOLD = new THREE.Color().setHex(ROCKET_GOLD, THREE.SRGBColorSpace);
const C_ROCKET_RED = new THREE.Color().setHex(ROCKET_RED, THREE.SRGBColorSpace);
const C_ROCKET_NOZZLE = new THREE.Color().setHex(ROCKET_NOZZLE, THREE.SRGBColorSpace);
const C_SHIELD_CYAN = new THREE.Color().setHex(SHIELD_CYAN, THREE.SRGBColorSpace);
const C_SHIELD_GOLD = new THREE.Color().setHex(SHIELD_GOLD, THREE.SRGBColorSpace);
const C_SHIELD_EMBLEM = new THREE.Color().setHex(SHIELD_EMBLEM, THREE.SRGBColorSpace);

type ColorFn = (x: number, y: number, z: number) => THREE.Color;

/** 把 geometry 变成非索引顶点色几何：position + normal + color（去掉 uv，保证 merge 属性一致） */
function bake(geometry: THREE.BufferGeometry, color: THREE.Color | ColorFn): THREE.BufferGeometry {
  const source = geometry.index === null ? geometry : geometry.toNonIndexed();
  if (source !== geometry) geometry.dispose();
  source.deleteAttribute('uv');

  const position = source.getAttribute('position') as THREE.BufferAttribute;
  const count = position.count;
  const colors = new Float32Array(count * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (typeof color === 'function') tint.copy(color(x, y, z));
    else tint.copy(color);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  source.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return source;
}

/** 合并成单个几何（1 次 draw call），并释放中间几何 */
function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('道具几何合并失败：属性不一致');
  for (const part of parts) part.dispose();
  merged.computeBoundingBox();
  return merged;
}

// ---- 1. 马蹄形磁铁（左 S 蓝 / 右 N 红）----
const _magnetArc = new THREE.Color();
function magnetArcColor(x: number, y: number, _z: number): THREE.Color {
  const mix = Math.min(1, Math.max(0, (x + 0.07) / 0.14));
  const dark = Math.min(1, Math.max(0, (-0.02 - y) / 0.2));
  _magnetArc.copy(C_MAGNET_BLUE).lerp(C_MAGNET_RED, mix);
  _magnetArc.multiplyScalar(1 - 0.26 * dark);
  return _magnetArc;
}

export function buildMagnetItem(): THREE.BufferGeometry {
  const torus = new THREE.TorusGeometry(0.22, 0.055, 8, 10, Math.PI);
  torus.rotateZ(Math.PI);
  const parts: THREE.BufferGeometry[] = [bake(torus, magnetArcColor)];

  for (const side of [
    { x: -0.22, body: C_MAGNET_BLUE, pole: C_MAGNET_BLUE_POLE },
    { x: 0.22, body: C_MAGNET_RED, pole: C_MAGNET_RED_POLE },
  ]) {
    const arm = new THREE.CylinderGeometry(0.055, 0.055, 0.24, 8, 1, true);
    arm.translate(side.x, 0.11, 0);
    parts.push(bake(arm, side.body));

    const pole = new THREE.CylinderGeometry(0.058, 0.058, 0.05, 8);
    pole.translate(side.x, 0.255, 0);
    parts.push(bake(pole, side.pole));
  }

  return mergeParts(parts);
}

// ---- 2. 火箭 ----
const ROCKET_PROFILE: THREE.Vector2[] = [
  new THREE.Vector2(0.001, -0.28),
  new THREE.Vector2(0.072, -0.28),
  new THREE.Vector2(0.082, -0.24),
  new THREE.Vector2(0.082, 0.04),
  new THREE.Vector2(0.066, 0.1),
  new THREE.Vector2(0.001, 0.24),
];

function rocketBodyColor(_x: number, y: number, _z: number): THREE.Color {
  return y >= 0.075 ? C_ROCKET_RED : C_ROCKET_CREAM;
}

function createFinGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0.07, -0.02);
  shape.lineTo(0.175, -0.24);
  shape.lineTo(0.07, -0.255);
  shape.closePath();

  const fin = new THREE.ExtrudeGeometry(shape, {
    depth: 0.016,
    bevelEnabled: false,
    curveSegments: 1,
  });
  fin.translate(0, 0, -0.008);
  return fin;
}

export function buildFireworkItem(): THREE.BufferGeometry {
  const body = new THREE.LatheGeometry(ROCKET_PROFILE, 10);
  const parts: THREE.BufferGeometry[] = [bake(body, rocketBodyColor)];

  const band = new THREE.CylinderGeometry(0.086, 0.086, 0.028, 10);
  band.translate(0, 0.062, 0);
  parts.push(bake(band, C_ROCKET_GOLD));

  const nozzle = new THREE.CylinderGeometry(0.058, 0.07, 0.05, 8);
  nozzle.translate(0, -0.3, 0);
  parts.push(bake(nozzle, C_ROCKET_NOZZLE));

  for (let i = 0; i < 3; i += 1) {
    const fin = createFinGeometry();
    fin.rotateY((i * Math.PI * 2) / 3);
    parts.push(bake(fin, C_ROCKET_RED));
  }

  return mergeParts(parts);
}

// ---- 3. 盾牌（西方骑士三角盾：上平、两侧下行、底部收尖）----
function makeShieldShape(scale: number): THREE.Shape {
  const s = (v: number): number => v * scale;
  const shape = new THREE.Shape();
  shape.moveTo(s(-0.15), s(0.16));
  shape.lineTo(s(0.15), s(0.16));
  shape.quadraticCurveTo(s(0.152), s(-0.04), s(0), s(-0.24));
  shape.quadraticCurveTo(s(-0.152), s(-0.04), s(-0.15), s(0.16));
  return shape;
}

function createStarShape(): THREE.Shape {
  const shape = new THREE.Shape();
  for (let k = 0; k < 8; k += 1) {
    const angle = (k * Math.PI) / 4 + Math.PI / 2;
    const radius = k % 2 === 0 ? 0.078 : 0.03;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (k === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return shape;
}

export function buildShieldItem(): THREE.BufferGeometry {
  // 金边：放大的盾形厚片垫在盾面之后，正面只露出外圈
  const outline = new THREE.ExtrudeGeometry(makeShieldShape(1.085), {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 1,
    curveSegments: 5,
  });
  outline.translate(0, 0, -0.045);

  // 盾面：淡青底板，厚于金边前半部，正面可见
  const body = new THREE.ExtrudeGeometry(makeShieldShape(1), {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 5,
  });

  // 中央标识：浮在盾面之前的白金四角星
  const emblem = new THREE.ExtrudeGeometry(createStarShape(), {
    depth: 0.01,
    bevelEnabled: false,
  });
  emblem.translate(0, -0.01, 0.062);

  return mergeParts([bake(outline, C_SHIELD_GOLD), bake(body, C_SHIELD_CYAN), bake(emblem, C_SHIELD_EMBLEM)]);
}
