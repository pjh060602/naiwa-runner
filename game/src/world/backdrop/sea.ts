import * as THREE from 'three';

/** 水面高度：比沙滩上沿（0.03）低 1cm，沙不透水 */
export const WATER_Y = 0.02;
/** 远端完全融进地平线的距离：必须小于穹顶半径和相机远平面 */
const FADE_END = 300;
const NEAR_COLOR = new THREE.Color(0x5fb0cd);
const SHALLOW = new THREE.Color(0x7fc6da);
const MID = new THREE.Color(0x3e8fba);
const FAR = new THREE.Color(0xdcefff);

/**
 * 海面：一整片连续渐变的水（近岸浅、中段蓝、末端化进地平线）。
 * 渐变全在顶点色里，不靠雾、不靠贴图。
 */
export function createSeaGeometry(shoreX: number, side: 1 | -1, width = 760, length = 1500): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, length, 8, 24);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const d = Math.max(0, position.getX(i) + width / 2);
    const t = Math.min(1, d / FADE_END);
    const z = position.getZ(i);
    if (t < 0.06) color.copy(SHALLOW).lerp(NEAR_COLOR, t / 0.06);
    else if (t < 0.45) color.copy(NEAR_COLOR).lerp(MID, Math.pow((t - 0.06) / 0.39, 0.8));
    else color.copy(MID).lerp(FAR, Math.pow((t - 0.45) / 0.55, 0.62));
    // 低对比的横向色带：水面不是一块塑料板
    const ripple = 1 + Math.sin(z * 0.045 + d * 0.02) * 0.018;
    colors[i * 3] = Math.min(1, color.r * ripple);
    colors[i * 3 + 1] = Math.min(1, color.g * ripple);
    colors[i * 3 + 2] = Math.min(1, color.b * ripple);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.translate(side * (shoreX + width / 2), WATER_Y, 0);
  return geometry;
}

/** 单条波纹带：1×1 平片，由 InstancedMesh 缩放成沿岸长条 */
export function createWaveBandGeometry(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
}
