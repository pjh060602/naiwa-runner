import * as THREE from 'three';
import type { NaiwaRig } from '../player/rig';
import type { NaiwaTextureKey } from './stage';

/** 奶蛙贴图覆盖键：'auto'/'laugh' 来自 stage.ts；第 5 个状态名 'fly' 对应飞行贴图 */
export type NaiwaTextureOverride = NaiwaTextureKey | 'fly';

/**
 * 奶蛙的贴图覆盖（默认正面 / 大笑 / 飞行之间切）。
 * 只换材质的 map，不修改 character/naiwa.ts；结束后还原它原本的贴图。
 */
export class NaiwaTextures {
  private readonly sprite: THREE.Mesh | null;
  private laughTexture: THREE.Texture | null = null;
  private flyTexture: THREE.Texture | null = null;
  private savedMap: THREE.Texture | null = null;
  private isOverridden = false;
  private overrideKey: 'laugh' | 'fly' | null = null;
  private warned = false;

  private readonly rig: NaiwaRig;

  constructor(rig: NaiwaRig) {
    this.rig = rig;
    let sprite: THREE.Mesh | null = null;
    rig.root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!sprite && mesh.isMesh) sprite = mesh;
    });
    this.sprite = sprite;

    this.loadTexture('naiwa_laugh_tex.png', 'laugh');
    this.loadTexture('naiwa_fly_tex.png', 'fly');
  }

  private loadTexture(file: string, kind: 'laugh' | 'fly'): void {
    const base = import.meta.env.BASE_URL;
    new THREE.TextureLoader().load(
      base + 'models/' + file,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        if (kind === 'laugh') {
          this.laughTexture = texture;
          if (this.isOverridden && this.overrideKey === 'laugh') this.applyLaugh();
        } else {
          this.flyTexture = texture;
          if (this.isOverridden && this.overrideKey === 'fly') this.applyFly();
        }
      },
      undefined,
      () => console.warn('[naiwa] ' + (kind === 'laugh' ? '大笑' : '飞行') + '贴图加载失败，期间沿用默认贴图'),
    );
  }

  set(key: NaiwaTextureOverride): void {
    // 3D 模型角色没有贴图可换，改用造型切换；billboard 的 setLook 只认 'auto'/'laugh'
    const rig = this.rig as NaiwaRig & { setLook?: (k: 'auto' | 'laugh') => void };
    if (key === 'fly') {
      this.isOverridden = true;
      this.overrideKey = 'fly';
      this.applyFly();
      return;
    }
    if (typeof rig.setLook === 'function') {
      // 切回造型通道前，先把可能的飞行材质覆盖还原
      this.restoreMaterial();
      this.isOverridden = key === 'laugh';
      this.overrideKey = key === 'laugh' ? 'laugh' : null;
      rig.setLook(key === 'laugh' ? 'laugh' : 'auto');
      return;
    }
    if (key === 'laugh') {
      this.isOverridden = true;
      this.overrideKey = 'laugh';
      this.applyLaugh();
      return;
    }
    this.isOverridden = false;
    this.overrideKey = null;
    this.restore();
  }

  private applyLaugh(): void {
    const material = this.material();
    if (!material || !this.laughTexture) {
      if (!this.warned) {
        this.warned = true;
        console.warn('[naiwa] 找不到可换贴图的材质，跳过大笑贴图');
      }
      return;
    }
    if (this.savedMap === null) this.savedMap = material.map ?? null;
    material.map = this.laughTexture;
    material.needsUpdate = true;
  }

  private applyFly(): void {
    const material = this.material();
    if (!material || !this.flyTexture) {
      if (!this.warned) {
        this.warned = true;
        console.warn('[naiwa] 找不到可换贴图的材质，跳过飞行贴图');
      }
      return;
    }
    if (this.savedMap === null) this.savedMap = material.map ?? null;
    material.map = this.flyTexture;
    material.needsUpdate = true;
  }

  private restoreMaterial(): void {
    const material = this.material();
    if (!material || this.savedMap === null) return;
    material.map = this.savedMap;
    material.needsUpdate = true;
    this.savedMap = null;
  }

  private restore(): void {
    if (!this.isOverridden) return;
    this.isOverridden = false;
    this.restoreMaterial();
  }

  private material(): THREE.MeshBasicMaterial | null {
    if (!this.sprite) return null;
    const material = this.sprite.material;
    if (Array.isArray(material)) return null;
    return material as THREE.MeshBasicMaterial;
  }
}
