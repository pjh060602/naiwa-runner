import * as THREE from 'three';

/**
 * 把一堆带颜色的基础几何体烘成单个 BufferGeometry（position + normal + color）。
 * 目的：一个 prefab / 一个障碍 = 1 次 draw call，且只创建一次，帧内零 new。
 */
export class GeoBuilder {
  private readonly chunks: { position: Float32Array; normal: Float32Array; color: Float32Array }[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly tint = new THREE.Color();

  private push(geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): this {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    flat.deleteAttribute('uv');
    this.position.set(x, y, z);
    this.euler.set(rx, ry, rz);
    this.quaternion.setFromEuler(this.euler);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    flat.applyMatrix4(this.matrix);

    const positionAttribute = flat.getAttribute('position');
    const normalAttribute = flat.getAttribute('normal');
    const count = positionAttribute.count;
    const colors = new Float32Array(count * 3);
    this.tint.setHex(color, THREE.SRGBColorSpace);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = this.tint.r;
      colors[i * 3 + 1] = this.tint.g;
      colors[i * 3 + 2] = this.tint.b;
    }
    this.chunks.push({
      position: new Float32Array(positionAttribute.array as Float32Array),
      normal: new Float32Array(normalAttribute.array as Float32Array),
      color: colors,
    });
    flat.dispose();
    return this;
  }

  box(
    color: number,
    size: readonly [number, number, number],
    at: readonly [number, number, number],
    rotation: readonly [number, number, number] = [0, 0, 0],
  ): this {
    return this.push(new THREE.BoxGeometry(size[0], size[1], size[2]), color, at[0], at[1], at[2], rotation[0], rotation[1], rotation[2]);
  }

  cylinder(
    color: number,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    at: readonly [number, number, number],
    segments = 8,
    rotation: readonly [number, number, number] = [0, 0, 0],
  ): this {
    return this.push(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1),
      color,
      at[0],
      at[1],
      at[2],
      rotation[0],
      rotation[1],
      rotation[2],
    );
  }

  sphere(color: number, radius: number, at: readonly [number, number, number], segments = 6): this {
    return this.push(new THREE.SphereGeometry(radius, segments, Math.max(4, segments - 2)), color, at[0], at[1], at[2]);
  }

  get isEmpty(): boolean {
    return this.chunks.length === 0;
  }

  build(): THREE.BufferGeometry {
    let total = 0;
    for (const chunk of this.chunks) total += chunk.position.length;
    const position = new Float32Array(total);
    const normal = new Float32Array(total);
    const color = new Float32Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      position.set(chunk.position, offset);
      normal.set(chunk.normal, offset);
      color.set(chunk.color, offset);
      offset += chunk.position.length;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geometry.computeBoundingSphere();
    this.chunks.length = 0;
    return geometry;
  }
}
