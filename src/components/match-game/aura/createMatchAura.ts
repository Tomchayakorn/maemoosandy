/**
 * The light behind the จับคู่ภาพเหมือน board, built entirely from code (no model, image or font files): a breathing violet-and-champagne aura,
 * three smooth oval rings with a light gliding along each, and gold dust drifting upwards (animated on the GPU). Decorative only.
 *
 * One world unit = one CSS pixel; the origin is the board's centre. No lights are needed (unlit, additive materials): 6 draw calls. Only this
 * module imports three.js; MatchAuraBackdrop loads it lazily.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  Group,
  Material,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { MOTES, rings } from "./layout";

/** Points round an oval: high enough that no corner shows. */
const ROUND = 180;

export type MatchAuraHandle = {
  /** Canvas size, CSS pixels (the canvas is centred on the board). */
  setSize(width: number, height: number, pixelRatio: number): void;
  render(time: number): void;
  stats(): { calls: number; triangles: number; pixelRatio: number };
  dispose(): void;
};

const RING_VERTEX = /* glsl */ `
  varying float vAlong;
  void main() {
    vAlong = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
// a soft light that travels round the oval, over a faint steady ring
const RING_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uBase;
  uniform float uShine;
  uniform float uPace;
  uniform float uPhase;
  varying float vAlong;
  void main() {
    float turn = fract(vAlong - uTime * uPace - uPhase);
    float glide = pow(0.5 + 0.5 * cos(turn * 6.28318530718), 10.0);
    gl_FragColor = vec4(uColor, uBase + glide * uShine);
  }
`;
const DUST_VERTEX = /* glsl */ `
  attribute float aSpeed;
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform float uHeight;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    float y = mod(position.y + uTime * aSpeed, uHeight) - uHeight * 0.5;
    float x = position.x + sin(uTime * 0.5 + aSeed * 6.0) * 5.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, 0.0, 1.0);
    gl_PointSize = aSize * uPixelRatio;
    // fades in and out at the top and bottom edges, and twinkles slowly
    float edge = smoothstep(0.0, 0.16, 0.5 - abs(y / uHeight));
    vAlpha = edge * (0.35 + 0.4 * sin(uTime * 1.3 + aSeed * 11.0));
  }
`;
const DUST_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(uColor, pow(1.0 - d, 1.7) * max(vAlpha, 0.0));
  }
`;

/** Throws when the browser cannot create a WebGL context (the page then simply has no backdrop). */
export function createMatchAura(canvas: HTMLCanvasElement): MatchAuraHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 10, 8000);

  const dotCanvas = document.createElement("canvas");
  dotCanvas.width = dotCanvas.height = 128;
  const c = dotCanvas.getContext("2d");
  if (c) {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [stop, alpha] of [[0, 1], [0.35, 0.72], [0.62, 0.38], [0.82, 0.1], [1, 0]]) g.addColorStop(stop, `rgba(255,255,255,${alpha})`);
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  }
  const dot = new CanvasTexture(dotCanvas);
  dot.colorSpace = SRGBColorSpace;

  const world = new Group();
  scene.add(world);
  const animate: ((time: number) => void)[] = [];
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const keep = <G extends BufferGeometry>(g: G) => (geometries.push(g), g);
  const own = <M extends Material>(m: M) => (materials.push(m), m);
  let seed = 2611;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  const build = (width: number, height: number, pixelRatio: number) => {
    /* aura: a wide violet glow and a smaller champagne heart, both ending inside the canvas */
    const glow = (color: number, opacity: number, sx: number, sy: number, y: number, pace: number) => {
      const material = own(new SpriteMaterial({ map: dot, color, opacity, transparent: true, depthWrite: false, blending: AdditiveBlending }));
      const sprite = new Sprite(material);
      sprite.position.set(0, y, -4);
      world.add(sprite);
      animate.push((time) => {
        const breath = Math.sin(time * pace);
        material.opacity = opacity * (1 + breath * 0.12);
        sprite.scale.set(sx * (0.98 + breath * 0.02), sy * (0.98 + breath * 0.02), 1);
      });
    };
    glow(0x7c3aed, 0.36, width, height, 0, 0.7);
    glow(0xf3c969, 0.13, width * 0.86, height * 0.62, height * 0.12, 0.52);

    /* three smooth oval rings */
    for (const ring of rings(width, height)) {
      const points = Array.from({ length: 64 }, (_, i) => {
        const a = (i / 64) * Math.PI * 2;
        return new Vector3(Math.cos(a) * ring.rx, Math.sin(a) * ring.ry, 0);
      });
      const geometry = keep(new TubeGeometry(new CatmullRomCurve3(points, true), ROUND, ring.tube, 6, true));
      const material = own(
        new ShaderMaterial({
          vertexShader: RING_VERTEX,
          fragmentShader: RING_FRAGMENT,
          uniforms: {
            uColor: { value: new Color(ring.color) },
            uTime: { value: 0 },
            uBase: { value: ring.base },
            uShine: { value: ring.shine },
            uPace: { value: ring.pace },
            uPhase: { value: ring.phase },
          },
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      );
      world.add(new Mesh(geometry, material));
      animate.push((time) => {
        material.uniforms.uTime.value = time;
      });
    }

    /* gold dust drifting up */
    const position = new Float32Array(MOTES * 3);
    const speed = new Float32Array(MOTES);
    const size = new Float32Array(MOTES);
    const phase = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      position[i * 3] = (random() - 0.5) * (width - 12);
      position[i * 3 + 1] = random() * height;
      speed[i] = 4 + random() * 11;
      size[i] = 2.5 + random() * 5;
      phase[i] = random();
    }
    const geometry = keep(new BufferGeometry());
    geometry.setAttribute("position", new BufferAttribute(position, 3));
    geometry.setAttribute("aSpeed", new BufferAttribute(speed, 1));
    geometry.setAttribute("aSize", new BufferAttribute(size, 1));
    geometry.setAttribute("aSeed", new BufferAttribute(phase, 1));
    const dust = own(
      new ShaderMaterial({
        vertexShader: DUST_VERTEX,
        fragmentShader: DUST_FRAGMENT,
        uniforms: { uTime: { value: 0 }, uHeight: { value: height }, uPixelRatio: { value: pixelRatio }, uColor: { value: new Color(0xffe0a0) } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    const cloud = new Points(geometry, dust);
    cloud.frustumCulled = false;
    world.add(cloud);
    animate.push((time) => {
      dust.uniforms.uTime.value = time;
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
    setSize(width, height, pixelRatio) {
      ratio = pixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      // distance at which one world unit on z = 0 covers exactly one CSS pixel
      camera.position.set(0, 0, height / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      camera.updateProjectionMatrix();
      const shape = [width, height, pixelRatio * 100].map(Math.round).join("x");
      if (built !== shape) {
        built = shape;
        clear();
        seed = 2611;
        build(width, height, pixelRatio);
      }
    },
    render(time) {
      for (const step of animate) step(time);
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
