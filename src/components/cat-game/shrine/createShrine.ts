/**
 * The lucky shrine behind น้องเหมียว 9 ชีวิต, built entirely from code (no model, image or font files): a minimal violet-and-gold gate with an
 * upswept beam, two floating paper lanterns, four temple bells, soft light behind the board, waves of light and rising motes. Decorative only.
 *
 * One world unit = one CSS pixel on the z = 0 plane. Budget: 3 lights, no shadows, shared geometry. Only this module imports three.js;
 * ShrineBackdrop loads it lazily.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  LatheGeometry,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { layout, swing } from "./mood";

const GOLD = 0xd4af37;
const GOLD_LIGHT = 0xf3d98b;
const ANTIQUE_GOLD = 0xa87c1f;
const VIOLET = 0x8b5cf6;

export type ShrineFrame = {
  time: number;
  glow: number;
  wave: number;
  /** Seconds since the bells were last struck (Infinity if never) and how hard. */
  age: number;
  strength: number;
};

export type ShrineHandle = {
  /** Canvas size and the board's position inside it, CSS pixels. */
  setSize(width: number, height: number, board: { top: number; height: number }, pixelRatio: number): void;
  render(frame: ShrineFrame): void;
  stats(): { calls: number; triangles: number; pixelRatio: number };
  dispose(): void;
};

/** Throws when the browser cannot create a WebGL context (the page then simply has no shrine). */
export function createShrine(canvas: HTMLCanvasElement): ShrineHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 10, 8000);

  const dotCanvas = document.createElement("canvas");
  dotCanvas.width = dotCanvas.height = 128;
  const c = dotCanvas.getContext("2d");
  if (c) {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [stop, alpha] of [[0, 1], [0.22, 0.65], [0.5, 0.24], [0.75, 0.06], [1, 0]]) g.addColorStop(stop, `rgba(255,255,255,${alpha})`);
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  }
  const dot = new CanvasTexture(dotCanvas);
  dot.colorSpace = SRGBColorSpace;

  /* ───────── lights (3) ───────── */
  scene.add(new HemisphereLight(0xe5d9ff, 0x1a0b30, 1.5));
  const key = new DirectionalLight(0xffe6b8, 1.5);
  key.position.set(-180, 260, 420);
  const warm = new PointLight(0xffb45a, 1, 0, 0);
  scene.add(key, warm);

  /* ───────── built (and rebuilt) to the page's measurements ───────── */
  const world = new Group();
  scene.add(world);
  const animate: ((f: ShrineFrame) => void)[] = [];
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const keep = <G extends BufferGeometry>(g: G) => (geometries.push(g), g);
  const own = <M extends Material>(m: M) => (materials.push(m), m);
  let seed = 909;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  const build = (width: number, height: number, board: { top: number; height: number }) => {
    const at = layout(width, board);
    const y = (fromTop: number) => height / 2 - fromTop;
    const gold = own(new MeshStandardMaterial({ color: GOLD, metalness: 0.5, roughness: 0.3, emissive: 0x6b4a08 }));
    const frame = own(new MeshStandardMaterial({ color: ANTIQUE_GOLD, metalness: 0.45, roughness: 0.42, emissive: 0x3a2804 }));
    const plum = own(new MeshStandardMaterial({ color: 0x4a2388, metalness: 0.3, roughness: 0.5, emissive: 0x1d0a3d }));
    const cylinder = (top: number, bottom: number, length: number, material: Material, x: number, cy: number, z = -8) => {
      const mesh = new Mesh(keep(new CylinderGeometry(top, bottom, length, 20)), material);
      mesh.position.set(x, cy, z);
      world.add(mesh);
      return mesh;
    };
    const glowSprite = (color: number, size: number, opacity: number) => {
      const material = own(new SpriteMaterial({ map: dot, color, opacity, transparent: true, depthWrite: false, blending: AdditiveBlending }));
      const sprite = new Sprite(material);
      sprite.scale.setScalar(size);
      return { sprite, material };
    };

    /* the gate: an upswept antique-gold beam over a bright gold line, two slim posts with gold collars */
    const half = width / 2;
    const beam = (offset: number, radius: number, lift: number, material: Material) => {
      const curve = new CatmullRomCurve3(
        [
          [-half + 2, -lift],
          [-half * 0.55, 0],
          [0, 1.5],
          [half * 0.55, 0],
          [half - 2, -lift],
        ].map(([x, dy]) => new Vector3(x, y(at.beamY + offset + dy), -8)),
      );
      world.add(new Mesh(keep(new TubeGeometry(curve, 80, radius, 12)), material));
    };
    beam(0, 4.2, 8, frame);
    beam(-6, 1.3, 9, gold);
    for (const side of [-1, 1]) {
      const x = side * at.postX;
      const length = at.postBottom - at.beamY;
      cylinder(2.6, 3.2, length, frame, x, y(at.beamY + length / 2));
      for (const share of [0.02, 0.2, 0.98]) cylinder(4.4, 4.4, 5, gold, x, y(at.beamY + length * share));
      cylinder(4.6, 5.8, 9, plum, x, y(at.postBottom + 4));
      const cap = new Mesh(keep(new SphereGeometry(4.6, 20, 14)), gold);
      cap.position.set(side * (half - 5), y(at.beamY - 9), -6);
      world.add(cap);
    }

    /* paper lanterns, floating beside the title */
    const paper = own(new MeshStandardMaterial({ color: 0xf0c45a, metalness: 0.05, roughness: 0.6, emissive: 0x8a5c0c }));
    const lanternBody = keep(
      new LatheGeometry(
        Array.from({ length: 21 }, (_, k) => {
          const u = k / 20;
          return new Vector2(0.2 + Math.sin(Math.PI * u) * 0.3, u - 0.5);
        }),
        32,
      ),
    );
    const band = keep(new CylinderGeometry(0.22, 0.22, 0.12, 24));
    const rib = keep(new TorusGeometry(0.5, 0.014, 8, 48));
    const tassel = keep(new CylinderGeometry(0.025, 0.07, 0.34, 10));
    at.lanterns.forEach((spot, i) => {
      const lantern = new Group();
      const shell = new Group();
      const body = new Mesh(lanternBody, paper);
      body.scale.y = 1.1;
      shell.add(body);
      for (const [geometry, material, dy] of [
        [band, gold, 0.58],
        [band, gold, -0.58],
        [tassel, gold, -0.82],
      ] as const) {
        const part = new Mesh(geometry, material);
        part.position.y = dy;
        shell.add(part);
      }
      const ring = new Mesh(rib, gold);
      ring.rotation.x = Math.PI / 2;
      shell.add(ring);
      const light = glowSprite(0xffd166, 2.6, 0.5);
      lantern.add(light.sprite, shell);
      lantern.scale.setScalar(spot.width);
      world.add(lantern);
      const phase = i * 2.4;
      animate.push((f) => {
        lantern.position.set(spot.x, y(spot.y) + Math.sin(f.time * 0.9 + phase) * 4, 2);
        shell.rotation.z = swing(f.time, phase, f.age, f.strength * 0.45);
        shell.rotation.y = f.time * 0.18 + phase;
        light.material.opacity = Math.min(0.24 + f.glow * 0.3 + Math.sin(f.time * 2.3 + phase) * 0.04, 0.75);
        paper.emissiveIntensity = 0.7 + f.glow * 0.6;
      });
    });

    /* temple bells on short cords: they swing from where they are tied */
    const dome = keep(
      new LatheGeometry(
        [
          [0.001, 0],
          [0.16, -0.03],
          [0.27, -0.16],
          [0.31, -0.45],
          [0.36, -0.68],
          [0.5, -0.82],
          [0.46, -0.86],
          [0.001, -0.84],
        ].map(([r, h]) => new Vector2(r, h)),
        32,
      ),
    );
    const clapper = keep(new SphereGeometry(0.13, 16, 12));
    const cordMaterial = own(new MeshBasicMaterial({ color: 0xb8892b }));
    at.bells.forEach((spot, i) => {
      const pivot = new Group();
      pivot.position.set(spot.x, y(spot.y), 4);
      const cord = new Mesh(keep(new CylinderGeometry(0.8, 0.8, spot.cord, 8)), cordMaterial);
      cord.position.y = -spot.cord / 2;
      const bell = new Group();
      bell.position.y = -spot.cord;
      bell.scale.setScalar(spot.size * 1.15);
      const shellMesh = new Mesh(dome, gold);
      const tongue = new Mesh(clapper, gold);
      tongue.position.y = -0.9;
      bell.add(shellMesh, tongue);
      pivot.add(cord, bell);
      world.add(pivot);
      const phase = i * 1.7;
      animate.push((f) => {
        pivot.rotation.z = swing(f.time, phase, f.age - (i % 2) * 0.08, f.strength);
        tongue.position.x = -pivot.rotation.z * 0.35;
      });
    });

    /* soft light behind the board */
    const violetPool = glowSprite(VIOLET, width * 1.5, 0.2);
    const goldPool = glowSprite(0xffc861, width * 0.9, 0.1);
    violetPool.sprite.position.set(0, y(at.centreY), -60);
    goldPool.sprite.position.set(0, y(at.centreY), -50);
    world.add(violetPool.sprite, goldPool.sprite);
    animate.push((f) => {
      const breath = 1 + Math.sin(f.time * 0.9) * 0.05;
      violetPool.material.opacity = 0.1 + f.glow * 0.2;
      goldPool.material.opacity = Math.min(0.02 + f.glow * 0.16 * breath, 0.3);
      goldPool.sprite.scale.setScalar(width * (0.82 + f.glow * 0.14) * breath);
      gold.emissiveIntensity = 0.7 + f.glow * 0.55;
      warm.intensity = 0.3 + f.glow * 1.2;
    });
    warm.position.set(0, y(at.centreY), 220);

    /* waves of light spreading from the board */
    const ripple = keep(new TorusGeometry(1, 0.006, 6, 160));
    [0, 1, 2].forEach((k) => {
      const material = own(new MeshBasicMaterial({ color: k === 1 ? 0xb79bff : GOLD_LIGHT, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
      const ring = new Mesh(ripple, material);
      ring.position.set(0, y(at.centreY), -20);
      world.add(ring);
      animate.push((f) => {
        const p = (f.time * 0.62 + k / 3) % 1;
        ring.visible = f.wave > 0.02;
        ring.scale.setScalar(at.boardHalf * (0.75 + p * 0.85));
        material.opacity = f.wave * Math.sin(Math.PI * p) * 0.75;
      });
    });

    /* motes drifting up */
    const COUNT = 46;
    const positions = new Float32Array(COUNT * 3);
    const motes = Array.from({ length: COUNT }, () => ({ x: (random() - 0.5) * width * 0.96, y: random(), s: 0.35 + random() * 0.65 }));
    const geometry = keep(new BufferGeometry());
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    const moteMaterial = own(new PointsMaterial({ size: 7, map: dot, color: GOLD_LIGHT, transparent: true, depthWrite: false, blending: AdditiveBlending }));
    const cloud = new Points(geometry, moteMaterial);
    cloud.frustumCulled = false;
    world.add(cloud);
    animate.push((f) => {
      const attribute = geometry.getAttribute("position") as BufferAttribute;
      motes.forEach((m, i) => {
        const rise = (m.y + f.time * 0.016 * m.s) % 1;
        attribute.setXYZ(i, m.x + Math.sin(f.time * 0.6 + i) * 6, (rise - 0.5) * height, -30);
      });
      attribute.needsUpdate = true;
      moteMaterial.opacity = 0.28 + f.glow * 0.3;
    });
  };

  const clear = () => {
    world.clear();
    animate.length = 0;
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    geometries.length = materials.length = 0;
  };

  let ratio = 1;
  let built = "";
  return {
    setSize(width, height, board, pixelRatio) {
      ratio = pixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      // distance at which one world unit on z = 0 covers exactly one CSS pixel
      camera.position.set(0, 0, height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      camera.updateProjectionMatrix();
      const shape = [width, height, board.top, board.height].map(Math.round).join("x");
      if (built !== shape) {
        built = shape;
        clear();
        seed = 909;
        build(width, height, board);
      }
    },
    render(frame) {
      for (const step of animate) step(frame);
      renderer.render(scene, camera);
    },
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: ratio }),
    dispose() {
      clear();
      dot.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
