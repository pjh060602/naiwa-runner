import * as THREE from 'three';

/** 三维点（只读元组，避免每次分配 Vector3） */
export type V3 = readonly [number, number, number];

/** 零件烘焙参数 */
export interface PartOptions {
  /** 明暗烘焙强度：1 = 标准（顶面亮 13%，侧面中，底面暗 13%） */
  shade?: number;
  /** 接地光遮蔽高度（米），0 = 关；底部一圈压暗，物体才像「长在地上」 */
  ao?: number;
  /** 逐顶点色噪（木纹 / 磨损 / 风蚀），0 = 关 */
  grain?: number;
  /** 整体染色倍率，做同色零件之间的色差 */
  tint?: number;
  /** 强制逐三角平面法线（硬边低多边形） */
  flat?: boolean;
  /** 面朝上（自动纠正绕序，做布面/叶面时省得推绕序） */
  up?: boolean;
  /** 面朝下（自动纠正绕序） */
  down?: boolean;
}

export type SheetOptions = PartOptions;

const ZERO: V3 = [0, 0, 0];
/**
 * 这是**烘焙风格光**，不是太阳真源：只用来给顶点色分出「顶亮 / 侧中 / 底暗」，服务物件的立体感。
 * 真太阳方向见 world/lighting.ts 的 SUN_DIRECTION（天空光晕与实时阴影都从那里取）。
 */
const LIGHT = new THREE.Vector3(0.35, 0.75, 0.45).normalize();
const UP = new THREE.Vector3(0, 1, 0);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _color = new THREE.Color();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n1 = new THREE.Vector3();
const _n2 = new THREE.Vector3();

/**
 * 道具合并器：把几十个零件烘成一个 position + normal + color 的 BufferGeometry。
 * 场景里每种道具只有 1 次 draw call，所以零件的「结构关系 + 体积感」全得靠几何和顶点色本身。
 *
 * 顶点色三层结构：按法线烘焙「顶亮 · 侧中 · 底暗」，按高度烘焙接地暗部，
 * 再叠一点点位置噪声当木纹/磨损 —— 这样一整块同色也不会糊成塑料片。
 */
export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private triCount = 0;

  /** 已写入的三角面数（合并前统计，验收用） */
  get triangles(): number {
    return this.triCount;
  }

  /** 写一个顶点：烘焙明暗后落库 */
  private vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, o: PartOptions): void {
    const shade = o.shade ?? 1;
    const ao = o.ao ?? 0;
    const grain = o.grain ?? 0;
    let f = 1;
    if (shade > 0) {
      const lit = nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z;
      f += shade * (0.1 * ny + 0.055 * lit);
    }
    if (ao > 0) f *= 0.84 + 0.16 * Math.sqrt(clamp01(y / ao));
    if (grain > 0) {
      const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
      f *= 1 + grain * ((h - Math.floor(h)) * 2 - 1);
    }
    const tint = o.tint ?? 1;
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.colors.push(clamp01(_color.r * f * tint), clamp01(_color.g * f * tint), clamp01(_color.b * f * tint));
  }

  private triangle(p0: V3, p1: V3, p2: V3, o: PartOptions, up?: boolean, down?: boolean): void {
    _a.set(p0[0], p0[1], p0[2]);
    _b.set(p1[0], p1[1], p1[2]);
    _c.set(p2[0], p2[1], p2[2]);
    _n1.subVectors(_b, _a);
    _n2.subVectors(_c, _a);
    _v.crossVectors(_n1, _n2);
    const len = _v.length();
    if (len < 1e-9) return;
    _v.multiplyScalar(1 / len);
    let first = p0;
    let second = p1;
    let third = p2;
    if ((up && _v.y < 0) || (down && _v.y > 0)) {
      first = p0;
      second = p2;
      third = p1;
      _v.multiplyScalar(-1);
    }
    this.vertex(first[0], first[1], first[2], _v.x, _v.y, _v.z, o);
    this.vertex(second[0], second[1], second[2], _v.x, _v.y, _v.z, o);
    this.vertex(third[0], third[1], third[2], _v.x, _v.y, _v.z, o);
    this.triCount += 1;
  }

  /** 摄取一个 three 内置几何体（可带变换矩阵） */
  addGeometry(geometry: THREE.BufferGeometry, color: number, matrix: THREE.Matrix4 | null = null, o: PartOptions = {}): this {
    const indexed = geometry.index !== null;
    const source = indexed ? geometry.toNonIndexed() : geometry;
    const position = source.getAttribute('position') as THREE.BufferAttribute;
    const normalAttribute = source.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const count = position.count;
    _color.setHex(color, THREE.SRGBColorSpace);
    const flat = o.flat ?? false;
    if (flat || !normalAttribute) {
      const baked: number[] = [];
      for (let i = 0; i < count; i += 1) {
        _v.fromBufferAttribute(position, i);
        if (matrix) _v.applyMatrix4(matrix);
        baked.push(_v.x, _v.y, _v.z);
      }
      for (let i = 0; i + 2 < count; i += 3) {
        this.triangle(
          [baked[i * 3], baked[i * 3 + 1], baked[i * 3 + 2]],
          [baked[i * 3 + 3], baked[i * 3 + 4], baked[i * 3 + 5]],
          [baked[i * 3 + 6], baked[i * 3 + 7], baked[i * 3 + 8]],
          o,
          o.up,
          o.down,
        );
      }
    } else {
      for (let i = 0; i < count; i += 1) {
        _v.fromBufferAttribute(position, i);
        if (matrix) _v.applyMatrix4(matrix);
        _n.fromBufferAttribute(normalAttribute, i);
        if (matrix) _n.transformDirection(matrix);
        this.vertex(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, o);
      }
      this.triCount += Math.floor(count / 3);
    }
    if (indexed) source.dispose();
    return this;
  }

  private matrix(at: V3, rot: V3 = ZERO): THREE.Matrix4 {
    _p.set(at[0], at[1], at[2]);
    _e.set(rot[0], rot[1], rot[2]);
    _q.setFromEuler(_e);
    return _m.compose(_p, _q, _one);
  }

  box(color: number, size: V3, at: V3, rot: V3 = ZERO, o: PartOptions = {}): this {
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
    this.addGeometry(geometry, color, this.matrix(at, rot), o);
    geometry.dispose();
    return this;
  }

  /** 圆柱 / 圆台，默认 8 边、带盖 */
  cyl(
    color: number,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    at: V3,
    segments = 8,
    rot: V3 = ZERO,
    o: PartOptions & { cap?: boolean } = {},
  ): this {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, o.cap === false);
    this.addGeometry(geometry, color, this.matrix(at, rot), o);
    geometry.dispose();
    return this;
  }

  /** 任意两点之间的圆杆（斜撑 / 伞骨 / 缆绳） */
  rod(color: number, from: V3, to: V3, radiusA: number, radiusB: number, segments = 6, o: PartOptions & { cap?: boolean } = {}): this {
    _a.set(from[0], from[1], from[2]);
    _b.set(to[0], to[1], to[2]);
    const length = _a.distanceTo(_b);
    if (length < 1e-4) return this;
    const geometry = new THREE.CylinderGeometry(radiusA, radiusB, length, segments, 1, o.cap === false);
    _c.subVectors(_b, _a).multiplyScalar(1 / length);
    _q.setFromUnitVectors(UP, _c);
    _p.copy(_a).addScaledVector(_c, length / 2);
    this.addGeometry(geometry, color, _m.compose(_p, _q, _one), o);
    geometry.dispose();
    return this;
  }

  /** 任意两点之间的方杆（木斜撑 / 扶手）：局部 Y 沿杆向，局部 X 尽量保持水平 */
  beam(color: number, from: V3, to: V3, width: number, depth: number, o: PartOptions = {}): this {
    _a.set(from[0], from[1], from[2]);
    _b.set(to[0], to[1], to[2]);
    const length = _a.distanceTo(_b);
    if (length < 1e-4) return this;
    const geometry = new THREE.BoxGeometry(width, length, depth);
    const yAxis = new THREE.Vector3().subVectors(_b, _a).multiplyScalar(1 / length);
    const xAxis = new THREE.Vector3().crossVectors(yAxis, UP);
    if (xAxis.lengthSq() < 1e-6) xAxis.set(1, 0, 0);
    xAxis.normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
    _m.makeBasis(xAxis, yAxis, zAxis);
    _m.setPosition((_a.x + _b.x) / 2, (_a.y + _b.y) / 2, (_a.z + _b.z) / 2);
    this.addGeometry(geometry, color, _m, o);
    geometry.dispose();
    return this;
  }

  sphere(color: number, radius: number, at: V3, segments = 8, o: PartOptions = {}): this {
    const geometry = new THREE.SphereGeometry(radius, segments, Math.max(4, segments - 2));
    this.addGeometry(geometry, color, this.matrix(at), o);
    geometry.dispose();
    return this;
  }

  /** 椭球：给海鸥身体、石头这类需要一个压扁球的零件 */
  ellipsoid(color: number, radii: V3, at: V3, segments = 8, o: PartOptions = {}): this {
    const geometry = new THREE.SphereGeometry(1, segments, Math.max(4, segments - 2));
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(at[0], at[1], at[2]),
      new THREE.Quaternion(),
      new THREE.Vector3(radii[0], radii[1], radii[2]),
    );
    this.addGeometry(geometry, color, matrix, o);
    geometry.dispose();
    return this;
  }

  torus(
    color: number,
    radius: number,
    tube: number,
    at: V3,
    rot: V3 = ZERO,
    radialSegments = 6,
    tubularSegments = 10,
    o: PartOptions = {},
  ): this {
    const geometry = new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments);
    this.addGeometry(geometry, color, this.matrix(at, rot), o);
    geometry.dispose();
    return this;
  }

  /**
   * 有厚度的板：给 4 个角点（顺序随意）+ 厚度向量，生成闭合 6 面体（12 tris）。
   * 法线按几何自动朝外 —— 翼面这种接近水平的薄板用 up/down 判朝向容易翻，
   * 这里改成「算出来再翻」，怎么填角点都不会出现背面。
   */
  panel(color: number, corners: readonly [V3, V3, V3, V3], thickness: V3, o: PartOptions = {}): this {
    _color.setHex(color, THREE.SRGBColorSpace);
    const [c0, c1, c2, c3] = corners;
    _a.set(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]);
    _b.set(c2[0] - c0[0], c2[1] - c0[1], c2[2] - c0[2]);
    _n1.crossVectors(_a, _b);
    _n2.set(-thickness[0], -thickness[1], -thickness[2]);
    const top: V3[] = _n1.dot(_n2) < 0 ? [c0, c3, c2, c1] : [c0, c1, c2, c3];
    const bottom: V3[] = top.map((q) => [q[0] + thickness[0], q[1] + thickness[1], q[2] + thickness[2]] as V3);

    // 上下两面
    this.triangle(top[0], top[1], top[2], o);
    this.triangle(top[0], top[2], top[3], o);
    this.triangle(bottom[0], bottom[2], bottom[1], o);
    this.triangle(bottom[0], bottom[3], bottom[2], o);

    // 四周侧壁：法线朝「远离板心」的一侧
    _p.set(0, 0, 0);
    for (const q of top) {
      _p.x += q[0] / 4;
      _p.y += q[1] / 4;
      _p.z += q[2] / 4;
    }
    for (let i = 0; i < 4; i += 1) {
      const j = (i + 1) % 4;
      const a = top[i];
      const b = top[j];
      const c = bottom[j];
      const d = bottom[i];
      _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      _n1.crossVectors(_a, _b);
      _n2.set(
        (a[0] + b[0]) / 2 - _p.x,
        (a[1] + b[1]) / 2 - _p.y,
        (a[2] + b[2]) / 2 - _p.z,
      );
      if (_n1.dot(_n2) < 0) {
        this.triangle(a, c, b, o);
        this.triangle(a, d, c, o);
      } else {
        this.triangle(a, b, c, o);
        this.triangle(a, c, d, o);
      }
    }
    return this;
  }

  /** 贴地圆片（落地暗斑 / 水洼）：一圈三角扇，比带盖圆柱省一半面 */
  disc(color: number, radiusX: number, radiusZ: number, at: V3, segments = 12, o: SheetOptions = {}): this {
    _color.setHex(color, THREE.SRGBColorSpace);
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      this.triangle(
        [at[0], at[1], at[2]],
        [at[0] + Math.cos(a0) * radiusX, at[1], at[2] + Math.sin(a0) * radiusZ],
        [at[0] + Math.cos(a1) * radiusX, at[1], at[2] + Math.sin(a1) * radiusZ],
        o,
        o.up ?? true,
        o.down,
      );
    }
    return this;
  }

  /** 四边形（两个三角） */
  quad(color: number, p0: V3, p1: V3, p2: V3, p3: V3, o: SheetOptions = {}): this {
    _color.setHex(color, THREE.SRGBColorSpace);
    this.triangle(p0, p1, p2, o, o.up, o.down);
    this.triangle(p0, p2, p3, o, o.up, o.down);
    return this;
  }

  /** 三角面片汤（点数须为 3 的倍数），逐面法线 */
  poly(color: number, points: readonly V3[], o: SheetOptions = {}): this {
    _color.setHex(color, THREE.SRGBColorSpace);
    for (let i = 0; i + 2 < points.length; i += 3) {
      this.triangle(points[i], points[i + 1], points[i + 2], o, o.up, o.down);
    }
    return this;
  }

  /**
   * 参数曲面：cols × rows 的网格，fn(u, v) 返回模型空间的点。
   * 伞面、棕榈叶、帆布、破浪泡沫都用它，绕序可用 up/down 自动纠正。
   */
  sheet(color: number, cols: number, rows: number, fn: (u: number, v: number) => V3, o: SheetOptions = {}): this {
    _color.setHex(color, THREE.SRGBColorSpace);
    const grid: V3[] = [];
    for (let j = 0; j <= rows; j += 1) {
      for (let i = 0; i <= cols; i += 1) {
        grid.push(fn(i / cols, j / rows));
      }
    }
    const at = (i: number, j: number): V3 => grid[j * (cols + 1) + i];
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        this.triangle(at(i, j), at(i, j + 1), at(i + 1, j + 1), o, o.up, o.down);
        this.triangle(at(i, j), at(i + 1, j + 1), at(i + 1, j), o, o.up, o.down);
      }
    }
    return this;
  }

  /** 收尾：合成单个 BufferGeometry（位置 + 法线 + 顶点色） */
  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}
