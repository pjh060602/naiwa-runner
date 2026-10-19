import * as THREE from 'three';
// 太阳方向（本地真源；原光影模块已移除）
const SUN_DIRECTION = new THREE.Vector3(0.35, 0.75, 0.45).normalize();
import { MeshBuilder } from '../props/build';

/**
 * 天空穹顶：天顶偏蓝 → 地平近白，只在穹顶上烘一次顶点色。
 * 半径必须小于相机远平面（game.ts 里是 420），否则整个穹顶会被裁掉只剩背景色。
 */
export const SKY_RADIUS = 360;

const ZENITH = new THREE.Color(0x3f9ed8);
const MID = new THREE.Color(0xa8d8f0);
const HORIZON = new THREE.Color(0xdcefff);
const SUN_TINT = new THREE.Color(0xfff3d8);

export function createSkyDomeGeometry(radius = SKY_RADIUS, widthSegments = 24, heightSegments = 14): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  const dir = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    dir.set(position.getX(i), position.getY(i), position.getZ(i)).multiplyScalar(1 / radius);
    const h = Math.max(0, dir.y);
    // 三段渐变：地平近白 → 中空淡蓝 → 天顶饱和蓝
    if (h < 0.22) color.copy(HORIZON).lerp(MID, Math.pow(h / 0.22, 0.8));
    else color.copy(MID).lerp(ZENITH, Math.pow((h - 0.22) / 0.78, 0.85));
    // 太阳附近加一层很淡的暖光晕，转镜头时能看到光源在哪
    const facing = Math.max(0, dir.dot(SUN_DIRECTION));
    const glow = Math.pow(facing, 26) * 0.55 + Math.pow(facing, 4) * 0.1;
    if (glow > 0) color.lerp(SUN_TINT, Math.min(0.85, glow));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * 云：扁平多球（不是锥形、不是椭球块）。
 * 只放在 |x| 很大的高处，画面中心永远留空给海平线。
 */
export function createCloudGeometry(): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const CLOUD = 0xffffff;
  const CLOUD_MID = 0xf2f7fb;
  const CLOUD_SHADE = 0xd6e3ee;
  // 多球堆叠：横向拉开、纵向分三层，底部一坨偏灰，整体仍然很扁
  b.ellipsoid(CLOUD, [1.0, 0.5, 0.74], [0, 0, 0], 8, { shade: 1.1 });
  b.ellipsoid(CLOUD, [0.72, 0.42, 0.56], [0.9, -0.04, 0.1], 7, { shade: 1.05, tint: 0.99 });
  b.ellipsoid(CLOUD, [0.66, 0.4, 0.52], [-0.88, -0.02, -0.06], 7, { shade: 1.05, tint: 0.99 });
  b.ellipsoid(CLOUD_MID, [0.6, 0.46, 0.44], [-0.24, 0.24, 0.04], 6, { shade: 1.2 });
  b.ellipsoid(CLOUD_MID, [0.5, 0.38, 0.38], [0.42, 0.26, -0.08], 6, { shade: 1.2 });
  b.ellipsoid(CLOUD_SHADE, [0.84, 0.24, 0.56], [0.06, -0.28, 0.02], 6, { shade: 0.82, grain: 0.02 });
  b.ellipsoid(CLOUD_MID, [0.34, 0.28, 0.3], [1.5, -0.12, -0.12], 5, { shade: 1.0, tint: 0.97 });
  return b.build();
}
