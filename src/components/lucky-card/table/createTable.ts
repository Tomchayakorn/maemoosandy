/**
 * The 3D lucky table behind ดวงดี มีเฮ's cards, built entirely from code (no model, image or font files): a deep-violet round table with gold
 * inlay, rings of golden light behind the board, softly flickering candles, rising dust and a sparkle burst for a special prize.
 * Decorative only.
 *
 * One world unit = one CSS pixel on the z = 0 plane; the layer's middle is the middle of the card board (or of the result card).
 * Budget: 3 lights, no shadows, candle bodies instanced. Only this module imports three.js; TableBackdrop loads it lazily.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
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
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
  Vector2,
  WebGLRenderer,
} from "three";

const GOLD = 0xd4af37;
const GOLD_LIGHT = 0xf3d98b;
const VIOLET = 0x8b5cf6;
const CLOTH = 0x2c1157;
const FLAME = 0xffa23d;
/** The scene is built for a layer of this width and scaled to the real one. */
const BASE_WIDTH = 375;

export type TableFrame = { angle: number; time: number; glow: number; burst: number };

export type TableHandle = {
  setSize(width: number, height: number, pixelRatio: number): void;
  render(frame: TableFrame): void;
  stats(): { calls: number; triangles: number; pixelRatio: number };
  dispose(): void;
};

/** Throws when the browser cannot create a WebGL context (the page then simply has no table). */
export function createTable(canvas: HTMLCanvasElement): TableHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 10, 6000);
  const textures: Texture[] = [];
  const dummy = new Object3D();
  let seed = 1108;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  const dotCanvas = document.createElement("canvas");
  dotCanvas.width = dotCanvas.height = 64;
  const c = dotCanvas.getContext("2d");
  if (c) {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  }
  const dot = new CanvasTexture(dotCanvas);
  dot.colorSpace = SRGBColorSpace;
  textures.push(dot);
  const glowSprite = (color: number, size: number) => {
    const sprite = new Sprite(new SpriteMaterial({ map: dot, color, transparent: true, depthWrite: false, blending: AdditiveBlending }));
    sprite.scale.setScalar(size);
    return sprite;
  };

  /* ───────── materials and lights (3) ───────── */
  const gold = new MeshStandardMaterial({ color: GOLD, metalness: 0.5, roughness: 0.34, emissive: 0x5c3f06 });
  const cloth = new MeshStandardMaterial({ color: CLOTH, metalness: 0.1, roughness: 0.8, emissive: 0x14062b });
  const wax = new MeshStandardMaterial({ color: 0xf1dcff, roughness: 0.75, emissive: 0x4a2466 });
  scene.add(new HemisphereLight(0xd9ccff, 0x1a0b30, 1.4));
  const key = new DirectionalLight(0xffe6b8, 1.3);
  key.position.set(150, 320, 420);
  const warm = new PointLight(FLAME, 1, 0, 0);
  scene.add(key, warm);

  const root = new Group(); // everything scales with the layer's width
  scene.add(root);

  /* ───────── rings of golden light behind the board ───────── */
  const ringMaterial = new MeshBasicMaterial({ color: GOLD_LIGHT, transparent: true, opacity: 0.4, depthWrite: false, blending: AdditiveBlending });
  const violetMaterial = new MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.4, depthWrite: false, blending: AdditiveBlending });
  const rings = [
    { radius: 150, tube: 1.6, material: ringMaterial, arc: Math.PI * 2, speed: 0 },
    { radius: 176, tube: 3, material: ringMaterial, arc: Math.PI * 0.7, speed: 0.22 },
    { radius: 176, tube: 3, material: ringMaterial, arc: Math.PI * 0.7, speed: 0.22 },
    { radius: 194, tube: 1.2, material: violetMaterial, arc: Math.PI * 2, speed: 0 },
    { radius: 212, tube: 2.2, material: violetMaterial, arc: Math.PI * 0.45, speed: -0.16 },
    { radius: 212, tube: 2.2, material: violetMaterial, arc: Math.PI * 0.45, speed: -0.16 },
  ].map((r, i) => {
    const mesh = new Mesh(new TorusGeometry(r.radius, r.tube, 8, 140, r.arc), r.material);
    mesh.position.set(0, 0, -90);
    root.add(mesh);
    return { mesh, speed: r.speed, start: i % 2 ? 0 : Math.PI };
  });
  const aura = glowSprite(0x7c3aed, 520);
  aura.position.z = -140;
  const halo = glowSprite(0xffc861, 360);
  halo.position.z = -110;
  root.add(aura, halo);

  /* ───────── the lucky table, tipped towards the viewer ───────── */
  const table = new Group();
  table.position.set(0, -70, -40);
  table.rotation.x = 0.5;
  const top = new Group(); // turns slowly with its inlay
  const slab = new Mesh(new CylinderGeometry(190, 180, 16, 96), cloth);
  top.add(slab);
  for (const [radius, tube] of [
    [190, 4],
    [158, 1.6],
    [112, 1.2],
    [58, 1.6],
  ]) {
    const inlay = new Mesh(new TorusGeometry(radius, tube, 10, 140), gold);
    inlay.rotation.x = Math.PI / 2;
    inlay.position.y = 9;
    top.add(inlay);
  }
  const studs = new InstancedMesh(new CylinderGeometry(4.5, 4.5, 3, 20), gold, 24);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    dummy.position.set(Math.sin(a) * 174, 9, Math.cos(a) * 174);
    dummy.scale.setScalar(i % 3 ? 0.7 : 1.15);
    dummy.updateMatrix();
    studs.setMatrixAt(i, dummy.matrix);
  }
  top.add(studs);
  table.add(top);
  root.add(table);

  /* ───────── candles: two above the board's corners, two on the table's front ───────── */
  const CANDLES: [number, number, number, number][] = [
    // x, base y, z, wax height
    [-166, 128, -20, 46],
    [166, 128, -20, 46],
    [-158, -186, 60, 62],
    [158, -186, 60, 62],
    [-176, -34, -50, 34],
    [176, -34, -50, 34],
  ];
  const bodies = new InstancedMesh(new CylinderGeometry(9, 11, 1, 28), wax, CANDLES.length);
  const holders = new InstancedMesh(new CylinderGeometry(16, 19, 7, 36), gold, CANDLES.length);
  // a teardrop turned on a lathe: round at the wick, drawing out to a soft tip
  const flameGeometry = new LatheGeometry(
    Array.from({ length: 17 }, (_, k) => {
      const u = k / 16;
      return new Vector2(6 * Math.sin(Math.PI * Math.pow(u, 0.72)) * (1 - u * 0.25), (u - 0.36) * 26);
    }),
    20,
  );
  const outerFlame = new MeshBasicMaterial({ color: FLAME, transparent: true, opacity: 0.92, depthWrite: false, blending: AdditiveBlending });
  const innerFlame = new MeshBasicMaterial({ color: 0xfff1c4 });
  const flames = CANDLES.map(([x, y, z, h], i) => {
    dummy.scale.set(1, h, 1);
    dummy.position.set(x, y + h / 2, z);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    dummy.scale.set(1, 1, 1);
    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    holders.setMatrixAt(i, dummy.matrix);
    const flame = new Group();
    flame.position.set(x, y + h + 12, z + 2);
    const outer = new Mesh(flameGeometry, outerFlame);
    const inner = new Mesh(flameGeometry, innerFlame);
    inner.scale.setScalar(0.5);
    inner.position.y = -1.5;
    const light = glowSprite(FLAME, 70);
    flame.add(outer, inner, light);
    root.add(flame);
    return { flame, outer, inner, light, phase: i * 1.9 };
  });
  root.add(bodies, holders);

  /* ───────── dust and the special-prize sparkles ───────── */
  const points = (count: number, size: number, color: number) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    const material = new PointsMaterial({ size, map: dot, color, transparent: true, depthWrite: false, blending: AdditiveBlending });
    const mesh = new Points(geometry, material);
    mesh.frustumCulled = false;
    root.add(mesh);
    return { mesh, material, position: geometry.getAttribute("position") as BufferAttribute };
  };
  const DUST = 70;
  const dust = points(DUST, 7, GOLD_LIGHT);
  const motes = Array.from({ length: DUST }, () => ({ x: random() * 2 - 1, y: random(), s: 0.3 + random() * 0.7 }));
  const SPARKS = 80;
  const sparks = points(SPARKS, 12, 0xffe9ad);
  const rays = Array.from({ length: SPARKS }, () => ({ a: random() * Math.PI * 2, reach: 40 + random() * 150, delay: random() }));

  let height = 1;
  let ratio = 1;
  return {
    setSize(width, h, pixelRatio) {
      ratio = pixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, h, false);
      camera.aspect = width / Math.max(h, 1);
      // distance at which one world unit on z = 0 covers exactly one CSS pixel
      camera.position.set(0, 0, h / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      camera.updateProjectionMatrix();
      const k = Math.min(width, 480) / BASE_WIDTH;
      root.scale.setScalar(k);
      height = h / k;
    },
    render({ angle, time, glow, burst }) {
      for (const r of rings) r.mesh.rotation.z = r.start + angle * r.speed;
      const breath = 1 + Math.sin(time * 1.6) * 0.07;
      ringMaterial.opacity = Math.min(0.14 + glow * 0.4 * breath, 0.75);
      violetMaterial.opacity = Math.min(0.16 + glow * 0.28, 0.6);
      (aura.material as SpriteMaterial).opacity = 0.14 + glow * 0.16;
      (halo.material as SpriteMaterial).opacity = Math.min(0.04 + glow * 0.16 * breath + burst * 0.14, 0.5);
      top.rotation.y = angle * 0.07;
      gold.emissiveIntensity = 0.55 + glow * 0.75;
      // candles: three slow waves that never line up, taller and brighter as the moment heats up
      for (const { flame, outer, inner, light, phase } of flames) {
        const f = 1 + Math.sin(time * 4.1 + phase) * 0.055 + Math.sin(time * 6.7 + phase * 2.3) * 0.03 + Math.sin(time * 2.2 + phase * 0.7) * 0.035;
        const size = 0.9 + glow * 0.28;
        outer.scale.set((2 - f) * size, f * f * size, (2 - f) * size);
        inner.scale.set(0.52 * (2 - f) * size, 0.52 * f * size, 0.52 * (2 - f) * size);
        flame.rotation.z = Math.sin(time * 1.9 + phase) * 0.07 + Math.sin(time * 3.4 + phase * 1.7) * 0.03;
        light.scale.setScalar((52 + glow * 34) * (1 + (f - 1) * 1.2));
        light.material.opacity = Math.min(0.38 + glow * 0.28 + (f - 1) * 0.6, 0.85);
      }
      warm.intensity = 0.4 + glow * 1.5 + Math.sin(time * 3.1) * 0.12;
      warm.position.set(0, -120, 200);

      motes.forEach((m, i) => {
        const rise = (m.y + angle * 0.012 * m.s) % 1;
        dust.position.setXYZ(i, m.x * 190 + Math.sin(time * 0.7 + i) * 5, (rise - 0.5) * height, -20);
      });
      dust.position.needsUpdate = true;
      dust.material.opacity = Math.min(0.3 + glow * 0.35, 0.8);

      sparks.mesh.visible = burst > 0.02;
      if (sparks.mesh.visible) {
        rays.forEach((s, i) => {
          const p = (time * 0.5 + s.delay) % 1;
          const reach = 90 + s.reach * (1 - (1 - p) * (1 - p));
          // as the burst fades, sparks drop out one by one (parked at the centre, behind the cards)
          const live = s.delay < burst ? reach : 0;
          sparks.position.setXYZ(i, Math.cos(s.a) * live, Math.sin(s.a) * live - p * p * 30, -10);
        });
        sparks.position.needsUpdate = true;
        sparks.material.opacity = burst * 0.9;
      }
      renderer.render(scene, camera);
    },
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pixelRatio: ratio }),
    dispose() {
      scene.traverse((object) => {
        const o = object as Partial<Mesh>;
        o.geometry?.dispose();
        const materials: Material[] = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of materials) m.dispose();
        if (object instanceof InstancedMesh) object.dispose();
      });
      for (const t of textures) t.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
