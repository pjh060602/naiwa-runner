// 量角色占屏高比例与脚底位置：用与 game.ts 相同的相机几何复算投影。
// 吊臂长度 s 沿「角色胸口 → 理想机位」的方向缩放，所以拉长时高度也跟着变。
// 用法：node scripts/measure-framing.mjs
import * as THREE from 'three';

const PIVOT_Y = 1.05;
const CAM_BACK = 4.2;
const CAM_HEIGHT = 2.2;
const LOOK_HEIGHT = 1.15;
const LOOK_AHEAD = 3.0;
const FOV = 62;
const BASE_LENGTH = Math.hypot(0, CAM_HEIGHT - PIVOT_Y, CAM_BACK);

const configs = [
  { label: '基础吊臂 4.35m（无追兵）', length: BASE_LENGTH },
  { label: '追兵 3.4m（模型开始渲染）', length: BASE_LENGTH + ((6 - 3.4) / 6) * 2.5 },
  { label: '追兵 0m（拉长到上限 6.85m）', length: BASE_LENGTH + 2.5 },
];

const viewports = [
  { label: '桌面 1352x830', width: 1352, height: 830 },
  { label: '手机 390x844', width: 390, height: 844 },
];

const PLAYER_HEIGHT = 1.5;

for (const viewport of viewports) {
  for (const config of configs) {
    const scale = config.length / BASE_LENGTH;
    const camera = new THREE.PerspectiveCamera(FOV, viewport.width / viewport.height, 0.1, 420);
    camera.position.set(0, PIVOT_Y + (CAM_HEIGHT - PIVOT_Y) * scale, CAM_BACK * scale);
    camera.lookAt(0, LOOK_HEIGHT, -LOOK_AHEAD);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const feet = new THREE.Vector3(0, 0, 0).project(camera);
    const head = new THREE.Vector3(0, PLAYER_HEIGHT, 0).project(camera);
    const ratio = Math.abs(head.y - feet.y) / 2;
    // NDC y: +1 画面顶，-1 画面底。「下三分之一」= 脚底 NDC y ≤ -0.333
    const inLowerThird = feet.y <= -0.33;
    console.log(
      `${viewport.label} | ${config.label} | 相机 y=${camera.position.y.toFixed(2)} z=${camera.position.z.toFixed(2)} ` +
        `| 角色占屏高 ${(ratio * 100).toFixed(1)}% | 脚底 NDC y=${feet.y.toFixed(3)} 头顶 NDC y=${head.y.toFixed(3)} ` +
        `| 在下三分之一: ${inLowerThird ? '是' : '否'}`,
    );
  }
}
