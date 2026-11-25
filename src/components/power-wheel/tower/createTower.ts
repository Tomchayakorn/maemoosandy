/**
 * The power rings behind วงล้อไต่ชั้น, built entirely from code (no model, image or font files), all centred on the wheel: violet and gold
 * light, a twelve-part level meter around the wheel that turns gold as levels are cleared, two round rings with arcs of light gliding along
 * them, a pulse while the wheel turns and motes of power in orbit (animated on the GPU). Decorative only.
 *
 * One world unit = one CSS pixel; the origin is the wheel's centre. No lights are needed (unlit, additive materials). Only this module imports
 * three.js; TowerBackdrop loads it lazily.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
} from "three";
import { LEVELS, rings, segment, tierFill } from "./mood";

const GOLD = 0xf0c75a;
const GOLD_LIGHT = 0xffe6a3;
const VIOLET = 0x8b5cf6;
const MOTES = 70;
/** Points round a full circle: high enough that no corner shows. */
const ROUND = 160;

export type TowerFrame = { angle: number; time: number; energy: number; boost: number };

export type TowerHandle = {
  /** Canvas size and the width of the wheel box (the canvas is centred on it), CSS pixels. */
  setSize(width: number, height: number, wheelSize: number, pixelRatio: number): void;
  render(frame: TowerFrame): void;
  stats(): { calls: number; triangles: number; pixelRatio: number };
  dispose(): void;
};

const VERTEX = /* glsl */ `
  attribute float aRadius;
  attribute float aStart;
  attribute float aSpeed;
  attribute float aSize;
  attribute float aRank;
  uniform float uAngle;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uBoost;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vGold;
  void main() {
    float a = aStart + uAngle * aSpeed;
    float r = aRadius + sin(uTime * 1.1 + aStart * 5.0) * 1.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(cos(a) * r, sin(a) * r, 0.0, 1.0);
    // more power, more motes: each one appears once the stored energy passes its rank
    float present = smoothstep(aRank - 0.08, aRank, 0.35 + uEnergy * 0.65 + uBoost * 0.3);
    gl_PointSize = aSize * uPixelRatio * (1.0 + uBoost * 0.3);
    vAlpha = present * (0.55 + 0.45 * sin(uTime * 1.6 + aStart * 9.0));
    vGold = step(fract(aStart * 1.7), 0.35 + uEnergy * 0.55);
  }
`;
const FRAGMENT = /* glsl */ `
  uniform vec3 uGold;
  uniform vec3 uViolet;
  varying float vAlpha;
  varying float vGold;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(mix(uViolet, uGold, vGold), pow(1.0 - d, 1.7) * vAlpha);
  }
`;

/** Part of a circle whose light fades to nothing at both ends (vertex colours; with additive blending black is invisible). */
function glidingArc(radius: number, tube: number, sweep: number) {
  const geometry = new TorusGeometry(radius, tube, 6, 72, sweep);
  const uv = geometry.getAttribute("uv");
  const colors = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) colors.fill(Math.sin(Math.PI * uv.getX(i)) ** 2, i * 3, i * 3 + 3);
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return geometry;
}

/** Throws when the browser cannot create a WebGL context (the page then simply has no rings). */
export function createTower(canvas: HTMLCanvasElement): TowerHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 10, 8000);

  const dotCanvas = document.createElement("canvas");
  dotCanvas.width = dotCanvas.height = 128;
  const c = dotCanvas.getContext("2d");
  if (c) {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [stop, alpha] of [[0, 1], [0.35, 0.75], [0.62, 0.42], [0.82, 0.12], [1, 0]]) g.addColorStop(stop, `rgba(255,255,255,${alpha})`);
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  }
  const dot = new CanvasTexture(dotCanvas);
  dot.colorSpace = SRGBColorSpace;

  const world = new Group();
  scene.add(world);
  const animate: ((f: TowerFrame) => void)[] = [];
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const keep = <G extends BufferGeometry>(g: G) => (geometries.push(g), g);
  const own = <M extends Material>(m: M) => (materials.push(m), m);
  let seed = 1212;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  const build = (width: number, height: number, wheelSize: number, pixelRatio: number) => {
    const at = rings(wheelSize);
    const light = (color: number, opacity: number, vertexColors = false) =>
      own(new MeshBasicMaterial({ color, transparent: true, opacity, vertexColors, depthWrite: false, blending: AdditiveBlending }));
    const add = (geometry: BufferGeometry, material: Material, z = 0) => {
      const mesh = new Mesh(keep(geometry), material);
      mesh.position.z = z;
      world.add(mesh);
      return mesh;
    };

    /* aura: violet light round the wheel, a golden heart that grows with the stored power; both end inside the canvas */
    const aura = Math.min(width, height);
    const glow = (color: number) => {
      const material = own(new SpriteMaterial({ map: dot, color, transparent: true, depthWrite: false, blending: AdditiveBlending }));
      const sprite = new Sprite(material);
      sprite.scale.setScalar(aura);
      world.add(sprite);
      return { sprite, material };
    };
    const violet = glow(VIOLET);
    const gold = glow(0xffc861);
    animate.push((f) => {
      const breath = Math.sin(f.time * 0.9);
      violet.material.opacity = 0.3 + f.energy * 0.08 + f.boost * 0.12 + breath * 0.025;
      violet.sprite.scale.setScalar(aura * (0.98 + breath * 0.02));
      gold.material.opacity = 0.03 + f.energy * 0.2 + f.boost * 0.07;
      gold.sprite.scale.setScalar(aura * (0.86 + f.energy * 0.12 + breath * 0.015));
    });

    /* the level meter: twelve parts around the wheel; a cleared level turns gold, the next one breathes */
    const dim = new Color(VIOLET);
    const lit = new Color(GOLD);
    for (let i = 0; i < LEVELS; i++) {
      const part = segment(i);
      const material = light(VIOLET, 0.2);
      const soft = light(VIOLET, 0.06);
      add(new TorusGeometry(at.meter, 2, 8, 28, part.sweep), material).rotation.z = part.start;
      add(new TorusGeometry(at.meter, 4.6, 6, 28, part.sweep), soft).rotation.z = part.start;
      animate.push((f) => {
        const fill = tierFill(i, f.energy);
        const next = fill === 0 && (i === 0 ? f.energy === 0 : tierFill(i - 1, f.energy) >= 0.999);
        const pulse = next ? 0.5 + 0.5 * Math.sin(f.time * 2.6) : 0;
        material.color.copy(dim).lerp(lit, fill);
        soft.color.copy(material.color);
        material.opacity = Math.min(0.24 + fill * 0.7 + pulse * 0.35 + f.boost * 0.08, 0.95);
        soft.opacity = 0.04 + fill * 0.24 + pulse * 0.12;
      });
    }

    /* two round rings, each with an arc of light gliding along it */
    (
      [
        [at.hairline, GOLD_LIGHT, 0.7, 0.55, Math.PI * 0.6],
        [at.outer, VIOLET, 0.8, -0.38, Math.PI * 0.8],
      ] as const
    ).forEach(([radius, color, tube, pace, sweep], i) => {
      const material = light(color, 0.14);
      const shine = light(color, 0.4, true);
      add(new TorusGeometry(radius, tube, 6, ROUND), material, -2);
      const arc = add(glidingArc(radius, tube * 2, sweep), shine, -1);
      animate.push((f) => {
        const strength = 0.12 + f.energy * 0.16 + f.boost * 0.18;
        material.opacity = strength;
        shine.opacity = Math.min(strength * 2.4, 0.8);
        arc.rotation.z = f.angle * pace + i * 2.4;
      });
    });

    /* while the wheel turns, a ring of light runs outwards */
    const ripple = light(GOLD_LIGHT, 0);
    const wave = add(new TorusGeometry(1, 0.008, 6, ROUND), ripple, -3);
    animate.push((f) => {
      const p = (f.time * 0.9) % 1;
      wave.visible = f.boost > 0.02;
      wave.scale.setScalar(at.rim + (at.reach - at.rim) * p);
      ripple.opacity = f.boost * Math.sin(Math.PI * p) * 0.5;
    });

    /* motes of power in orbit just outside the rim */
    const radius = new Float32Array(MOTES);
    const start = new Float32Array(MOTES);
    const speed = new Float32Array(MOTES);
    const size = new Float32Array(MOTES);
    const rank = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      radius[i] = at.rim + random() * (at.reach - at.rim - 3);
      start[i] = random() * Math.PI * 2;
      speed[i] = (random() < 0.5 ? -1 : 1) * (0.08 + random() * 0.22);
      size[i] = 3 + random() * 5;
      rank[i] = random();
    }
    const geometry = keep(new BufferGeometry());
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(MOTES * 3), 3));
    geometry.setAttribute("aRadius", new BufferAttribute(radius, 1));
    geometry.setAttribute("aStart", new BufferAttribute(start, 1));
    geometry.setAttribute("aSpeed", new BufferAttribute(speed, 1));
    geometry.setAttribute("aSize", new BufferAttribute(size, 1));
    geometry.setAttribute("aRank", new BufferAttribute(rank, 1));
    const motes = own(
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uAngle: { value: 0 },
          uTime: { value: 0 },
          uEnergy: { value: 0 },
          uBoost: { value: 0 },
          uPixelRatio: { value: pixelRatio },
          uGold: { value: new Color(0xffd76a) },
          uViolet: { value: new Color(0xb79bff) },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    const cloud = new Points(geometry, motes);
    cloud.frustumCulled = false;
    world.add(cloud);
    animate.push((f) => {
      motes.uniforms.uAngle.value = f.angle; // the accumulated pace, so a change of speed never makes the motes jump
      motes.uniforms.uTime.value = f.time;
      motes.uniforms.uEnergy.value = f.energy;
      motes.uniforms.uBoost.value = f.boost;
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
    setSize(width, height, wheelSize, pixelRatio) {
      ratio = pixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      // distance at which one world unit on z = 0 covers exactly one CSS pixel
      camera.position.set(0, 0, height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      camera.updateProjectionMatrix();
      const shape = [width, height, wheelSize, pixelRatio * 100].map(Math.round).join("x");
      if (built !== shape) {
        built = shape;
        clear();
        seed = 1212;
        build(width, height, wheelSize, pixelRatio);
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
