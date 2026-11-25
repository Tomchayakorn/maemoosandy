/**
 * The home page's 3D backdrop: the shrine of Mae Mu Sandy, built entirely from code (no model, image or font files):
 * a floating glass crystal ball on a pedestal, spinning astral rings with the twelve zodiac signs, flickering candles, pillars with an arch
 * and a crescent moon, and a magic-circle floor, in deep purple, gold, neon pink and sky blue.
 *
 * Performance budget: 5 lights, no shadows, no post-processing, repeated parts are instanced, every animation is a function of the scene time.
 * Only this module imports three.js; MysticScene loads it lazily.
 */
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  EdgesGeometry,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LatheGeometry,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { FOV, heightAtScreen } from "./camera";

const NIGHT = 0x120726;
const PURPLE = 0x4a2388;
const GOLD = 0xd4af37;
const GOLD_LIGHT = 0xf3d98b;
const PINK = 0xff4fb8;
const SKY = 0x38d6ff;
const FLAME = 0xffa23d;

const ZODIAC = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

/** Raises the crystal ball and its rings to a point of the screen (the logo on phones); the altar, candles and pillars stay put. */
export type Lift = {
  /** Where the ball's centre should appear: 1 = top edge, 0 = middle, −1 = bottom. */
  ndcY: number;
  /** 0 = in its place over the altar, 1 = fully raised (tall screens). */
  amount: number;
};

/** Height of the ball when it floats over the altar. */
const ALTAR_HEIGHT = 2.1;

export type MysticSceneHandle = {
  setSize(width: number, height: number, pixelRatio: number): void;
  /** Draw the scene at time `t` (seconds) seen from `eye`, looking at height `lookY` above the centre. */
  render(t: number, eye: { x: number; y: number; z: number }, lookY: number, lift?: Lift): void;
  stats(): { calls: number; triangles: number; pixelRatio: number };
  dispose(): void;
};

/** Deterministic pseudo-random numbers, so the star field looks the same on every visit. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d");
  if (c) draw(c, size);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Throws when the browser cannot create a WebGL context (the caller then keeps the still backdrop). */
export function createMysticScene(canvas: HTMLCanvasElement): MysticSceneHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new Scene();
  const fog = new Fog(NIGHT, 11, 24); // near / far follow the camera distance in render()
  scene.fog = fog;
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 60);
  const lookAt = new Vector3();
  const textures: Texture[] = [];
  const animate: ((t: number) => void)[] = [];
  const dummy = new Object3D();

  /* ───────── textures drawn in code ───────── */
  const glow = canvasTexture(128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
  textures.push(glow);

  const glowSprite = (color: number, scale: number, opacity: number) => {
    const sprite = new Sprite(new SpriteMaterial({ map: glow, color, opacity, transparent: true, depthWrite: false, blending: AdditiveBlending }));
    sprite.scale.setScalar(scale);
    return sprite;
  };

  /* ───────── shared materials ───────── */
  const gold = new MeshStandardMaterial({ color: GOLD, metalness: 0.5, roughness: 0.42, emissive: 0x4a3406, emissiveIntensity: 0.75 });
  const purple = new MeshStandardMaterial({ color: PURPLE, metalness: 0.22, roughness: 0.62, emissive: 0x1d0a3d });
  const neonPink = new MeshBasicMaterial({ color: PINK });
  const neonSky = new MeshBasicMaterial({ color: SKY });

  /* ───────── lights (5) ───────── */
  scene.add(new HemisphereLight(0xb39cff, 0x1c0c33, 1.55));
  const key = new DirectionalLight(0xffe6c4, 1.05);
  key.position.set(3, 6, 5);
  scene.add(key);
  const ballLight = new PointLight(PINK, 11, 11, 2);
  const candleLights = [-1, 1].map((side) => {
    const l = new PointLight(FLAME, 7.5, 10, 2);
    l.position.set(side * 3.1, 1.5, 0.8);
    scene.add(l);
    return l;
  });
  scene.add(ballLight);

  /* ───────── floor and magic circle ───────── */
  const floor = new Mesh(new CylinderGeometry(5.6, 5.9, 0.24, 96), new MeshStandardMaterial({ color: 0x24104a, metalness: 0.35, roughness: 0.6 }));
  floor.position.y = -0.12;
  scene.add(floor);
  const flatRing = (radius: number, width: number, color: number, opacity: number) => {
    const m = new Mesh(new RingGeometry(radius, radius + width, 160), new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.012;
    scene.add(m);
    return m;
  };
  flatRing(5.5, 0.07, GOLD, 0.95);
  const innerPink = flatRing(2.35, 0.035, PINK, 0.9);
  flatRing(3.35, 0.02, GOLD_LIGHT, 0.6);
  const outerSky = flatRing(4.55, 0.035, SKY, 0.7);

  const runes = new InstancedMesh(new BoxGeometry(0.07, 0.01, 0.34), new MeshBasicMaterial({ color: GOLD_LIGHT }), 24);
  const runeRing = new Group();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    dummy.position.set(Math.sin(a) * 3.95, 0.014, Math.cos(a) * 3.95);
    dummy.rotation.set(0, a, 0);
    dummy.scale.set(1, 1, i % 2 ? 0.55 : 1);
    dummy.updateMatrix();
    runes.setMatrixAt(i, dummy.matrix);
  }
  runeRing.add(runes);
  scene.add(runeRing);

  const star = new Group(); // a six-pointed star of two triangles
  const starMaterial = new LineBasicMaterial({ color: GOLD_LIGHT, transparent: true, opacity: 0.8 });
  for (const offset of [0, Math.PI / 3]) {
    const points = [0, 1, 2].map((i) => {
      const a = offset + (i / 3) * Math.PI * 2;
      return new Vector3(Math.sin(a) * 2.34, 0.02, Math.cos(a) * 2.34);
    });
    star.add(new LineLoop(new BufferGeometry().setFromPoints(points), starMaterial));
  }
  scene.add(star);
  animate.push((t) => {
    star.rotation.y = t * 0.12;
    runeRing.rotation.y = -t * 0.07;
    innerPink.material.opacity = 0.7 + Math.sin(t * 1.4) * 0.25;
    outerSky.material.opacity = 0.55 + Math.sin(t * 1.1 + 2) * 0.25;
  });

  /* ───────── pedestal ───────── */
  const tier = (top: number, bottom: number, h: number, y: number, material: Material) => {
    const m = new Mesh(new CylinderGeometry(top, bottom, h, 56), material);
    m.position.y = y;
    scene.add(m);
  };
  tier(0.98, 1.3, 0.28, 0.14, purple);
  tier(0.5, 0.78, 0.46, 0.5, gold);
  tier(0.86, 0.5, 0.2, 0.83, purple);
  const crown = new Mesh(new TorusGeometry(0.84, 0.05, 16, 96), gold);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 0.95;
  scene.add(crown);

  /* ───────── crystal ball ───────── */
  const orb = new Group();
  const glass = new MeshStandardMaterial({
    color: 0xb9e4ff,
    metalness: 0.15,
    roughness: 0.18,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    emissive: PINK,
    emissiveIntensity: 0.5,
  });
  const ball = new Mesh(new SphereGeometry(0.93, 48, 32), glass);
  const latticeSource = new IcosahedronGeometry(0.945, 1);
  const facets = new LineSegments(new EdgesGeometry(latticeSource, 1), new LineBasicMaterial({ color: GOLD_LIGHT, transparent: true, opacity: 0.28 }));
  latticeSource.dispose();
  const core = new Mesh(new SphereGeometry(0.26, 32, 20), new MeshBasicMaterial({ color: 0xffa6dd, transparent: true, opacity: 0.92 }));
  const coreGlow = glowSprite(0xffd0ee, 1.35, 0.7);
  // two fine hoops turning inside the glass
  const cage = new Group();
  const hoopGeometry = new TorusGeometry(0.56, 0.009, 8, 96);
  const hoopMaterial = new MeshBasicMaterial({ color: SKY, transparent: true, opacity: 0.6, depthWrite: false });
  const hoops = [new Mesh(hoopGeometry, hoopMaterial), new Mesh(hoopGeometry, hoopMaterial)];
  hoops[1].rotation.x = Math.PI / 2;
  cage.add(...hoops);
  const halo = glowSprite(PINK, 4, 0.65);
  orb.add(halo, coreGlow, core, cage, ball, facets);
  scene.add(orb);
  const pink = new Color(PINK);
  const sky = new Color(SKY);
  /** Resting height of the ball and how far it is raised, set before each frame. */
  let ballHome = ALTAR_HEIGHT;
  let raised = 0;
  /** Slow double-sine float, shared (with a small delay) by the rings so they trail the ball. */
  const float = (t: number) => Math.sin(t * 0.85) * 0.11 + Math.sin(t * 0.41 + 1) * 0.035;
  const floatY = (t: number) => ballHome + float(t);
  animate.push((t) => {
    const y = floatY(t);
    orb.position.y = y;
    orb.scale.setScalar(1 + raised * 0.35); // a little larger when raised, so it glows round the logo
    ball.rotation.y = facets.rotation.y = t * 0.2;
    ball.rotation.x = facets.rotation.x = Math.sin(t * 0.23) * 0.2;
    cage.rotation.set(Math.sin(t * 0.27) * 0.9 + t * 0.12, t * 0.3, Math.sin(t * 0.19) * 0.5);
    const breath = 1 + Math.sin(t * 1.35) * 0.07;
    core.scale.setScalar(breath);
    coreGlow.scale.setScalar(1.35 * breath);
    const mix = 0.5 + Math.sin(t * 0.38) * 0.5;
    glass.emissive.copy(pink).lerp(sky, mix);
    halo.material.color.copy(glass.emissive);
    halo.material.opacity = (0.55 + Math.sin(t * 1.15) * 0.09) * (1 - raised * 0.4); // softer next to the title
    ballLight.color.copy(glass.emissive);
    ballLight.position.set(0, ALTAR_HEIGHT + float(t), 0.3); // the light stays over the altar, so the room is lit as before
  });

  /* ───────── astral rings ───────── */
  const orbitRing = (radius: number, tube: number, material: Material, tilt: [number, number, number], speed: number, beads: number, grow = 0) => {
    const tilted = new Group();
    tilted.rotation.set(...tilt);
    const spin = new Group(); // spins inside its own tilted plane
    const torus = new Mesh(new TorusGeometry(radius, tube, 12, 180), material);
    torus.rotation.x = Math.PI / 2;
    spin.add(torus);
    const beadGeometry = new SphereGeometry(0.07, 20, 14);
    for (let i = 0; i < beads; i++) {
      const a = (i / beads) * Math.PI * 2;
      const bead = new Mesh(beadGeometry, material);
      bead.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      spin.add(bead);
    }
    tilted.add(spin);
    scene.add(tilted);
    animate.push((t) => {
      spin.rotation.y = t * speed;
      tilted.position.y = floatY(t - 0.55);
      tilted.scale.setScalar(1 + raised * grow);
      // a slow two-axis wobble, like a gyroscope settling
      tilted.rotation.x = tilt[0] + Math.sin(t * 0.21 + radius * 2) * 0.07;
      tilted.rotation.z = tilt[2] + Math.sin(t * 0.17 + radius) * 0.1;
    });
    return spin;
  };
  orbitRing(1.42, 0.022, gold, [0.45, 0, 0.35], 0.6, 3, 0.18);
  orbitRing(1.8, 0.012, neonSky, [-0.85, 0, -0.3], -0.45, 2, 0.15);
  const zodiacSpin = orbitRing(2.55, 0.013, neonPink, [0.2, 0, -0.1], 0.17, 0);

  ZODIAC.forEach((sign, i) => {
    const color = i % 3 === 0 ? "#ff8fd2" : i % 3 === 1 ? "#f3d98b" : "#8ae9ff";
    const tex = canvasTexture(128, (c, s) => {
      c.font = `${s * 0.68}px "Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols", serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.shadowColor = color;
      c.shadowBlur = s * 0.14;
      c.fillStyle = color;
      // U+FE0E asks for the plain text glyph instead of the colour emoji
      c.fillText(`${sign}︎`, s / 2, s / 2 + s * 0.03);
      c.fillText(`${sign}︎`, s / 2, s / 2 + s * 0.03);
    });
    textures.push(tex);
    const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const a = (i / ZODIAC.length) * Math.PI * 2;
    sprite.position.set(Math.cos(a) * 2.55, 0.02, Math.sin(a) * 2.55);
    sprite.scale.setScalar(0.52);
    zodiacSpin.add(sprite);
  });

  /* ───────── stars ───────── */
  const random = seeded(90210);
  const dust = (count: number, size: number, place: (i: number) => [number, number, number]) => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [new Color(GOLD_LIGHT), new Color(SKY), new Color(PINK), new Color(0xffffff)];
    for (let i = 0; i < count; i++) {
      positions.set(place(i), i * 3);
      const c = palette[Math.floor(random() * palette.length)];
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("color", new BufferAttribute(colors, 3));
    const points = new Points(
      geometry,
      new PointsMaterial({ size, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false }),
    );
    scene.add(points);
    return points;
  };
  const sky3d = dust(220, 0.17, () => {
    const a = random() * Math.PI * 2;
    const r = 7 + random() * 6;
    return [Math.cos(a) * r, 0.5 + random() * 8, Math.sin(a) * r];
  });
  const starRing = dust(90, 0.12, (i) => {
    const a = (i / 90) * Math.PI * 2;
    const r = 3.25 + (random() - 0.5) * 0.35;
    return [Math.cos(a) * r, (random() - 0.5) * 0.22, Math.sin(a) * r];
  });
  starRing.rotation.order = "ZXY";
  const motes = dust(46, 0.1, () => {
    const a = random() * Math.PI * 2;
    const r = 0.9 + random() * 2.4;
    return [Math.cos(a) * r, random() * 3.6, Math.sin(a) * r];
  });
  animate.push((t) => {
    sky3d.rotation.y = t * 0.018;
    starRing.position.y = floatY(t - 0.9);
    starRing.rotation.set(-0.18, -t * 0.24, 0.28);
    motes.rotation.y = t * 0.09;
    motes.position.y = Math.sin(t * 0.6) * 0.18;
    (sky3d.material as PointsMaterial).opacity = 0.8 + Math.sin(t * 0.9) * 0.2;
  });

  /* ───────── candles ───────── */
  const CANDLES = 8;
  const wax = new InstancedMesh(
    new CylinderGeometry(0.13, 0.16, 1, 28),
    new MeshStandardMaterial({ color: 0xf1dcff, roughness: 0.78, emissive: 0x3d1d55 }),
    CANDLES,
  );
  const holders = new InstancedMesh(new CylinderGeometry(0.25, 0.3, 0.1, 40), gold, CANDLES);
  // a teardrop turned on a lathe: round at the wick, drawing out to a soft tip
  const flameGeometry = new LatheGeometry(
    Array.from({ length: 17 }, (_, k) => {
      const u = k / 16;
      return new Vector2(0.082 * Math.sin(Math.PI * Math.pow(u, 0.72)) * (1 - u * 0.25), (u - 0.36) * 0.34);
    }),
    24,
  );
  const flameOuter = new MeshBasicMaterial({ color: FLAME, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending });
  const flameInner = new MeshBasicMaterial({ color: 0xfff1c4 });
  for (let i = 0; i < CANDLES; i++) {
    // spread round the circle, starting half a step off the front so none stands right before the ball
    const a = ((i + 0.5) / CANDLES) * Math.PI * 2;
    const x = Math.sin(a) * 3.75;
    const z = Math.cos(a) * 3.75;
    const h = 0.55 + ((i * 5) % 4) * 0.15;
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(x, h / 2 + 0.08, z);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    wax.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 0.05, z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    holders.setMatrixAt(i, dummy.matrix);

    const flame = new Group();
    flame.position.set(x, h + 0.2, z);
    const outer = new Mesh(flameGeometry, flameOuter);
    const inner = new Mesh(flameGeometry, flameInner);
    inner.position.y = -0.02;
    const light = glowSprite(FLAME, 1, 0.6);
    flame.add(outer, inner, light);
    scene.add(flame);
    const phase = i * 1.9;
    animate.push((t) => {
      // three slow waves that never line up: alive, but without the jitter
      const f = 1 + Math.sin(t * 4.1 + phase) * 0.055 + Math.sin(t * 6.7 + phase * 2.3) * 0.03 + Math.sin(t * 2.2 + phase * 0.7) * 0.035;
      outer.scale.set(2 - f, f * f, 2 - f);
      inner.scale.set(0.52 * (2 - f), 0.52 * f, 0.52 * (2 - f));
      flame.rotation.z = Math.sin(t * 1.9 + phase) * 0.07 + Math.sin(t * 3.4 + phase * 1.7) * 0.03;
      light.material.opacity = 0.52 + (f - 1) * 0.8;
      light.scale.setScalar(1 + (f - 1) * 1.2);
    });
  }
  scene.add(wax, holders);
  animate.push((t) => {
    candleLights.forEach((l, i) => {
      l.intensity = 7.5 + Math.sin(t * 3.1 + i * 2) * 0.45 + Math.sin(t * 5.3 + i * 5) * 0.25;
    });
  });

  /* ───────── pillars, arch and crescent ───────── */
  const PILLARS: [number, number, number][] = [
    // x, z, height
    [-2.7, -3.9, 2.9],
    [2.7, -3.9, 2.9],
    [-4.7, -1.7, 2.2],
    [4.7, -1.7, 2.2],
  ];
  const shafts = new InstancedMesh(new CylinderGeometry(0.2, 0.25, 1, 32), purple, PILLARS.length);
  const blocks = new InstancedMesh(new CylinderGeometry(0.38, 0.38, 0.2, 40), gold, PILLARS.length * 2);
  const bands = new InstancedMesh(new TorusGeometry(0.235, 0.022, 12, 56), neonSky, PILLARS.length * 2);
  PILLARS.forEach(([x, z, h], i) => {
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(x, h / 2, z);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    shafts.setMatrixAt(i, dummy.matrix);
    [0.1, h + 0.08].forEach((y, k) => {
      dummy.position.set(x, y, z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      blocks.setMatrixAt(i * 2 + k, dummy.matrix);
    });
    [h * 0.28, h * 0.82].forEach((y, k) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      bands.setMatrixAt(i * 2 + k, dummy.matrix);
      dummy.rotation.set(0, 0, 0);
    });
  });
  scene.add(shafts, blocks, bands);

  const arch = (radius: number, tube: number, material: Material) => {
    const m = new Mesh(new TorusGeometry(radius, tube, 20, 140, Math.PI), material);
    m.position.set(0, 3.06, -3.9);
    scene.add(m);
  };
  arch(2.7, 0.15, purple);
  arch(2.46, 0.035, gold);
  arch(2.96, 0.028, neonPink);

  // jewels floating over the two side pillars
  const jewelGeometry = new SphereGeometry(0.2, 28, 18);
  [PILLARS[2], PILLARS[3]].forEach(([x, z, h], i) => {
    const color = i ? SKY : PINK;
    const jewel = new Group();
    jewel.add(new Mesh(jewelGeometry, new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.65, roughness: 0.35 })), glowSprite(color, 1.3, 0.5));
    jewel.position.set(x, h + 0.65, z);
    scene.add(jewel);
    animate.push((t) => {
      jewel.position.y = h + 0.65 + Math.sin(t * 0.95 + i * 2.5) * 0.1;
    });
  });

  const moonShape = new Shape();
  moonShape.absarc(0, 0, 0.62, Math.PI * 0.42, Math.PI * 1.58, false);
  moonShape.quadraticCurveTo(-0.62, 0, Math.cos(Math.PI * 0.42) * 0.62, Math.sin(Math.PI * 0.42) * 0.62);
  const moon = new Group();
  const moonMesh = new Mesh(new ShapeGeometry(moonShape, 72), new MeshBasicMaterial({ color: GOLD_LIGHT, side: 2 }));
  const moonStar = new Mesh(new OctahedronGeometry(0.17), new MeshBasicMaterial({ color: GOLD_LIGHT }));
  moonStar.position.set(0.22, 0.02, 0);
  moon.add(glowSprite(GOLD, 2.4, 0.42), moonMesh, moonStar);
  moon.position.set(0, 4.55, -4);
  scene.add(moon);
  animate.push((t) => {
    moon.position.y = 4.55 + Math.sin(t * 0.7) * 0.08;
    moonStar.rotation.y = t * 1.2;
    moonStar.scale.setScalar(0.94 + Math.sin(t * 1.5) * 0.12);
  });

  let ratio = 1;
  return {
    setSize(width, height, pixelRatio) {
      ratio = pixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    },
    render(t, eye, lookY, lift) {
      raised = lift?.amount ?? 0;
      ballHome = raised ? ALTAR_HEIGHT + (heightAtScreen(eye, lookY, lift!.ndcY) - ALTAR_HEIGHT) * raised : ALTAR_HEIGHT;
      for (const step of animate) step(t);
      camera.position.set(eye.x, eye.y, eye.z);
      camera.lookAt(lookAt.set(0, lookY, 0));
      const distance = camera.position.distanceTo(lookAt);
      fog.near = distance + 0.5;
      fog.far = distance + 14;
      renderer.render(scene, camera);
    },
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: ratio }),
    dispose() {
      scene.traverse((object) => {
        const o = object as Partial<Mesh>;
        o.geometry?.dispose();
        const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of materials) m.dispose();
        if (object instanceof InstancedMesh) object.dispose();
      });
      for (const t of textures) t.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
