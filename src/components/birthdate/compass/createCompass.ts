/**
 * The birth-date page's 3D backdrop, built entirely from code (no model, image or font files): a zodiac halo with the twelve signs and a
 * ทักษา compass of eight directions (numbers in the order of the Thai wheel, gems in the day colours), a turning needle, gyroscope arcs,
 * golden light and star dust, in violet and gold. Decorative only — it computes nothing about anyone's reading.
 *
 * One world unit = one CSS pixel on the z = 0 plane, so the rings are placed with page measurements.
 * Budget: 3 lights, no shadows, repeated parts instanced. Only this module imports three.js; CompassBackdrop loads it lazily.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";

const GOLD = 0xd4af37;
const GOLD_LIGHT = 0xf3d98b;
const VIOLET = 0x8b5cf6;
const PLUM = 0x4a2388;

const ZODIAC = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];
/** The ทักษา wheel, clockwise: อาทิตย์ ๑, จันทร์ ๒, อังคาร ๓, พุธ ๔, เสาร์ ๗, พฤหัส ๕, ราหู ๘, ศุกร์ ๖ — with each day's colour. */
const TAKSA: [string, number][] = [
  ["๑", 0xe5484d],
  ["๒", 0xffd60a],
  ["๓", 0xff6fb5],
  ["๔", 0x3dd68c],
  ["๗", 0xa855f7],
  ["๕", 0xff8b3d],
  ["๘", 0x7d8190],
  ["๖", 0x4cc3ff],
];
const RADIUS = 175; // the geometry is built at this size and scaled to fit the layer

export type CompassFrame = {
  /** Accumulated spin angle (radians); it advances faster in busier moods. */
  angle: number;
  /** Scene time, seconds (slow wobbles and twinkles). */
  time: number;
  glow: number;
  /** 0 = full-size rings around the form, 1 = drawn in round the crystal ball (smaller, so the loading message below stays clear). */
  gather: number;
  /** CSS pixels from the top of the layer. */
  haloY: number;
  compassY: number;
};

export type CompassHandle = {
  setSize(width: number, height: number, radius: number, pixelRatio: number): void;
  render(frame: CompassFrame): void;
  stats(): { calls: number; triangles: number; pixelRatio: number };
  dispose(): void;
};

function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d");
  if (c) draw(c, size);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Throws when the browser cannot create a WebGL context (the page then simply has no compass). */
export function createCompass(canvas: HTMLCanvasElement): CompassHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 10, 6000);
  const textures: Texture[] = [];
  const dummy = new Object3D();

  const glowTexture = canvasTexture(128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
  textures.push(glowTexture);
  const glyph = (text: string, color: string, size: number) => {
    const tex = canvasTexture(128, (c, s) => {
      c.font = `600 ${s * 0.66}px "Noto Serif Thai", "Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols", serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.shadowColor = color;
      c.shadowBlur = s * 0.14;
      c.fillStyle = color;
      c.fillText(text, s / 2, s / 2 + s * 0.03);
      c.fillText(text, s / 2, s / 2 + s * 0.03);
    });
    textures.push(tex);
    const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.setScalar(size);
    return sprite;
  };
  const glowSprite = (color: number, scale: number) => {
    const sprite = new Sprite(new SpriteMaterial({ map: glowTexture, color, transparent: true, depthWrite: false, blending: AdditiveBlending }));
    sprite.scale.setScalar(scale);
    return sprite;
  };

  const gold = new MeshStandardMaterial({ color: GOLD, metalness: 0.45, roughness: 0.35, emissive: 0x6b4a08 });
  const violet = new MeshStandardMaterial({ color: VIOLET, metalness: 0.3, roughness: 0.45, emissive: 0x3b1580 });
  const ring = (radius: number, tube: number, material: Material, arc = Math.PI * 2) =>
    new Mesh(new TorusGeometry(radius, tube, 10, 180, arc), material);
  const ticks = (count: number, radius: number, length: number, material: Material) => {
    const mesh = new InstancedMesh(new BoxGeometry(1.4, length, 1.4), material, count);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      dummy.position.set(Math.sin(a) * radius, Math.cos(a) * radius, 0);
      dummy.rotation.set(0, 0, -a);
      dummy.scale.set(1, i % 6 ? 0.55 : 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    return mesh;
  };

  /* ───────── lights (3) ───────── */
  scene.add(new HemisphereLight(0xd9ccff, 0x1a0b30, 1.5));
  const key = new DirectionalLight(0xffe6b8, 1.4);
  key.position.set(200, 300, 500);
  const warm = new PointLight(GOLD_LIGHT, 1, 0, 0);
  scene.add(key, warm);

  /* ───────── zodiac halo: faces the viewer ───────── */
  const halo = new Group();
  const haloOuter = new Group(); // turns one way: rim, ticks
  haloOuter.add(ring(RADIUS, 1.5, gold), ticks(72, RADIUS - 6, 8, new MeshBasicMaterial({ color: GOLD_LIGHT, transparent: true, opacity: 0.75 })));
  const haloSigns = new Group(); // the other way: signs
  haloSigns.add(ring(RADIUS * 0.76, 0.9, violet));
  ZODIAC.forEach((sign, i) => {
    const a = (i / ZODIAC.length) * Math.PI * 2;
    // U+FE0E asks for the plain text glyph instead of the colour emoji
    const sprite = glyph(`${sign}︎`, i % 2 ? "#f3d98b" : "#c4a5ff", 26);
    sprite.position.set(Math.sin(a) * RADIUS * 0.86, Math.cos(a) * RADIUS * 0.86, 4);
    haloSigns.add(sprite);
  });
  halo.add(haloOuter, haloSigns);
  scene.add(halo);

  /* ───────── ทักษา compass: lies tilted, like a dial on a table ───────── */
  const compass = new Group();
  compass.rotation.x = -1.12;
  const dial = new Group();
  dial.add(ring(RADIUS * 0.98, 2.2, gold), ring(RADIUS * 0.62, 1.2, violet), ring(RADIUS * 0.26, 1, gold));
  const spokes: Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    spokes.push(new Vector3(Math.sin(a) * RADIUS * 0.26, Math.cos(a) * RADIUS * 0.26, 0), new Vector3(Math.sin(a) * RADIUS * 0.98, Math.cos(a) * RADIUS * 0.98, 0));
  }
  dial.add(new LineSegments(new BufferGeometry().setFromPoints(spokes), new LineBasicMaterial({ color: GOLD_LIGHT, transparent: true, opacity: 0.55 })));
  const gemGeometry = new SphereGeometry(6, 20, 14);
  TAKSA.forEach(([digit, color], i) => {
    const a = (i / 8) * Math.PI * 2;
    const number = glyph(digit, "#fff0c2", 30);
    number.position.set(Math.sin(a) * RADIUS * 0.79, Math.cos(a) * RADIUS * 0.79, 6);
    const gem = new Mesh(gemGeometry, new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.3 }));
    gem.position.set(Math.sin(a) * RADIUS * 0.98, Math.cos(a) * RADIUS * 0.98, 3);
    dial.add(number, gem);
  });
  const starShape = new Shape();
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? RADIUS * 0.1 : i % 4 ? RADIUS * 0.34 : RADIUS * 0.58;
    if (i) starShape.lineTo(Math.sin(a) * r, Math.cos(a) * r);
    else starShape.moveTo(Math.sin(a) * r, Math.cos(a) * r);
  }
  const starMaterial = new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.22, side: DoubleSide, depthWrite: false });
  dial.add(new Mesh(new ShapeGeometry(starShape), starMaterial));
  const needle = new Group();
  const arm = (color: Material, direction: 1 | -1) => {
    const cone = new Mesh(new ConeGeometry(7, RADIUS * 0.68, 24), color);
    cone.position.y = direction * RADIUS * 0.34;
    if (direction < 0) cone.rotation.z = Math.PI;
    return cone;
  };
  const pin = new Mesh(new SphereGeometry(11, 28, 20), gold);
  needle.add(arm(gold, 1), arm(violet, -1), pin);
  needle.position.z = 10;
  compass.add(dial, needle);
  scene.add(compass);

  /* ───────── gyroscope arcs and the golden light ───────── */
  const gyro = new Group();
  const arcMaterial = new MeshBasicMaterial({ color: GOLD_LIGHT, transparent: true, opacity: 0.5, depthWrite: false, blending: AdditiveBlending });
  const arcs = [0.5, 0.64, 0.4].map((k) => ring(RADIUS * k, 1.3, arcMaterial, Math.PI * 1.35));
  gyro.add(...arcs);
  const sun = glowSprite(0xffc861, RADIUS * 2);
  const aura = glowSprite(PLUM, RADIUS * 3);
  aura.position.z = -60;
  scene.add(aura, sun, gyro);

  /* ───────── star dust around the halo ───────── */
  let seed = 4242;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const COUNT = 90;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const palette = [new Color(GOLD_LIGHT), new Color(0xc4a5ff), new Color(0xffffff)];
  for (let i = 0; i < COUNT; i++) {
    const a = random() * Math.PI * 2;
    const r = RADIUS * (0.7 + random() * 0.55);
    positions.set([Math.sin(a) * r, Math.cos(a) * r, (random() - 0.5) * 90], i * 3);
    const c = palette[i % palette.length];
    colors.set([c.r, c.g, c.b], i * 3);
  }
  const dustGeometry = new BufferGeometry();
  dustGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  dustGeometry.setAttribute("color", new BufferAttribute(colors, 3));
  const dustMaterial = new PointsMaterial({ size: 7, map: glowTexture, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const dust = new Points(dustGeometry, dustMaterial);
  scene.add(dust);

  let height = 1;
  let scale = 1;
  let ratio = 1;
  return {
    setSize(width, h, radius, pixelRatio) {
      height = h;
      scale = radius / RADIUS;
      ratio = pixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, h, false);
      camera.aspect = width / Math.max(h, 1);
      // distance at which one world unit on z = 0 covers exactly one CSS pixel
      camera.position.set(0, 0, h / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      camera.updateProjectionMatrix();
      sun.scale.setScalar(RADIUS * 2 * scale);
      aura.scale.setScalar(RADIUS * 3 * scale);
    },
    render({ angle, time, glow, gather, haloY, compassY }) {
      const size = scale * (1 - 0.22 * gather);
      for (const part of [halo, compass, gyro, dust]) part.scale.setScalar(size);
      const hy = height / 2 - haloY;
      const cy = height / 2 - compassY;
      halo.position.set(0, hy, -30);
      halo.rotation.set(Math.sin(time * 0.31) * 0.09, Math.sin(time * 0.23) * 0.12, 0);
      haloOuter.rotation.z = -angle * 0.12;
      haloSigns.rotation.z = angle * 0.08;
      compass.position.set(0, cy, 0);
      compass.rotation.x = -1.12 + Math.sin(time * 0.27) * 0.05;
      dial.rotation.z = -angle * 0.2;
      needle.rotation.z = angle * 0.55 + Math.sin(time * 0.8) * 0.12;
      gyro.position.set(0, (hy + cy) / 2, 10);
      arcs[0].rotation.set(1.1, angle * 0.5, angle * 0.3);
      arcs[1].rotation.set(angle * 0.27, 0.9, -angle * 0.4);
      arcs[2].rotation.set(-angle * 0.45, angle * 0.2, 1.4);
      // the golden light: brighter and gently breathing while the reading is being decoded
      const breath = 1 + Math.sin(time * 2.1) * 0.06 * glow;
      sun.position.set(0, (hy + cy) / 2, -20);
      aura.position.set(0, hy, -60);
      (sun.material as SpriteMaterial).opacity = Math.min(0.1 + glow * 0.28, 0.6) * breath;
      (aura.material as SpriteMaterial).opacity = 0.18 + glow * 0.14;
      arcMaterial.opacity = Math.min(0.12 + glow * 0.45, 0.8);
      starMaterial.opacity = 0.12 + glow * 0.2;
      gold.emissiveIntensity = 0.5 + glow * 0.9;
      violet.emissiveIntensity = 0.6 + glow * 0.7;
      warm.intensity = 0.3 + glow * 1.8;
      warm.position.set(0, (hy + cy) / 2, 120);
      dust.position.set(0, hy, 0);
      dust.rotation.z = angle * 0.05;
      dustMaterial.opacity = 0.45 + glow * 0.35 + Math.sin(time * 1.3) * 0.1;
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
