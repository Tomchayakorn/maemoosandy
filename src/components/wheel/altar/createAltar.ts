/**
 * The 3D setting behind the lucky wheel, built entirely from code (no model, image or font files): a tiered golden altar under the wheel,
 * pillars of lucky light, a turning sunburst, gold coins and violet orbs circling the wheel, rising dust and a sparkle burst for a win.
 * Decorative only.
 *
 * One world unit = one CSS pixel on the z = 0 plane, so everything is placed with the wheel's measured centre and radius.
 * Budget: 3 lights, no shadows, coins / orbs / gems instanced. Only this module imports three.js; AltarBackdrop loads it lazily.
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
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
  WebGLRenderer,
} from "three";

const GOLD = 0xd4af37;
const GOLD_LIGHT = 0xf3d98b;
const VIOLET = 0x8b5cf6;
const PLUM = 0x4a2388;
/** The altar and coins are built for a wheel of this radius and scaled to the real one. */
const RADIUS = 180;
const COINS = 18;
const ORBS = 12;

export type AltarFrame = {
  /** Accumulated motion angle (advances faster in busier moods). */
  angle: number;
  time: number;
  glow: number;
  burst: number;
};

export type AltarHandle = {
  /** Canvas size and the wheel's centre (from the top) and radius, all in CSS pixels. */
  setSize(width: number, height: number, centerY: number, radius: number, pixelRatio: number): void;
  render(frame: AltarFrame): void;
  stats(): { calls: number; triangles: number; pixelRatio: number };
  dispose(): void;
};

function canvasTexture(width: number, height: number, draw: (c: CanvasRenderingContext2D) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const c = canvas.getContext("2d");
  if (c) draw(c);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Throws when the browser cannot create a WebGL context (the page then simply has no altar). */
export function createAltar(canvas: HTMLCanvasElement): AltarHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 10, 6000);
  const textures: Texture[] = [];
  const dummy = new Object3D();
  let seed = 777;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  /* ───────── textures drawn in code ───────── */
  const dot = canvasTexture(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  const beam = canvasTexture(64, 256, (c) => {
    const across = c.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, "rgba(255,255,255,0)");
    across.addColorStop(0.5, "rgba(255,255,255,1)");
    across.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = across;
    c.fillRect(0, 0, 64, 256);
    // fade both ends so a pillar never shows a hard edge
    c.globalCompositeOperation = "destination-in";
    const along = c.createLinearGradient(0, 0, 0, 256);
    along.addColorStop(0, "rgba(0,0,0,0)");
    along.addColorStop(0.35, "rgba(0,0,0,0.75)");
    along.addColorStop(0.85, "rgba(0,0,0,1)");
    along.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = along;
    c.fillRect(0, 0, 64, 256);
  });
  const rays = canvasTexture(256, 256, (c) => {
    c.translate(128, 128);
    for (let i = 0; i < 24; i++) {
      c.rotate((Math.PI * 2) / 24);
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, 128, -0.055, 0.055);
      c.closePath();
      const g = c.createRadialGradient(0, 0, 30, 0, 0, 128);
      g.addColorStop(0, "rgba(255,255,255,0.9)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fill();
    }
  });
  textures.push(dot, beam, rays);
  const light = (map: Texture, color: number) => new MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, blending: AdditiveBlending });

  /* ───────── materials and lights (3) ───────── */
  const gold = new MeshStandardMaterial({ color: GOLD, metalness: 0.55, roughness: 0.32, emissive: 0x5c3f06 });
  const coinGold = new MeshStandardMaterial({ color: GOLD_LIGHT, metalness: 0.6, roughness: 0.28, emissive: 0x7a5608 });
  const purple = new MeshStandardMaterial({ color: PLUM, metalness: 0.25, roughness: 0.55, emissive: 0x1f0b42 });
  const orbMaterial = new MeshStandardMaterial({ color: VIOLET, metalness: 0.2, roughness: 0.25, emissive: 0x4a1fb0 });
  scene.add(new HemisphereLight(0xd9ccff, 0x1a0b30, 1.5));
  const key = new DirectionalLight(0xffe6b8, 1.5);
  key.position.set(220, 320, 500);
  const warm = new PointLight(GOLD_LIGHT, 1, 0, 0);
  scene.add(key, warm);

  /* ───────── sunburst and pillars of light, behind everything ───────── */
  const burstPlane = new PlaneGeometry(RADIUS * 2.7, RADIUS * 2.7);
  const sunburst = new Mesh(burstPlane, light(rays, 0xffd27a));
  sunburst.position.z = -140;
  scene.add(sunburst);
  const beamGeometry = new PlaneGeometry(1, 1);
  const pillars = [-0.92, -0.66, 0.66, 0.92].map((x, i) => {
    const mesh = new Mesh(beamGeometry, light(beam, i === 0 || i === 3 ? VIOLET : 0xffcc66));
    mesh.position.z = -90 - (i % 2) * 20;
    scene.add(mesh);
    return { mesh, x };
  });

  /* ───────── the golden altar under the wheel ───────── */
  const altar = new Group();
  const tier = (top: number, bottom: number, h: number, y: number, material: Material) => {
    const mesh = new Mesh(new CylinderGeometry(top, bottom, h, 64), material);
    mesh.position.y = y;
    altar.add(mesh);
  };
  tier(104, 112, 14, 0, purple);
  tier(78, 92, 18, 16, gold);
  tier(62, 70, 10, 30, purple);
  const rim = (radius: number, tube: number, y: number) => {
    const mesh = new Mesh(new TorusGeometry(radius, tube, 10, 120), gold);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = y;
    altar.add(mesh);
  };
  rim(108, 3, 7);
  rim(79, 2.4, 25);
  rim(62, 2, 35);
  const gems = new InstancedMesh(new SphereGeometry(5, 18, 12), orbMaterial, 12);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    dummy.position.set(Math.sin(a) * 86, 16, Math.cos(a) * 86);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    gems.setMatrixAt(i, dummy.matrix);
  }
  altar.add(gems);
  const halo = new Mesh(new TorusGeometry(130, 1.6, 8, 140), new MeshBasicMaterial({ color: GOLD_LIGHT, transparent: true, opacity: 0.6 }));
  halo.rotation.x = Math.PI / 2;
  altar.add(halo);
  scene.add(altar);

  /* ───────── coins and violet orbs circling the wheel ───────── */
  const coins = new InstancedMesh(new CylinderGeometry(13, 13, 3.4, 32), coinGold, COINS);
  const coinRims = new InstancedMesh(new TorusGeometry(9, 1.3, 8, 32), gold, COINS);
  const orbs = new InstancedMesh(new SphereGeometry(6, 20, 14), orbMaterial, ORBS);
  const orbit = Array.from({ length: COINS + ORBS }, (_, i) => ({
    a: (i < COINS ? i / COINS : (i - COINS) / ORBS) * Math.PI * 2 + random() * 0.3,
    reach: 0.92 + random() * 0.34,
    size: 0.7 + random() * 0.6,
    phase: random() * Math.PI * 2,
    depth: -30 - random() * 60,
  }));
  scene.add(coins, coinRims, orbs);

  /* ───────── rising dust and the winning sparkles ───────── */
  const points = (count: number, size: number, color: number) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
    const material = new PointsMaterial({ size, map: dot, color, transparent: true, depthWrite: false, blending: AdditiveBlending });
    const mesh = new Points(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, material, position: geometry.getAttribute("position") as BufferAttribute };
  };
  const DUST = 80;
  const dust = points(DUST, 7, 0xf3d98b);
  const motes = Array.from({ length: DUST }, () => ({ x: random() * 2 - 1, y: random(), s: 0.3 + random() * 0.7 }));
  const SPARKS = 90;
  const sparks = points(SPARKS, 13, 0xffe9ad);
  const rays3d = Array.from({ length: SPARKS }, () => ({ a: random() * Math.PI * 2, reach: 0.5 + random() * 0.9, delay: random() }));

  let width = 1;
  let height = 1;
  let centre = 0;
  let radius = RADIUS;
  let ratio = 1;
  return {
    setSize(w, h, centerY, r, pixelRatio) {
      width = w;
      height = h;
      centre = h / 2 - centerY;
      radius = r;
      ratio = pixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      // distance at which one world unit on z = 0 covers exactly one CSS pixel
      camera.position.set(0, 0, h / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      camera.updateProjectionMatrix();
      const k = r / RADIUS;
      sunburst.scale.setScalar(k);
      sunburst.position.y = centre;
      altar.scale.setScalar(k);
      // under the wheel, tipped towards the viewer so its top shows
      altar.position.set(0, centre - r * 1.03, 0);
      altar.rotation.x = 0.36;
      for (const { mesh, x } of pillars) {
        mesh.scale.set(r * 0.34, h * 1.05, 1);
        mesh.position.x = x * r;
        mesh.position.y = 0;
      }
    },
    render({ angle, time, glow, burst }) {
      const k = radius / RADIUS;
      sunburst.rotation.z = angle * 0.09;
      (sunburst.material as MeshBasicMaterial).opacity = Math.min(0.08 + glow * 0.22 + burst * 0.1, 0.5);
      pillars.forEach(({ mesh }, i) => {
        const pulse = 0.5 + 0.5 * Math.sin(time * 1.3 + angle * 0.8 + i * 1.7);
        (mesh.material as MeshBasicMaterial).opacity = Math.min(0.1 + glow * 0.2 + pulse * 0.14 * (0.4 + glow), 0.62);
      });
      altar.rotation.y = angle * 0.16;
      halo.position.y = 8 + Math.sin(time * 1.1) * 3 + burst * 14;
      halo.material.opacity = Math.min(0.3 + glow * 0.35, 0.85);
      gold.emissiveIntensity = 0.6 + glow * 0.7;
      coinGold.emissiveIntensity = 0.55 + glow * 0.65;
      orbMaterial.emissiveIntensity = 0.8 + glow * 0.6;
      warm.intensity = 0.4 + glow * 1.7;
      warm.position.set(0, centre - radius, 160);

      orbit.forEach((o, i) => {
        const isCoin = i < COINS;
        const a = o.a + angle * (isCoin ? 0.13 : -0.09);
        // a tall ellipse: the wheel covers the sides, so they show above, below and in the corners
        const reach = radius * (o.reach + burst * 0.1);
        dummy.position.set(Math.cos(a) * reach * 0.94, centre + Math.sin(a) * reach * 1.1 + Math.sin(time * 1.2 + o.phase) * 6, o.depth);
        dummy.scale.setScalar(k * o.size);
        if (isCoin) {
          dummy.rotation.set(Math.PI / 2 + Math.sin(angle * 0.5 + o.phase) * 0.5, 0, angle * 0.9 + o.phase);
          dummy.updateMatrix();
          coins.setMatrixAt(i, dummy.matrix);
          dummy.rotateX(Math.PI / 2); // the raised ring lies on the coin's face
          dummy.translateZ(2);
          dummy.updateMatrix();
          coinRims.setMatrixAt(i, dummy.matrix);
        } else {
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          orbs.setMatrixAt(i - COINS, dummy.matrix);
        }
      });
      coins.instanceMatrix.needsUpdate = coinRims.instanceMatrix.needsUpdate = orbs.instanceMatrix.needsUpdate = true;

      motes.forEach((m, i) => {
        const rise = (m.y + angle * 0.012 * m.s) % 1;
        dust.position.setXYZ(i, m.x * width * 0.5 + Math.sin(time * 0.7 + i) * 5, (rise - 0.5) * height, -20);
      });
      dust.position.needsUpdate = true;
      dust.material.opacity = Math.min(0.35 + glow * 0.35, 0.85);

      sparks.mesh.visible = burst > 0.02;
      if (sparks.mesh.visible) {
        rays3d.forEach((s, i) => {
          const p = (time * 0.55 + s.delay) % 1;
          const reach = radius * (0.65 + s.reach * (1 - (1 - p) * (1 - p)));
          // dimmer sparks shrink to the centre, behind the wheel, instead of popping out of view
          const live = p < burst ? reach : 0;
          sparks.position.setXYZ(i, Math.cos(s.a) * live, centre + Math.sin(s.a) * live - p * p * 26, -10);
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
