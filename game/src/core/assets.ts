import * as THREE from 'three';
import { PALETTE } from './palette';

/**
 * 共享几何体与材质：全局只建一次，任何网格都不得在帧循环里 new。
 * 白天公园配色（docs/公园场景美术规范v1.md §2）。
 */
export class Assets {
  readonly unitBox = new THREE.BoxGeometry(1, 1, 1);

  /** 石板路 */
  readonly matRoad = new THREE.MeshStandardMaterial({ color: 0xd5cdbb, roughness: 0.9, metalness: 0 });
  readonly matSand = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1, metalness: 0 });
  readonly matWindGrass = new THREE.MeshStandardMaterial({ color: PALETTE.windGrass, roughness: 0.95, metalness: 0 });
  readonly matRail = new THREE.MeshStandardMaterial({ color: PALETTE.railWood, roughness: 0.8, metalness: 0 });
  readonly matWater = new THREE.MeshStandardMaterial({ color: PALETTE.waterNear, roughness: 0.35, metalness: 0.15 });
  readonly matWaterFade = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
  readonly matWave = new THREE.MeshBasicMaterial({ color: PALETTE.wave, transparent: true, opacity: 0.22, toneMapped: false });
  /** 石板明暗变化 */
  readonly matSlabAlt = new THREE.MeshStandardMaterial({ color: 0xbfb9aa, roughness: 0.92, metalness: 0 });
  /** 石板缝 */
  readonly matSeam = new THREE.MeshStandardMaterial({ color: 0xc8c0ae, roughness: 0.95, metalness: 0 });
  /** 路缘石 */
  readonly matCurb = new THREE.MeshStandardMaterial({ color: PALETTE.curb, roughness: 0.85, metalness: 0 });
  /** 路边石 */
  readonly matCurbStone = new THREE.MeshStandardMaterial({ color: PALETTE.curbStone, roughness: 0.88, metalness: 0 });
  /** 草坪 */
  readonly matGrass = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.95, metalness: 0 });
  readonly matGrassDark = new THREE.MeshStandardMaterial({ color: PALETTE.grassDark, roughness: 0.95, metalness: 0 });
  readonly matObstacle = new THREE.MeshStandardMaterial({ color: 0xc4553f, roughness: 0.75, metalness: 0 });
  /** 道具统一用顶点色 */
  readonly matProp = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });

  dispose(): void {
    this.unitBox.dispose();
    this.matRoad.dispose();
    this.matSand.dispose();
    this.matWindGrass.dispose();
    this.matRail.dispose();
    this.matWater.dispose();
    this.matWaterFade.dispose();
    this.matWave.dispose();
    this.matSlabAlt.dispose();
    this.matSeam.dispose();
    this.matCurb.dispose();
    this.matCurbStone.dispose();
    this.matGrass.dispose();
    this.matGrassDark.dispose();
    this.matObstacle.dispose();
    this.matProp.dispose();
  }
}
