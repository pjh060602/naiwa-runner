import * as THREE from 'three';

/**
 * 角色挂身特效（磁铁 / 护盾 / 飞行）。
 *
 * 防抖设计：本类从不读取模拟坐标（player.x 等），所有特效都挂在构造时传入的
 * parent（即 rig.root）之下的 root Group 里。game.ts 在 render() 里对 rig.root
 * 做插值定位，子节点自动继承插值后的变换，因此特效与角色之间永远零偏移。
 *
 * 预算：总 draw call = 4（磁铁合并网格 1 + 粒子 InstancedMesh 1 + 护盾壳 1 +
 * 碎片 InstancedMesh 1），总实例数 = 12（磁铁环绕 4 + 飞行气流 8）+ 8（碎片）= 20。
 * update() 内零 new、零 geometry 创建；材质与对象全部在构造时一次性建好。
 */

const FADE_SECONDS = 0.2;
const FADE_RATE = 1 / FADE_SECONDS;

// ── 磁铁：三层 ────────────────────────────────────────────────
const MAGNET_RING_INNER = 0.5;
const MAGNET_RING_OUTER = 0.68;
const MAGNET_RING_SEGMENTS = 72;
const MAGNET_RING_Y = 0.035;
const MAGNET_OPACITY = 0.42;

const MAGNET_GLOW_RADIUS = 0.5;
const MAGNET_GLOW_HEIGHT = 1.15;
const MAGNET_GLOW_CENTER_Y = 0.58;
const MAGNET_GLOW_STRENGTH = 0.1; // 极淡，避免盖过五官

const ORBITER_COUNT = 4;
const ORBITER_RADIUS = 0.66;
const ORBITER_BASE_Y = 0.55;
const ORBITER_SWING = 0.18;
const ORBITER_SPEED = 1.9; // rad/s，公转
const ORBITER_SCALE = 0.06;

// ── 飞行气流 ──────────────────────────────────────────────────
const FLY_COUNT = 8;
const FLY_SCALE = 0.055;
const FLY_SPAWN_INTERVAL = 0.09;
const FLY_LIFE_MIN = 0.35;
const FLY_LIFE_MAX = 0.6;
const FLY_SPEED_MIN = 1.2;
const FLY_SPEED_MAX = 2.1;

// ── 护盾 ──────────────────────────────────────────────────────
const SHIELD_RADIUS = 0.92;
const SHIELD_CENTER_Y = 0.72;
const SHIELD_BREATH = 0.03;
const SHIELD_SPIN_Y = 0.4;
const SHIELD_SPIN_Z = 0.13;

// ── 护盾碎片（固定池）─────────────────────────────────────────
const SHARD_COUNT = 8;
const SHARD_DURATION = 0.35;
const SHARD_SCALE = 0.16;
const SHARD_START_RADIUS = 0.55;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

interface FlySlot {
  active: boolean;
  age: number;
  life: number;
  x: number;
  z: number;
  y: number;
  vy: number;
  driftX: number;
}

interface MagnetChunk {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  /** 0 = 地面金环，1 = 竖向辉光（片段着色器据此走不同分支） */
  kind: Float32Array;
}

function pushChunk(
  chunks: MagnetChunk[],
  geometry: THREE.BufferGeometry,
  colors: Float32Array,
  kindValue: number,
): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  chunks.push({
    position: new Float32Array(position.array as Float32Array),
    normal: new Float32Array(normal.array as Float32Array),
    color: colors,
    kind: new Float32Array(position.count).fill(kindValue),
  });
}

/** 磁铁「金环 + 竖向辉光」烘成单个 BufferGeometry = 1 次 draw call。 */
function buildMagnetGeometry(): THREE.BufferGeometry {
  const chunks: MagnetChunk[] = [];
  const tint = new THREE.Color();
  const matrix = new THREE.Matrix4();

  // ① 脚下水平金色圆环：顶点色按角度做明暗分段，自转时能看到流光
  const ringSource = new THREE.RingGeometry(
    MAGNET_RING_INNER,
    MAGNET_RING_OUTER,
    MAGNET_RING_SEGMENTS,
    2,
  ).toNonIndexed();
  const ringPos = ringSource.getAttribute('position') as THREE.BufferAttribute;
  const ringColors = new Float32Array(ringPos.count * 3);
  for (let i = 0; i < ringPos.count; i += 1) {
    const angle = Math.atan2(ringPos.getY(i), ringPos.getX(i));
    const shimmer = 0.72 + 0.28 * Math.sin(angle * 4.0);
    tint.setRGB(1.0 * shimmer, 0.78 * shimmer, 0.32 * shimmer, THREE.SRGBColorSpace);
    ringColors[i * 3] = tint.r;
    ringColors[i * 3 + 1] = tint.g;
    ringColors[i * 3 + 2] = tint.b;
  }
  matrix.makeRotationX(-Math.PI / 2).setPosition(0, MAGNET_RING_Y, 0);
  ringSource.applyMatrix4(matrix);
  pushChunk(chunks, ringSource, ringColors, 0);
  ringSource.dispose();

  // ② 极淡竖向辉光：开口圆柱。这里只烘焙「下亮上收」的纵向明暗；
  //    边缘柔化（上下两端 + 左右剪影处渐隐到 0）由 magnet 的 ShaderMaterial 完成。
  const glowSource = new THREE.CylinderGeometry(
    MAGNET_GLOW_RADIUS,
    MAGNET_GLOW_RADIUS,
    MAGNET_GLOW_HEIGHT,
    32,
    1,
    true,
  ).toNonIndexed();
  const glowPos = glowSource.getAttribute('position') as THREE.BufferAttribute;
  const glowColors = new Float32Array(glowPos.count * 3);
  const halfHeight = MAGNET_GLOW_HEIGHT / 2;
  for (let i = 0; i < glowPos.count; i += 1) {
    const t = (glowPos.getY(i) + halfHeight) / MAGNET_GLOW_HEIGHT;
    const profile = 1.0 - 0.45 * t;
    tint.setRGB(1.0 * profile, 0.76 * profile, 0.38 * profile, THREE.SRGBColorSpace);
    glowColors[i * 3] = tint.r;
    glowColors[i * 3 + 1] = tint.g;
    glowColors[i * 3 + 2] = tint.b;
  }
  matrix.makeTranslation(0, MAGNET_GLOW_CENTER_Y, 0);
  glowSource.applyMatrix4(matrix);
  pushChunk(chunks, glowSource, glowColors, 1);
  glowSource.dispose();

  let total = 0;
  for (const chunk of chunks) total += chunk.position.length;
  const position = new Float32Array(total);
  const normal = new Float32Array(total);
  const color = new Float32Array(total);
  const kind = new Float32Array(total / 3);
  let offset = 0;
  for (const chunk of chunks) {
    position.set(chunk.position, offset);
    normal.set(chunk.normal, offset);
    color.set(chunk.color, offset);
    kind.set(chunk.kind, offset / 3);
    offset += chunk.position.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

/** 护盾碎片：单面三角形（InstancedMesh 固定池，不 new）。 */
function buildShardGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-0.09, -0.055, 0, 0.09, -0.055, 0, 0, 0.12, 0]), 3),
  );
  geometry.setAttribute(
    'normal',
    new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3),
  );
  return geometry;
}

export class BuffFx {
  /** 特效根节点，构造时已挂到 parent（rig.root）下。 */
  readonly root = new THREE.Group();

  private readonly parent: THREE.Object3D;

  // 磁铁：金环 + 辉光合并在一个网格里（单 draw call，ShaderMaterial 区分两者）
  private readonly magnetGeometry: THREE.BufferGeometry;
  private readonly magnetMaterial: THREE.ShaderMaterial;
  private readonly magnetMesh: THREE.Mesh;
  private magnetOn = false;
  private magnetFade = 0;

  // 粒子：磁铁环绕粒子(0..3) + 飞行气流(4..11) 共用一个 InstancedMesh
  private readonly particleGeometry: THREE.SphereGeometry;
  private readonly particleMaterial: THREE.MeshBasicMaterial;
  private readonly particleMesh: THREE.InstancedMesh;
  private readonly orbiterPhases: number[] = [];
  private readonly flySlots: FlySlot[] = [];
  private flyOn = false;
  private flyFade = 0;
  private flySpawnTimer = 0;
  private flyActiveCount = 0;

  // 护盾壳：BackSide + depthWrite:false，永不与角色贴图共面打架
  private readonly shieldGeometry: THREE.SphereGeometry;
  private readonly shieldMaterial: THREE.ShaderMaterial;
  private readonly shieldMesh: THREE.Mesh;
  private shieldOn = false;
  private shieldFade = 0;

  // 护盾碎片固定池
  private readonly shardGeometry: THREE.BufferGeometry;
  private readonly shardMaterial: THREE.MeshBasicMaterial;
  private readonly shardMesh: THREE.InstancedMesh;
  private readonly shardDirs: THREE.Vector3[] = [];
  private readonly shardAxes: THREE.Vector3[] = [];
  private readonly shardSpeeds: number[] = [];
  private readonly shardSpins: number[] = [];
  private shardActive = false;
  private shardTime = 0;

  private readonly dummy = new THREE.Object3D();
  private elapsed = 0;

  constructor(parent: THREE.Object3D) {
    this.parent = parent;
    this.root.name = 'buff-fx';
    parent.add(this.root);

    // ── 磁铁网格 ──
    // 金环走顶点色；竖向辉光在片段里做三重柔化：
    // 上下两端 smoothstep 渐隐、左右剪影处按 normal·viewDir 渐隐、纵向明暗下亮上收。
    // 三处都把 alpha 收到 0，因此无论从哪个角度看都没有直线硬边 / 矩形轮廓。
    this.magnetGeometry = buildMagnetGeometry();
    this.magnetMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uRingAlpha: { value: 0 },
        uGlowAlpha: { value: 0 },
        uGold: { value: new THREE.Color().setRGB(1.0, 0.76, 0.38, THREE.SRGBColorSpace) },
      },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        attribute float aKind;
        varying vec3 vColor;
        varying float vKind;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying float vLocalY;
        void main() {
          vColor = color;
          vKind = aKind;
          vLocalY = position.y;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uRingAlpha;
        uniform float uGlowAlpha;
        uniform vec3 uGold;
        varying vec3 vColor;
        varying float vKind;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying float vLocalY;
        void main() {
          if (vKind < 0.5) {
            // 地面金环：顶点色已含角度流光，additive 下 alpha 即亮度
            gl_FragColor = vec4(vColor, uRingAlpha);
          } else {
            float t = clamp((vLocalY - ${(MAGNET_GLOW_CENTER_Y - MAGNET_GLOW_HEIGHT / 2).toFixed(4)}) / ${MAGNET_GLOW_HEIGHT.toFixed(4)}, 0.0, 1.0);
            float vertical = 1.0 - 0.45 * t;
            float bottomFade = smoothstep(0.0, 0.18, t);
            float topFade = 1.0 - smoothstep(0.82, 1.0, t);
            vertical *= bottomFade * topFade;
            vec3 viewDir = normalize(cameraPosition - vWorldPos);
            float ndv = abs(dot(viewDir, normalize(vNormal)));
            float grazing = pow(ndv, 2.6);
            float glow = vertical * grazing;
            gl_FragColor = vec4(uGold * (glow * uGlowAlpha), 1.0);
          }
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    });
    this.magnetMesh = new THREE.Mesh(this.magnetGeometry, this.magnetMaterial);
    this.magnetMesh.name = 'buff-fx.magnet';
    this.magnetMesh.frustumCulled = false;
    this.magnetMesh.visible = false;
    this.root.add(this.magnetMesh);

    // ── 粒子 InstancedMesh ──
    this.particleGeometry = new THREE.SphereGeometry(1, 10, 8);
    this.particleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.particleMesh = new THREE.InstancedMesh(
      this.particleGeometry,
      this.particleMaterial,
      ORBITER_COUNT + FLY_COUNT,
    );
    this.particleMesh.name = 'buff-fx.particles';
    this.particleMesh.frustumCulled = false;
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.visible = false;
    this.root.add(this.particleMesh);

    const gold = new THREE.Color().setRGB(1.0, 0.76, 0.3, THREE.SRGBColorSpace);
    const coolWhite = new THREE.Color().setRGB(0.68, 0.85, 1.0, THREE.SRGBColorSpace);
    for (let i = 0; i < ORBITER_COUNT + FLY_COUNT; i += 1) {
      this.dummy.position.set(0, 0, 0);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
      this.particleMesh.setColorAt(i, i < ORBITER_COUNT ? gold : coolWhite);
      if (i < ORBITER_COUNT) this.orbiterPhases.push((i / ORBITER_COUNT) * Math.PI * 2);
      else this.flySlots.push({ active: false, age: 0, life: 1, x: 0, z: 0, y: 0, vy: 0, driftX: 0 });
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;

    // ── 护盾壳 ──
    this.shieldGeometry = new THREE.SphereGeometry(SHIELD_RADIUS, 40, 28);
    this.shieldMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uColor: { value: new THREE.Color().setRGB(0.42, 0.82, 1.0, THREE.SRGBColorSpace) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uAlpha;
        uniform vec3 uColor;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          float ndv = abs(dot(viewDir, normalize(vWorldNormal)));
          float rim = pow(1.0 - ndv, 2.4);
          float groundFade = smoothstep(0.05, 0.35, vWorldPosition.y);
          float arc = 0.5 + 0.5 * sin(atan(vWorldNormal.z, vWorldNormal.x) * 6.0 - uTime * 1.6);
          float band = 0.86 + 0.14 * arc;
          vec3 color = uColor * (uAlpha * rim * rim * band * groundFade);
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.shieldMesh = new THREE.Mesh(this.shieldGeometry, this.shieldMaterial);
    this.shieldMesh.name = 'buff-fx.shield';
    this.shieldMesh.position.y = SHIELD_CENTER_Y;
    this.shieldMesh.frustumCulled = false;
    this.shieldMesh.visible = false;
    this.root.add(this.shieldMesh);

    // ── 碎片固定池 ──
    this.shardGeometry = buildShardGeometry();
    this.shardMaterial = new THREE.MeshBasicMaterial({
      color: 0xbde8ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.shardMesh = new THREE.InstancedMesh(this.shardGeometry, this.shardMaterial, SHARD_COUNT);
    this.shardMesh.name = 'buff-fx.shards';
    this.shardMesh.frustumCulled = false;
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shardMesh.visible = false;
    this.root.add(this.shardMesh);

    for (let i = 0; i < SHARD_COUNT; i += 1) {
      // 立方体角方向（8 个固定方向），从球心向外飞散
      const dir = new THREE.Vector3(
        i & 1 ? 1 : -1,
        i & 2 ? 1 : -1,
        i & 4 ? 1 : -1,
      ).normalize();
      this.shardDirs.push(dir);
      this.shardAxes.push(
        new THREE.Vector3(0.35 + (i % 3) * 0.3, 0.6 + (i % 2) * 0.3, 0.25 + (i % 3) * 0.2).normalize(),
      );
      this.shardSpeeds.push(1.5 + (i % 4) * 0.35);
      this.shardSpins.push(5 + i * 0.8);

      this.dummy.position.set(0, SHIELD_CENTER_Y, 0);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.shardMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.shardMesh.instanceMatrix.needsUpdate = true;
  }

  setMagnet(on: boolean): void {
    this.magnetOn = on;
    if (on) this.magnetMesh.visible = true;
  }

  setShield(on: boolean): void {
    this.shieldOn = on;
    if (on) this.shieldMesh.visible = true;
  }

  shieldBreak(): void {
    this.shieldOn = false;
    this.shardActive = true;
    this.shardTime = 0;
    this.shardMesh.visible = true;
  }

  setFly(on: boolean): void {
    this.flyOn = on;
    if (on) this.flySpawnTimer = 0;
  }

  update(dt: number, intensity: number): void {
    const safeDt = Math.min(Math.max(dt, 0), 0.1);
    this.elapsed += safeDt;
    const pulse = clamp01(intensity);
    this.updateMagnet(safeDt, pulse);
    this.updateParticles(safeDt, pulse);
    this.updateShield(safeDt);
    this.updateShards(safeDt);
  }

  dispose(): void {
    this.parent.remove(this.root);
    this.magnetGeometry.dispose();
    this.magnetMaterial.dispose();
    this.particleGeometry.dispose();
    this.particleMaterial.dispose();
    this.shieldGeometry.dispose();
    this.shieldMaterial.dispose();
    this.shardGeometry.dispose();
    this.shardMaterial.dispose();
  }

  private fade(current: number, targetOn: boolean, dt: number): number {
    const target = targetOn ? 1 : 0;
    if (current === target) return current;
    const step = FADE_RATE * dt;
    return targetOn ? Math.min(target, current + step) : Math.max(target, current - step);
  }

  private updateMagnet(dt: number, pulse: number): void {
    this.magnetFade = this.fade(this.magnetFade, this.magnetOn, dt);
    if (this.magnetFade <= 0.001) {
      this.magnetMesh.visible = false;
      this.magnetMaterial.uniforms.uRingAlpha.value = 0;
      this.magnetMaterial.uniforms.uGlowAlpha.value = 0;
      return;
    }
    this.magnetMesh.visible = true;
    this.magnetMesh.rotation.y += dt * 0.9;
    const breathe = 0.92 + 0.08 * Math.sin(this.elapsed * 5.2);
    const twinkle = 0.55 + 0.45 * pulse;
    this.magnetMaterial.uniforms.uRingAlpha.value =
      MAGNET_OPACITY * this.magnetFade * twinkle * breathe;
    this.magnetMaterial.uniforms.uGlowAlpha.value =
      MAGNET_GLOW_STRENGTH * this.magnetFade * twinkle * breathe;
  }

  private updateParticles(dt: number, pulse: number): void {
    // 磁铁环绕粒子：相位错开公转 + 高度起伏
    for (let i = 0; i < ORBITER_COUNT; i += 1) {
      const phase = this.orbiterPhases[i];
      const angle = this.elapsed * ORBITER_SPEED + phase;
      const bob = Math.sin(this.elapsed * 2.7 + phase * 1.7);
      const shimmer = 1 + 0.15 * Math.sin(this.elapsed * 6.0 + phase * 3.0);
      const scale = ORBITER_SCALE * this.magnetFade * (0.7 + 0.5 * pulse) * shimmer;
      this.dummy.position.set(
        Math.cos(angle) * ORBITER_RADIUS,
        ORBITER_BASE_Y + bob * ORBITER_SWING,
        Math.sin(angle) * ORBITER_RADIUS,
      );
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
    }

    // 飞行气流：脚下短促粒子向上飘散
    this.flyFade = this.fade(this.flyFade, this.flyOn, dt);
    if (this.flyOn && this.flyFade > 0.5) {
      this.flySpawnTimer -= dt;
      if (this.flySpawnTimer <= 0) {
        this.flySpawnTimer = FLY_SPAWN_INTERVAL * (0.8 + Math.random() * 0.4);
        this.spawnFly();
      }
    }
    for (let i = 0; i < FLY_COUNT; i += 1) {
      const slot = this.flySlots[i];
      let scale = 0;
      if (slot.active) {
        slot.age += dt;
        const t = slot.age / slot.life;
        if (t >= 1) {
          slot.active = false;
          this.flyActiveCount -= 1;
        } else {
          slot.y += slot.vy * dt;
          slot.x += slot.driftX * dt;
          scale = FLY_SCALE * this.flyFade * (1 - t) * (0.75 + 0.25 * Math.sin(t * Math.PI));
        }
      }
      this.dummy.position.set(slot.x, slot.y, slot.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(ORBITER_COUNT + i, this.dummy.matrix);
    }

    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.particleMesh.visible =
      this.magnetFade > 0.001 || this.flyFade > 0.001 || this.flyActiveCount > 0;
  }

  private spawnFly(): void {
    for (let i = 0; i < FLY_COUNT; i += 1) {
      const slot = this.flySlots[i];
      if (slot.active) continue;
      slot.active = true;
      slot.age = 0;
      slot.life = FLY_LIFE_MIN + Math.random() * (FLY_LIFE_MAX - FLY_LIFE_MIN);
      slot.x = (Math.random() - 0.5) * 0.34;
      slot.z = (Math.random() - 0.5) * 0.26;
      slot.y = 0.05;
      slot.vy = FLY_SPEED_MIN + Math.random() * (FLY_SPEED_MAX - FLY_SPEED_MIN);
      slot.driftX = (Math.random() - 0.5) * 0.5;
      this.flyActiveCount += 1;
      return;
    }
  }

  private updateShield(dt: number): void {
    this.shieldFade = this.fade(this.shieldFade, this.shieldOn, dt);
    if (this.shieldFade <= 0.001) {
      this.shieldMesh.visible = false;
      this.shieldMaterial.uniforms.uAlpha.value = 0;
      return;
    }
    this.shieldMesh.visible = true;
    this.shieldMesh.rotation.y += dt * SHIELD_SPIN_Y;
    this.shieldMesh.rotation.z += dt * SHIELD_SPIN_Z;
    const breath = 1 + SHIELD_BREATH * Math.sin(this.elapsed * Math.PI * 2 * 0.55);
    this.shieldMesh.scale.setScalar(breath);
    this.shieldMaterial.uniforms.uTime.value = this.elapsed;
    this.shieldMaterial.uniforms.uAlpha.value =
      this.shieldFade * (0.24 + 0.05 * Math.sin(this.elapsed * 4.2));
  }

  private updateShards(dt: number): void {
    if (!this.shardActive) {
      this.shardMesh.visible = false;
      this.shardMaterial.opacity = 0;
      return;
    }
    this.shardTime += dt;
    const t = this.shardTime / SHARD_DURATION;
    if (t >= 1) {
      this.shardActive = false;
      this.shardMesh.visible = false;
      this.shardMaterial.opacity = 0;
      for (let i = 0; i < SHARD_COUNT; i += 1) {
        this.dummy.position.set(0, SHIELD_CENTER_Y, 0);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.shardMesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.shardMesh.instanceMatrix.needsUpdate = true;
      return;
    }
    this.shardMesh.visible = true;
    this.shardMaterial.opacity = 0.9 * (1 - t);
    for (let i = 0; i < SHARD_COUNT; i += 1) {
      const radius = SHARD_START_RADIUS + this.shardSpeeds[i] * this.shardTime;
      const dir = this.shardDirs[i];
      this.dummy.position.set(
        dir.x * radius,
        SHIELD_CENTER_Y + dir.y * radius,
        dir.z * radius,
      );
      this.dummy.quaternion.setFromAxisAngle(this.shardAxes[i], this.shardTime * this.shardSpins[i]);
      this.dummy.scale.setScalar(SHARD_SCALE * (1 - 0.55 * t));
      this.dummy.updateMatrix();
      this.shardMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.shardMesh.instanceMatrix.needsUpdate = true;
  }
}
