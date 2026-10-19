import * as THREE from 'three';
import type { NaiwaRig } from '../player/rig';
import type { NaiwaTextureKey } from './stage';

/**
 * 奶蛙的「捧腹大笑」贴图覆盖（奶蛙全程正面，所以只需要在默认正面 / 大笑 之间切）。
 * 只换材质的 map，不修改 character/naiwa.ts；结束后还原它原本的贴图。
 */
export class NaiwaTextures {
  private readonly sprite: THREE.Mesh | null;
  private laughTexture: THREE.Texture | null = null;
  private savedMap: THREE.Texture | null = null;
  private isOverridden = false;
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

    const base = import.meta.env.BASE_URL;
    new THREE.TextureLoader().load(
      `${base}models/naiwa_laugh_tex.png`,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        this.laughTexture = texture;
        if (this.isOverridden) this.applyLaugh();
      },
      undefined,
      () => console.warn('[naiwa] 大笑贴图加载失败，演出期间沿用默认贴图'),
    );
  }

  set(key: NaiwaTextureKey): void {
    // 3D 模型角色没有贴图可换，改用造型切换
    const rig = this.rig as NaiwaRig & { setLook?: (k: 'auto' | 'laugh') => void };
    if (typeof rig.setLook === 'function') {
      this.isOverridden = key === 'laugh';
      rig.setLook(key === 'laugh' ? 'laugh' : 'auto');
      return;
    }
    if (key === 'laugh') {
      this.isOverridden = true;
      this.applyLaugh();
      return;
    }
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

  private restore(): void {
    if (!this.isOverridden) return;
    this.isOverridden = false;
    const material = this.material();
    if (!material) return;
    material.map = this.savedMap;
    material.needsUpdate = true;
    this.savedMap = null;
  }

  private material(): THREE.MeshBasicMaterial | null {
    if (!this.sprite) return null;
    const material = this.sprite.material;
    if (Array.isArray(material)) return null;
    return material as THREE.MeshBasicMaterial;
  }
}
