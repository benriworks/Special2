import * as THREE from 'three';

import type { LifeTraits } from '../core/generation';

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uEvolution;
  uniform float uMic;
  uniform float uPulse;
  uniform float uTempo;
  uniform float uEnergy;
  uniform float uPixelRatio;
  uniform float uSignalFit;
  uniform float uMotionScale;

  attribute vec3 aSignal;
  attribute vec3 aSeed;
  attribute vec3 aLife;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;

  varying vec3 vColor;
  varying float vSpark;
  varying float vLife;

  void main() {
    float intoSeed = smoothstep(0.0, 0.5, uEvolution);
    float intoLife = smoothstep(0.5, 1.0, uEvolution);

    vec3 signalPosition = aSignal;
    signalPosition.x *= uSignalFit;
    vec3 particlePosition = mix(signalPosition, aSeed, intoSeed);
    particlePosition = mix(particlePosition, aLife, intoLife);

    float rhythm = uTime * uTempo + aPhase;
    float breath = sin(rhythm) * (0.012 + 0.026 * intoLife);
    breath += sin(rhythm * 0.47 + aPhase * 1.7) * 0.009 * uEnergy * intoLife;
    particlePosition *= 1.0 + breath * uMotionScale + uMic * 0.055 + uPulse * 0.11;

    vec3 drift = vec3(
      sin(rhythm * 0.73 + particlePosition.y),
      cos(rhythm * 0.61 + particlePosition.z),
      sin(rhythm * 0.53 + particlePosition.x)
    );
    particlePosition += drift * (0.012 + 0.035 * intoLife * uEnergy) * uMotionScale;

    vec4 viewPosition = modelViewMatrix * vec4(particlePosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    float pulseSize = 1.0 + uPulse * (0.7 + 0.3 * sin(aPhase * 2.0));
    float audioSize = 1.0 + uMic * 0.55;
    gl_PointSize = clamp(
      aSize * pulseSize * audioSize * uPixelRatio * 42.0 / max(1.0, -viewPosition.z),
      1.25,
      28.0
    );

    vColor = aColor;
    vSpark = 0.58 + 0.42 * sin(aPhase * 5.0 + uTime * (0.9 + uEnergy));
    vLife = intoLife;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uMic;
  uniform float uPulse;

  varying vec3 vColor;
  varying float vSpark;
  varying float vLife;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float radius = length(centered) * 2.0;
    if (radius > 1.0) discard;

    // A tight core plus a broad halo gives a bloom-like glow without an
    // expensive full-screen post-processing pass on mobile GPUs.
    float core = pow(max(0.0, 1.0 - radius), 4.0);
    float halo = pow(max(0.0, 1.0 - radius), 1.55);
    float alpha = core * 0.84 + halo * (0.075 + vLife * 0.045);
    alpha *= 0.76 + vSpark * 0.24;

    float radiance = 0.74 + core * 0.92 + uMic * 0.38 + uPulse * 0.52;
    gl_FragColor = vec4(vColor * radiance, alpha);
  }
`;

interface MorphData {
  readonly signal: Float32Array;
  readonly seed: Float32Array;
  readonly life: Float32Array;
  readonly colors: Float32Array;
  readonly sizes: Float32Array;
  readonly phases: Float32Array;
}

interface PointerPosition {
  readonly x: number;
  readonly y: number;
}

interface OrganismUniforms {
  readonly [name: string]: { value: number };
  readonly uTime: { value: number };
  readonly uEvolution: { value: number };
  readonly uMic: { value: number };
  readonly uPulse: { value: number };
  readonly uTempo: { value: number };
  readonly uEnergy: { value: number };
  readonly uPixelRatio: { value: number };
  readonly uSignalFit: { value: number };
  readonly uMotionScale: { value: number };
}

export class OrganismScene {
  readonly canvas: HTMLCanvasElement;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  private readonly organismRoot = new THREE.Group();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly particles: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly starField: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly coreFill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly coreWire: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly groundShadow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly shadowOpacityUniform = { value: 0.055 };
  private readonly rings: Array<THREE.LineLoop<THREE.BufferGeometry, THREE.LineBasicMaterial>> = [];
  private readonly uniforms: OrganismUniforms;
  private reducedMotion: boolean;
  private readonly onPulseCallback: (() => void) | undefined;
  private readonly pointerPositions = new Map<number, PointerPosition>();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  private resizeObserver: ResizeObserver | null = null;
  private usesWindowResize = false;
  private disposed = false;
  private word = '';
  private traits: LifeTraits | null = null;
  private evolution = 0;
  private evolutionTarget = 0;
  private micLevel = 0;
  private micTarget = 0;
  private pulseStrength = 0;
  private elapsed = 0;
  private yaw = 0;
  private yawTarget = 0;
  private pitch = -0.08;
  private pitchTarget = -0.08;
  private orbitDistance = 10.5;
  private orbitDistanceTarget = 10.5;
  private dragPointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private tapPointerId: number | null = null;
  private tapStartX = 0;
  private tapStartY = 0;
  private tapStartTime = 0;
  private tapMoved = false;
  private pinchStartSpan = 0;
  private pinchStartDistance = 10.5;
  private fullParticleCount = 1;
  private visibleParticleCount = 1;
  private qualityReductions = 0;
  private pixelRatio = 1;
  private frameTimeAverage = 1 / 60;
  private slowFrameDuration = 0;

  constructor(
    host: HTMLElement,
    options: { reducedMotion?: boolean; onPulse?: () => void } = {},
  ) {
    this.reducedMotion = options.reducedMotion
      ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.onPulseCallback = options.onPulse;
    this.uniforms = {
      uTime: { value: 0 },
      uEvolution: { value: 0 },
      uMic: { value: 0 },
      uPulse: { value: 0 },
      uTempo: { value: 1 },
      uEnergy: { value: 0.55 },
      uPixelRatio: { value: 1 },
      uSignalFit: { value: 1 },
      uMotionScale: { value: this.reducedMotion ? 0.14 : 1 },
    };

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !this.isLikelyMobile(),
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setClearColor(0xf2efe7, 0);

    this.canvas = this.renderer.domElement;
    this.canvas.className = 'organism-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute(
      'aria-label',
      '生命体の3D操作領域。ドラッグで回転、タップで共鳴。 Interactive 3D specimen.',
    );
    Object.assign(this.canvas.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      touchAction: 'none',
      cursor: 'grab',
      background: 'radial-gradient(circle at 50% 42%, rgba(255,255,252,0.98), rgba(242,239,231,0.96) 64%, rgba(229,225,215,0.98))',
    });
    host.append(this.canvas);

    this.camera.position.set(0, 0, this.orbitDistance);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.camera);
    this.scene.add(this.organismRoot);
    this.scene.add(new THREE.HemisphereLight(0xfffdf7, 0x71809b, 2.1));
    const keyLight = new THREE.DirectionalLight(0xfff4df, 3.4);
    keyLight.position.set(-4, 6, 8);
    this.scene.add(keyLight);

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.NormalBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: true,
    });
    this.materials.push(this.material);

    this.installEmptyParticleAttributes();
    this.geometries.push(this.geometry);
    this.particles = new THREE.Points(this.geometry, this.material);
    this.particles.frustumCulled = false;
    this.organismRoot.add(this.particles);

    this.starField = this.createStarField();
    this.scene.add(this.starField);

    this.groundShadow = this.createGroundShadow();
    this.scene.add(this.groundShadow);

    const core = this.createCore();
    this.coreFill = core.fill;
    this.coreWire = core.wire;
    this.organismRoot.add(this.coreFill, this.coreWire);
    this.createRings();

    this.addInteractionListeners();
    this.attachResizeHandling(host);
    this.resize();
    this.renderFrame();

    if ('fonts' in document) {
      void document.fonts.ready.then(() => {
        if (!this.disposed && this.traits !== null && this.word.length > 0) {
          this.rebuildOrganism(this.word, this.traits);
        }
      }).catch(() => undefined);
    }
  }

  generate(word: string, traits: LifeTraits): void {
    if (this.disposed) return;
    this.word = word.trim() || 'KOTODAMA';
    this.traits = traits;
    this.slowFrameDuration = 0;
    this.rebuildOrganism(this.word, traits);
    this.applyPalette(traits.colors);
    this.uniforms.uTempo.value = this.normalizedTempo(traits.tempo);
    this.uniforms.uEnergy.value = this.temperamentEnergy(traits.temperament);
    this.pulseStrength = Math.max(this.pulseStrength, 0.42);
    this.renderFrame();
  }

  setEvolution(value: number): void {
    this.evolutionTarget = THREE.MathUtils.clamp(value, 0, 1);
    if (this.reducedMotion) {
      this.evolution = this.evolutionTarget;
      this.uniforms.uEvolution.value = this.evolution;
      this.renderFrame();
    }
  }

  setMicLevel(value: number): void {
    this.micTarget = THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1);
  }

  setReducedMotion(value: boolean): void {
    if (this.disposed || this.reducedMotion === value) return;
    this.reducedMotion = value;
    this.uniforms.uMotionScale.value = value ? 0.14 : 1;
    if (value) this.evolution = this.evolutionTarget;
    const qualityScale = 0.82 ** this.qualityReductions * (value ? 0.8 : 1);
    this.visibleParticleCount = Math.max(2600, Math.floor(this.fullParticleCount * qualityScale));
    this.geometry.setDrawRange(0, Math.min(this.fullParticleCount, this.visibleParticleCount));
    this.resize();
  }

  pulse(): void {
    if (this.disposed) return;
    this.pulseStrength = 1;
    this.onPulseCallback?.();
  }

  update(dtSeconds: number): void {
    if (this.disposed) return;
    const dt = THREE.MathUtils.clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, 0.1);
    const motionDt = dt * (this.reducedMotion ? 0.18 : 1);
    this.elapsed += motionDt;

    const evolutionDamping = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 4.8);
    const interactionDamping = 1 - Math.exp(-dt * 9);
    this.evolution += (this.evolutionTarget - this.evolution) * evolutionDamping;
    this.micLevel += (this.micTarget - this.micLevel) * (1 - Math.exp(-dt * 13));
    this.pulseStrength *= Math.exp(-dt * 3.4);
    if (this.pulseStrength < 0.001) this.pulseStrength = 0;
    this.yaw += (this.yawTarget - this.yaw) * interactionDamping;
    this.pitch += (this.pitchTarget - this.pitch) * interactionDamping;
    this.orbitDistance += (this.orbitDistanceTarget - this.orbitDistance) * interactionDamping;

    this.uniforms.uTime.value = this.elapsed;
    this.uniforms.uEvolution.value = this.evolution;
    this.uniforms.uMic.value = this.micLevel;
    this.uniforms.uPulse.value = this.pulseStrength;

    const idleTurn = this.reducedMotion ? 0 : this.elapsed * 0.055;
    this.organismRoot.rotation.y = this.yaw + idleTurn;
    this.organismRoot.rotation.x = this.pitch + Math.sin(this.elapsed * 0.19) * 0.025;
    this.camera.position.z = this.orbitDistance;
    this.updateSignalFit();
    this.animateDecorations();
    this.starField.rotation.y = -this.elapsed * 0.006;
    this.starField.rotation.x = Math.sin(this.elapsed * 0.035) * 0.025;

    this.trackPerformance(dtSeconds);
    this.renderFrame();
  }

  resize(): void {
    if (this.disposed) return;
    const parent = this.canvas.parentElement;
    const bounds = parent?.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds?.width ?? this.canvas.clientWidth ?? 1));
    const height = Math.max(1, Math.round(bounds?.height ?? this.canvas.clientHeight ?? 1));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    const baseRatio = this.preferredPixelRatio();
    this.pixelRatio = Math.max(0.75, baseRatio * 0.84 ** this.qualityReductions);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height, false);
    this.uniforms.uPixelRatio.value = this.pixelRatio;
    this.updateSignalFit();
    this.renderFrame();
  }

  async captureBlob(): Promise<Blob | null> {
    if (this.disposed) return null;
    const clearColor = this.renderer.getClearColor(new THREE.Color()).clone();
    const clearAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0xf2efe7, 1);
    this.renderFrame();
    return await new Promise<Blob | null>((resolve) => {
      try {
        this.canvas.toBlob((blob) => {
          this.renderer.setClearColor(clearColor, clearAlpha);
          this.renderFrame();
          resolve(blob);
        }, 'image/png');
      } catch {
        this.renderer.setClearColor(clearColor, clearAlpha);
        this.renderFrame();
        resolve(null);
      }
    });
  }

  getState(): object {
    return {
      word: this.word,
      code: this.traits?.code ?? null,
      palette: this.traits?.paletteName ?? null,
      evolution: this.evolutionTarget,
      renderedEvolution: this.evolution,
      micLevel: this.micLevel,
      particleCount: this.visibleParticleCount,
      fullParticleCount: this.fullParticleCount,
      pixelRatio: this.pixelRatio,
      reducedMotion: this.reducedMotion,
      camera: {
        yaw: this.yawTarget,
        pitch: this.pitchTarget,
        distance: this.orbitDistanceTarget,
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeInteractionListeners();
    this.resizeObserver?.disconnect();
    if (this.usesWindowResize) window.removeEventListener('resize', this.handleWindowResize);
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    this.pointerPositions.clear();
  }

  private installEmptyParticleAttributes(): void {
    const vector = new Float32Array(3);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(vector, 3));
    this.geometry.setAttribute('aSignal', new THREE.BufferAttribute(vector.slice(), 3));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(vector.slice(), 3));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(vector.slice(), 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array([1, 1, 1]), 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array([1]), 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array([0]), 1));
    this.geometry.setDrawRange(0, 1);
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
  }

  private rebuildOrganism(word: string, traits: LifeTraits): void {
    const count = this.particleBudget();
    const data = this.createMorphData(word, traits, count);
    // Releasing the previous GPU attributes prevents repeated mutations from
    // accumulating orphaned WebGL buffers while keeping the Geometry object.
    this.geometry.dispose();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(data.life, 3));
    this.geometry.setAttribute('aSignal', new THREE.BufferAttribute(data.signal, 3));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(data.seed, 3));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(data.life, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(data.colors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(data.sizes, 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(data.phases, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
    this.fullParticleCount = count;
    this.visibleParticleCount = Math.max(
      2600,
      Math.floor(count * 0.82 ** this.qualityReductions),
    );
    this.geometry.setDrawRange(0, Math.min(count, this.visibleParticleCount));
  }

  private createMorphData(word: string, traits: LifeTraits, count: number): MorphData {
    const numericSeed = Number.isFinite(traits.seed) ? Math.trunc(traits.seed) : 0;
    const seedValue = (numericSeed ^ this.hashString(word) ^ this.hashString(traits.code)) >>> 0;
    const random = this.createRandom(seedValue);
    const signal = this.sampleWord(word, count, random);
    const seed = new Float32Array(count * 3);
    const life = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const palette = traits.colors.map((value, index) => this.safeColor(value, index)) as [
      THREE.Color,
      THREE.Color,
      THREE.Color,
    ];
    const symmetry = THREE.MathUtils.clamp(Math.round(traits.symmetry), 2, 12);
    const variant = Math.abs(Math.round(traits.particleVariant)) % 4;
    const energy = this.temperamentEnergy(traits.temperament);

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const seedY = 1 - 2 * ((index + 0.5) / count);
      const seedRing = Math.sqrt(Math.max(0, 1 - seedY * seedY));
      const seedAngle = index * GOLDEN_ANGLE + variant * 0.41;
      const seedRadius = 0.22 + Math.cbrt(random()) * 0.54;
      seed[offset] = Math.cos(seedAngle) * seedRing * seedRadius * 0.86;
      seed[offset + 1] = seedY * seedRadius * 1.16;
      seed[offset + 2] = Math.sin(seedAngle) * seedRing * seedRadius * 0.86;

      const region = random();
      let color: THREE.Color;
      if (region < 0.18) {
        const sphereY = random() * 2 - 1;
        const sphereAngle = random() * TAU;
        const sphereRing = Math.sqrt(Math.max(0, 1 - sphereY * sphereY));
        const radius = Math.cbrt(random()) * (0.58 + 0.12 * Math.sin(symmetry * sphereAngle));
        life[offset] = Math.cos(sphereAngle) * sphereRing * radius;
        life[offset + 1] = sphereY * radius * 1.22;
        life[offset + 2] = Math.sin(sphereAngle) * sphereRing * radius;
        color = palette[0].clone().lerp(palette[1], random() * 0.28);
        sizes[index] = 1.15 + random() * 1.25;
      } else if (region < 0.82) {
        const sphereY = random() * 2 - 1;
        const latitude = Math.asin(sphereY);
        let longitude = random() * TAU;
        const lobe = Math.pow(0.5 + 0.5 * Math.cos(symmetry * longitude + variant * 0.73), 1.35);
        const equator = Math.pow(Math.max(0, Math.cos(latitude)), 0.72);
        let radial = (0.72 + 1.26 * equator) * (0.76 + lobe * 0.32);
        let vertical = Math.sin(latitude) * (1.72 + energy * 0.34);
        longitude += Math.sin(latitude) * (variant + 1) * 0.16;

        if (variant === 1) {
          vertical = 0.44 + Math.sin(latitude) * 1.38;
          radial *= 0.92 + Math.max(0, -sphereY) * 0.16;
        } else if (variant === 2) {
          vertical *= 0.77;
        } else if (variant === 3) {
          vertical *= 1.16;
          radial *= 0.91 + 0.13 * Math.sin(latitude * 3 + longitude);
        }

        radial += (random() + random() - 1) * 0.13;
        let lifeX = Math.cos(longitude) * radial;
        let lifeZ = Math.sin(longitude) * radial;
        if (variant === 2) {
          lifeX *= 1.48;
          lifeZ *= 0.68;
        }
        life[offset] = lifeX;
        life[offset + 1] = vertical + (random() + random() - 1) * 0.1;
        life[offset + 2] = lifeZ;
        color = palette[1].clone().lerp(palette[2], 0.18 + equator * 0.62);
        sizes[index] = 0.72 + random() * 1.15;
      } else {
        const arm = Math.floor(random() * symmetry);
        const progress = Math.pow(random(), 0.7);
        const direction = arm % 2 === 0 ? 1 : -1;
        const baseAngle = arm * TAU / symmetry;
        const curl = baseAngle + direction * progress * (0.72 + variant * 0.31 + energy * 0.25);
        const tubeNoise = (random() + random() - 1) * (0.12 - progress * 0.045);
        const radial = 0.48 + progress * (1.42 + energy * 0.28) + tubeNoise;
        let vertical = 0.22 - progress * (2.18 + energy * 0.72);
        if (variant === 0) vertical = direction * (0.3 + progress * 1.86);
        if (variant === 2) vertical = (arm % 3 === 0 ? 1 : -1) * (0.2 + progress * 1.72);
        if (variant === 3) vertical += Math.sin(progress * Math.PI * 3 + arm) * 0.35;
        life[offset] = Math.cos(curl) * radial;
        life[offset + 1] = vertical + (random() + random() - 1) * 0.12;
        life[offset + 2] = Math.sin(curl) * radial;
        color = palette[2].clone().lerp(palette[0], (1 - progress) * 0.22);
        sizes[index] = 0.58 + random() * 1.05;
      }

      const shimmer = 0.8 + random() * 0.48;
      colors[offset] = color.r * shimmer;
      colors[offset + 1] = color.g * shimmer;
      colors[offset + 2] = color.b * shimmer;
      phases[index] = random() * TAU;
    }

    return { signal, seed, life, colors, sizes, phases };
  }

  private sampleWord(word: string, count: number, random: () => number): Float32Array {
    const output = new Float32Array(count * 3);
    const textCanvas = document.createElement('canvas');
    const width = 1152;
    const height = 384;
    textCanvas.width = width;
    textCanvas.height = height;
    const context = textCanvas.getContext('2d', { willReadFrequently: true });
    if (context === null) return this.fallbackSignal(output, count, random);

    const fontFamily = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", Meiryo, sans-serif';
    let fontSize = 264;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (let attempt = 0; attempt < 8; attempt += 1) {
      context.font = `900 ${fontSize}px ${fontFamily}`;
      const measuredWidth = context.measureText(word).width;
      if (measuredWidth <= width * 0.88 || measuredWidth <= 0) break;
      fontSize *= (width * 0.88) / measuredWidth;
    }

    context.clearRect(0, 0, width, height);
    context.lineJoin = 'round';
    context.lineWidth = Math.max(2, fontSize * 0.022);
    context.strokeStyle = 'rgba(255, 255, 255, 0.52)';
    context.fillStyle = '#ffffff';
    context.strokeText(word, width / 2, height / 2 + fontSize * 0.035);
    context.fillText(word, width / 2, height / 2 + fontSize * 0.035);

    const image = context.getImageData(0, 0, width, height).data;
    const candidates: number[] = [];
    for (let y = 1; y < height - 1; y += 2) {
      for (let x = 1; x < width - 1; x += 2) {
        const pixelIndex = y * width + x;
        const alpha = image[pixelIndex * 4 + 3] ?? 0;
        if (alpha > 42) candidates.push(pixelIndex);
      }
    }
    if (candidates.length === 0) return this.fallbackSignal(output, count, random);

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const candidateIndex = Math.floor(random() * candidates.length);
      const packed = candidates[candidateIndex] ?? Math.floor(height / 2) * width + Math.floor(width / 2);
      const x = packed % width;
      const y = Math.floor(packed / width);
      const jitterX = (random() + random() - 1) * 1.8;
      const jitterY = (random() + random() - 1) * 1.8;
      output[offset] = ((x + jitterX - width / 2) / (width / 2)) * 4.82;
      output[offset + 1] = -((y + jitterY - height / 2) / (height / 2)) * 1.67;
      output[offset + 2] = (random() + random() - 1) * 0.13;
    }
    return output;
  }

  private fallbackSignal(output: Float32Array, count: number, random: () => number): Float32Array {
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const progress = index / Math.max(1, count - 1);
      output[offset] = (progress - 0.5) * 7.8 + (random() - 0.5) * 0.08;
      output[offset + 1] = Math.sin(progress * Math.PI * 8) * 0.38 + (random() - 0.5) * 0.08;
      output[offset + 2] = (random() - 0.5) * 0.15;
    }
    return output;
  }

  private createStarField(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    const mobile = this.isLikelyMobile();
    const count = mobile ? 260 : 520;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const random = this.createRandom(0x51a7f00d);
    const cold = new THREE.Color('#243865');
    const warm = new THREE.Color('#a4435c');
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const directionY = random() * 2 - 1;
      const angle = random() * TAU;
      const directionRing = Math.sqrt(Math.max(0, 1 - directionY * directionY));
      const radius = 11 + random() * 17;
      positions[offset] = Math.cos(angle) * directionRing * radius;
      positions[offset + 1] = directionY * radius;
      positions[offset + 2] = Math.sin(angle) * directionRing * radius;
      const color = cold.clone().lerp(warm, random() * 0.42);
      const brightness = 0.35 + random() * 0.52;
      colors[offset] = color.r * brightness;
      colors[offset + 1] = color.g * brightness;
      colors[offset + 2] = color.b * brightness;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30);
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: mobile ? 0.026 : 0.032,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.34,
      blending: THREE.NormalBlending,
      depthWrite: false,
      toneMapped: true,
    });
    this.geometries.push(geometry);
    this.materials.push(material);
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return points;
  }

  private createCore(): {
    fill: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    wire: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  } {
    const geometry = new THREE.IcosahedronGeometry(0.56, 2);
    const fillMaterial = new THREE.MeshStandardMaterial({
      color: '#f8f0ff',
      roughness: 0.34,
      metalness: 0.06,
      transparent: true,
      opacity: 0.12,
      blending: THREE.NormalBlending,
      depthWrite: false,
      toneMapped: true,
    });
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: '#8ee8ff',
      transparent: true,
      opacity: 0.17,
      wireframe: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      toneMapped: true,
    });
    this.geometries.push(geometry);
    this.materials.push(fillMaterial, wireMaterial);
    return {
      fill: new THREE.Mesh(geometry, fillMaterial),
      wire: new THREE.Mesh(geometry, wireMaterial),
    };
  }

  private createGroundShadow(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    const geometry = new THREE.PlaneGeometry(5.8, 2.25);
    const material = new THREE.ShaderMaterial({
      uniforms: { uOpacity: this.shadowOpacityUniform },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          vec2 centered = (vUv - vec2(0.5)) * vec2(1.0, 2.15);
          float softness = exp(-dot(centered, centered) * 5.2);
          gl_FragColor = vec4(vec3(0.10, 0.12, 0.16), softness * uOpacity);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    const shadow = new THREE.Mesh(geometry, material);
    shadow.position.set(0, -2.05, -2.6);
    shadow.renderOrder = -1;
    this.geometries.push(geometry);
    this.materials.push(material);
    return shadow;
  }

  private createRings(): void {
    const initialColors = ['#7adfff', '#ba8cff', '#ffd48a'];
    for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
      const points: THREE.Vector3[] = [];
      const radius = 1.9 + ringIndex * 0.62;
      for (let segment = 0; segment < 144; segment += 1) {
        const angle = segment / 144 * TAU;
        const ripple = 1 + Math.sin(angle * (5 + ringIndex * 2)) * 0.018;
        points.push(new THREE.Vector3(
          Math.cos(angle) * radius * ripple,
          Math.sin(angle) * radius * ripple,
          0,
        ));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: initialColors[ringIndex] ?? '#ffffff',
        transparent: true,
        opacity: 0.1,
        blending: THREE.NormalBlending,
        depthWrite: false,
        toneMapped: true,
      });
      const ring = new THREE.LineLoop(geometry, material);
      ring.rotation.x = 0.62 + ringIndex * 0.31;
      ring.rotation.y = -0.38 + ringIndex * 0.44;
      this.geometries.push(geometry);
      this.materials.push(material);
      this.rings.push(ring);
      this.organismRoot.add(ring);
    }
  }

  private animateDecorations(): void {
    const visibleLife = THREE.MathUtils.smoothstep(this.evolution, 0.22, 1);
    const pulseScale = 1 + this.pulseStrength * 0.25 + this.micLevel * 0.12;
    const coreScale = (0.72 + visibleLife * 0.36) * pulseScale;
    this.coreFill.scale.setScalar(coreScale);
    this.coreWire.scale.setScalar(coreScale * (1.05 + Math.sin(this.elapsed * 1.4) * 0.035));
    this.coreFill.rotation.y = this.elapsed * 0.18;
    this.coreWire.rotation.x = this.elapsed * -0.13;
    this.coreWire.rotation.z = this.elapsed * 0.09;
    this.coreFill.material.opacity = 0.025 + visibleLife * 0.075 + this.micLevel * 0.035;
    this.coreWire.material.opacity = 0.045 + visibleLife * 0.12 + this.pulseStrength * 0.08;
    this.shadowOpacityUniform.value = 0.025 + visibleLife * 0.055 + this.micLevel * 0.012;
    this.groundShadow.scale.set(
      0.88 + visibleLife * 0.12 + this.pulseStrength * 0.045,
      0.94 + this.pulseStrength * 0.035,
      1,
    );

    this.rings.forEach((ring, index) => {
      const direction = index % 2 === 0 ? 1 : -1;
      const speed = this.reducedMotion ? 0.0048 : 0.027;
      ring.rotation.z = direction * this.elapsed * speed * (index + 1);
      ring.material.opacity = 0.025 + visibleLife * (0.045 + index * 0.018) + this.pulseStrength * 0.04;
      ring.scale.setScalar(0.84 + visibleLife * 0.16 + this.pulseStrength * (0.03 + index * 0.012));
    });
  }

  private applyPalette(colors: [string, string, string]): void {
    const palette = colors.map((value, index) => this.safeColor(value, index)) as [
      THREE.Color,
      THREE.Color,
      THREE.Color,
    ];
    this.coreFill.material.color.copy(palette[0]);
    this.coreWire.material.color.copy(palette[1]);
    this.rings.forEach((ring, index) => {
      ring.material.color.copy(palette[index] ?? palette[0]);
    });
  }

  private addInteractionListeners(): void {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.addEventListener('lostpointercapture', this.handlePointerCancel);
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    this.canvas.addEventListener('keydown', this.handleKeyDown);
  }

  private removeInteractionListeners(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.removeEventListener('lostpointercapture', this.handlePointerCancel);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('keydown', this.handleKeyDown);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture(event.pointerId);
    this.pointerPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.canvas.style.cursor = 'grabbing';

    if (this.pointerPositions.size === 1) {
      this.dragPointerId = event.pointerId;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.tapPointerId = event.pointerId;
      this.tapStartX = event.clientX;
      this.tapStartY = event.clientY;
      this.tapStartTime = performance.now();
      this.tapMoved = false;
    } else {
      this.tapMoved = true;
      const span = this.currentPointerSpan();
      if (span !== null) {
        this.pinchStartSpan = span;
        this.pinchStartDistance = this.orbitDistanceTarget;
      }
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.pointerPositions.has(event.pointerId)) return;
    event.preventDefault();
    this.pointerPositions.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointerPositions.size >= 2) {
      this.tapMoved = true;
      const span = this.currentPointerSpan();
      if (span !== null && this.pinchStartSpan > 0) {
        this.orbitDistanceTarget = THREE.MathUtils.clamp(
          this.pinchStartDistance * this.pinchStartSpan / span,
          6.4,
          15.5,
        );
      }
      return;
    }

    if (event.pointerId !== this.dragPointerId) return;
    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;
    this.yawTarget += deltaX * 0.0062;
    this.pitchTarget = THREE.MathUtils.clamp(this.pitchTarget + deltaY * 0.0052, -0.92, 0.92);
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    const tapDeltaX = event.clientX - this.tapStartX;
    const tapDeltaY = event.clientY - this.tapStartY;
    if (tapDeltaX * tapDeltaX + tapDeltaY * tapDeltaY > 49) this.tapMoved = true;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const wasSinglePointer = this.pointerPositions.size === 1;
    const shouldPulse = wasSinglePointer
      && event.pointerId === this.tapPointerId
      && !this.tapMoved
      && performance.now() - this.tapStartTime < 700;
    this.pointerPositions.delete(event.pointerId);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);

    this.promoteRemainingPointer();
    if (shouldPulse) this.pulse();
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    this.pointerPositions.delete(event.pointerId);
    this.tapMoved = true;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.promoteRemainingPointer();
  };

  private promoteRemainingPointer(): void {
    const remaining = this.pointerPositions.entries().next();
    if (remaining.done) {
      this.dragPointerId = null;
      this.tapPointerId = null;
      this.canvas.style.cursor = 'grab';
      return;
    }
    const [pointerId, position] = remaining.value;
    this.dragPointerId = pointerId;
    this.lastPointerX = position.x;
    this.lastPointerY = position.y;
    this.tapPointerId = null;
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.orbitDistanceTarget = THREE.MathUtils.clamp(
      this.orbitDistanceTarget * Math.exp(event.deltaY * 0.00085),
      6.4,
      15.5,
    );
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    this.pulse();
  };

  private readonly handleWindowResize = (): void => {
    this.resize();
  };

  private currentPointerSpan(): number | null {
    const values = [...this.pointerPositions.values()];
    const first = values[0];
    const second = values[1];
    if (first === undefined || second === undefined) return null;
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  private attachResizeHandling(host: HTMLElement): void {
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(host);
    } else {
      this.usesWindowResize = true;
      window.addEventListener('resize', this.handleWindowResize);
    }
  }

  private updateSignalFit(): void {
    const halfVerticalView = Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * this.orbitDistance;
    const halfHorizontalView = halfVerticalView * this.camera.aspect;
    this.uniforms.uSignalFit.value = THREE.MathUtils.clamp(halfHorizontalView * 0.87 / 4.82, 0.34, 1);
  }

  private trackPerformance(dtSeconds: number): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0.009 || dtSeconds > 0.08) return;
    this.frameTimeAverage += (dtSeconds - this.frameTimeAverage) * 0.04;
    if (this.frameTimeAverage > 1 / 34) {
      this.slowFrameDuration += dtSeconds;
    } else {
      this.slowFrameDuration = Math.max(0, this.slowFrameDuration - dtSeconds * 0.6);
    }
    if (this.slowFrameDuration < 2.5 || this.qualityReductions >= 2) return;

    this.qualityReductions += 1;
    this.slowFrameDuration = 0;
    this.visibleParticleCount = Math.max(2600, Math.floor(this.fullParticleCount * 0.82 ** this.qualityReductions));
    this.geometry.setDrawRange(0, Math.min(this.fullParticleCount, this.visibleParticleCount));
    this.resize();
  }

  private particleBudget(): number {
    const bounds = this.canvas.getBoundingClientRect();
    const area = Math.max(320 * 480, bounds.width * bounds.height);
    const areaScale = THREE.MathUtils.clamp(Math.sqrt(area / (1280 * 720)), 0.72, 1.2);
    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    let base = this.isLikelyMobile() ? 6500 : 11200;
    if (cores <= 4 || memory <= 4) base *= 0.76;
    if (this.reducedMotion) base *= 0.8;
    if (this.renderer.capabilities.isWebGL2 && cores >= 8 && memory >= 8) base *= 1.12;
    return Math.round(THREE.MathUtils.clamp(base * areaScale, 3600, 13800));
  }

  private preferredPixelRatio(): number {
    const deviceRatio = window.devicePixelRatio || 1;
    const cap = this.reducedMotion ? 1.15 : this.isLikelyMobile() ? 1.35 : 1.75;
    return Math.min(deviceRatio, cap);
  }

  private isLikelyMobile(): boolean {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 720;
  }

  private normalizedTempo(tempo: number): number {
    if (!Number.isFinite(tempo)) return 1;
    return THREE.MathUtils.clamp(tempo > 10 ? tempo / 60 : tempo, 0.38, 2.8);
  }

  private temperamentEnergy(temperament: string): number {
    const value = temperament.toLocaleLowerCase();
    if (/wild|bold|fierce|electric|active|energetic|烈|動|奔放|情熱|活発/u.test(value)) return 1;
    if (/calm|gentle|quiet|still|serene|穏|静|優|繊細/u.test(value)) return 0.32;
    if (/curious|playful|bright|好奇|遊|陽/u.test(value)) return 0.76;
    return 0.56;
  }

  private safeColor(value: string, index: number): THREE.Color {
    const fallbacks = [0x8df5ff, 0xb58cff, 0xffc47c];
    const color = new THREE.Color(fallbacks[index] ?? 0xffffff);
    try {
      color.set(value);
    } catch {
      // Retain a visible palette even when externally supplied data is malformed.
    }
    return color;
  }

  private hashString(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  private createRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  private renderFrame(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
