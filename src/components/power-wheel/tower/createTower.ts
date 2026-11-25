/**
 * The power tower behind วงล้อไต่ชั้น, built entirely from code (no model, image or font files): twelve round rings climbing from the foot of
 * the screen to the wheel that light gold as levels are cleared, round rings around the wheel — each with a soft halo and an arc of light
 * gliding along it — violet and gold light, and motes of power rising (animated on the GPU, dimmed over the middle). Decorative only.
 *
 * One world unit = one CSS pixel on the z = 0 plane. No lights are needed (unlit, additive materials). Only this module imports three.js;
 * TowerBackdrop loads it lazily.
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
import { layout, tierFill } from "./mood";

const GOLD = 0xf0c75a;
const GOLD_LIGHT = 0xffe6a3;
const VIOLET = 0x8b5cf6;
const MOTES = 120;

export type TowerFrame = { angle: number; time: number; energy: number; boost: number };

export type TowerHandle = {
  setSize(width: number, height: number, wheel: { centre: number; radius: number }, pixelRatio: number): void;
  render(frame: TowerFrame): void;
  stats(): { calls: number; triangles: number; pixelRatio: number };
  dispose(): void;
};

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aSpeed;
  attribute float aPhase;
  attribute float aRank;
  uniform float uRise;
  uniform float uTime;
  uniform float uHeight;
  uniform float uEnergy;
  uniform float uBoost;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vGold;
  void main() {
    vec3 p = position;
    p.y = mod(p.y + uRise * aSpeed + uHeight * 0.5, uHeight) - uHeight * 0.5;
    p.x += sin(uTime * 0.5 + aPhase) * 12.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    // more power, more motes: each one appears once the stored energy passes its rank
    float present = smoothstep(aRank - 0.08, aRank, 0.35 + uEnergy * 0.65 + uBoost * 0.3);
    gl_PointSize = aSize * uPixelRatio * (1.0 + uBoost * 0.25);
    vec2 ndc = gl_Position.xy / gl_Position.w;
    float calm = mix(0.35, 1.0, smoothstep(0.25, 0.9, length(ndc * vec2(1.0, 0.85))));
    float edge = 1.0 - smoothstep(0.88, 1.0, abs(ndc.y));
    vAlpha = present * calm * edge * (0.6 + 0.4 * sin(uTime * 1.3 + aPhase * 3.0));
    vGold = step(fract(aPhase * 1.7), 0.35 + uEnergy * 0.55);
  }
`;
const FRAGMENT = /* glsl */ `
  uniform vec3 uGold;
  uniform vec3 uViolet;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vGold;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(mix(uViolet, uGold, vGold), pow(1.0 - d, 1.7) * vAlpha * uOpacity);
  }
`;

/** Points round a full circle: high enough that no corner shows even on the widest ring. */
const ROUND = 160;
const circle = (radius: number, tube: number) => new TorusGeometry(radius, tube, 6, ROUND);

/** Part of a circle whose light fades to nothing at both ends (vertex colours; with additive blending black is invisible). */
function glidingArc(radius: number, tube: number, sweep: number) {
  const geometry = new TorusGeometry(radius, tube, 6, 72, sweep);
  const uv = geometry.getAttribute("uv");
  const colors = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) colors.fill(Math.sin(Math.PI * uv.getX(i)) ** 2, i * 3, i * 3 + 3);
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  return geometry;
}

/** Throws when the browser cannot create a WebGL context (the page then keeps the painted backdrop only). */
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
    for (const [stop, alpha] of [[0, 1], [0.22, 0.65], [0.5, 0.24], [0.75, 0.06], [1, 0]]) g.addColorStop(stop, `rgba(255,255,255,${alpha})`);
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

  const build = (width: number, height: number, wheel: { centre: number; radius: number }, pixelRatio: number) => {
    const at = layout(width, height, wheel);
    const light = (color: number, opacity: number, vertexColors = false) =>
      own(new MeshBasicMaterial({ color, transparent: true, opacity, vertexColors, depthWrite: false, blending: AdditiveBlending }));
    const glow = (color: number, size: number, y: number, opacity: number) => {
      const material = own(new SpriteMaterial({ map: dot, color, opacity, transparent: true, depthWrite: false, blending: AdditiveBlending }));
      const sprite = new Sprite(material);
      sprite.scale.setScalar(size);
      sprite.position.set(0, y, -200);
      world.add(sprite);
      return { sprite, material };
    };

    /* light: a violet pool round the wheel and a golden heart that grows with the stored power */
    const violet = glow(VIOLET, Math.min(width, 720) * 1.5, at.halo.y, 0.2);
    const gold = glow(GOLD, Math.min(width, 640), at.halo.y, 0.05);
    const base = glow(0x6d28d9, Math.min(width, 640) * 1.2, -height * 0.42, 0.22);
    animate.push((f) => {
      const breath = 1 + Math.sin(f.time * 0.8) * 0.05;
      violet.material.opacity = (0.16 + f.energy * 0.1 + f.boost * 0.1) * breath;
      gold.material.opacity = 0.03 + f.energy * 0.2 + f.boost * 0.08;
      gold.sprite.scale.setScalar(Math.min(width, 640) * (0.75 + f.energy * 0.45) * breath);
      base.material.opacity = 0.18 + f.energy * 0.12;
    });

    /* the tower: twelve round rings; a cleared level turns gold, the next one breathes */
    at.tiers.forEach((tier, i) => {
      const material = light(VIOLET, 0.1);
      const softMaterial = light(VIOLET, 0.03);
      const shineMaterial = light(VIOLET, 0.2, true);
      const plate = new Group();
      plate.position.set(0, tier.y, -40);
      plate.rotation.order = "XZY";
      plate.rotation.x = -1.4; // seen from slightly above: a flat plate of light
      const ring = new Mesh(keep(circle(tier.radius, 0.9)), material);
      const soft = new Mesh(keep(circle(tier.radius, 4.5)), softMaterial);
      const shine = new Mesh(keep(glidingArc(tier.radius, 1.8, Math.PI * 0.75)), shineMaterial);
      plate.add(soft, ring, shine);
      world.add(plate);
      const dim = new Color(VIOLET);
      const lit = new Color(GOLD);
      animate.push((f) => {
        const fill = tierFill(i, f.energy);
        const next = fill === 0 && tierFill(i - 1, f.energy) >= 0.999 ? 1 : i === 0 && f.energy === 0 ? 1 : 0;
        const pulse = 0.5 + 0.5 * Math.sin(f.time * 2.4);
        const strength = 0.1 + fill * 0.22 + next * pulse * 0.14 + f.boost * 0.06;
        material.color.copy(dim).lerp(lit, fill);
        softMaterial.color.copy(material.color);
        shineMaterial.color.copy(material.color);
        material.opacity = strength;
        softMaterial.opacity = strength * 0.22;
        shineMaterial.opacity = Math.min(strength * 1.4, 0.55);
        shine.rotation.z = f.angle * (i % 2 ? -0.45 : 0.45) + i * 1.1;
        // a swell runs up the tower while the wheel turns
        plate.scale.setScalar(1 + f.boost * 0.025 * Math.sin(f.time * 6 - i * 0.6));
      });
    });

    /* round rings around the wheel's resting place */
    at.halo.radii.forEach((radius, i) => {
      const color = i === 1 ? VIOLET : GOLD_LIGHT;
      const material = light(color, 0.16);
      const softMaterial = light(color, 0.04);
      const shineMaterial = light(color, 0.3, true);
      const group = new Group();
      group.position.set(0, at.halo.y, -30 - i * 12);
      const ring = new Mesh(keep(circle(radius, i === 1 ? 1.2 : 0.7)), material);
      const soft = new Mesh(keep(circle(radius, i === 1 ? 6 : 4)), softMaterial);
      const shine = new Mesh(keep(glidingArc(radius, i === 1 ? 2.2 : 1.5, Math.PI * (i === 2 ? 0.55 : 0.85))), shineMaterial);
      group.add(soft, ring, shine);
      world.add(group);
      animate.push((f) => {
        const strength = Math.min([0.14, 0.17, 0.08][i] + f.energy * 0.17 + f.boost * 0.17, 0.5);
        material.opacity = strength;
        softMaterial.opacity = strength * 0.24;
        shineMaterial.opacity = Math.min(strength * 1.8, 0.75);
        shine.rotation.z = f.angle * [0.5, -0.34, 0.22][i] + i * 2.1;
      });
    });

    /* motes of power */
    const position = new Float32Array(MOTES * 3);
    const size = new Float32Array(MOTES);
    const speed = new Float32Array(MOTES);
    const phase = new Float32Array(MOTES);
    const rank = new Float32Array(MOTES);
    const spread = Math.min(width, 720) - 16;
    for (let i = 0; i < MOTES; i++) {
      position.set([(random() - 0.5) * spread, (random() - 0.5) * height, -60 * random()], i * 3);
      size[i] = 3 + random() * 7;
      speed[i] = 0.5 + random();
      phase[i] = random() * Math.PI * 2;
      rank[i] = random();
    }
    const geometry = keep(new BufferGeometry());
    geometry.setAttribute("position", new BufferAttribute(position, 3));
    geometry.setAttribute("aSize", new BufferAttribute(size, 1));
    geometry.setAttribute("aSpeed", new BufferAttribute(speed, 1));
    geometry.setAttribute("aPhase", new BufferAttribute(phase, 1));
    geometry.setAttribute("aRank", new BufferAttribute(rank, 1));
    const motes = own(
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uRise: { value: 0 },
          uTime: { value: 0 },
          uHeight: { value: height * 1.06 },
          uEnergy: { value: 0 },
          uBoost: { value: 0 },
          uPixelRatio: { value: pixelRatio },
          uGold: { value: new Color(0xffd76a) },
          uViolet: { value: new Color(0xb79bff) },
          uOpacity: { value: 0.9 },
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
      motes.uniforms.uRise.value = f.angle * 14; // follows the accumulated pace, so a change of speed never makes the motes jump
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
    setSize(width, height, wheel, pixelRatio) {
      ratio = pixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      // distance at which one world unit on z = 0 covers exactly one CSS pixel
      camera.position.set(0, 0, height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      camera.updateProjectionMatrix();
      const shape = [width, height, wheel.centre, wheel.radius, pixelRatio * 100].map(Math.round).join("x");
      if (built !== shape) {
        built = shape;
        clear();
        seed = 1212;
        build(width, height, wheel, pixelRatio);
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
