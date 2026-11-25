/**
 * ดวงดี มีเฮ's backdrop, built entirely from code (no model, image or font files): breathing violet-and-gold auras, faint halos at the top and
 * bottom, twinkling gold dust drifting upwards (animated on the GPU, dimmed over the middle of the screen) and a few tumbling gold flakes.
 * Decorative only; it knows nothing about the game.
 *
 * One world unit = one CSS pixel on the z = 0 plane. Budget: 2 lights, ~13 draw calls. Only this module imports three.js; AuraBackdrop loads
 * it lazily.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
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
import { composition, type Speck } from "./layout";

export type AuraHandle = {
  setSize(width: number, height: number, pixelRatio: number): void;
  /** Draw the scene at time `time` (seconds). */
  render(time: number): void;
  stats(): { calls: number; triangles: number; pixelRatio: number };
  dispose(): void;
};

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aSpeed;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uHeight;
  uniform float uPixelRatio;
  uniform float uCameraZ;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    // drift upwards and wrap round; sway a little sideways
    p.y = mod(p.y + uTime * aSpeed + uHeight * 0.5, uHeight) - uHeight * 0.5;
    p.x += sin(uTime * 0.28 + aPhase) * 9.0;
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = aSize * uPixelRatio * (uCameraZ / -view.z);
    vec2 ndc = gl_Position.xy / gl_Position.w;
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.6 + fract(aPhase) * 0.9) + aPhase * 3.0);
    // quiet over the middle, where the cards and text are; fade before wrapping at the top and bottom
    float calm = mix(0.28, 1.0, smoothstep(0.3, 0.95, length(ndc * vec2(1.0, 0.9))));
    float edge = 1.0 - smoothstep(0.9, 1.0, abs(ndc.y));
    vAlpha = twinkle * calm * edge;
    vColor = aColor;
  }
`;
const FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform float uSoft;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float glow = pow(1.0 - d, uSoft);
    gl_FragColor = vec4(vColor, glow * vAlpha * uOpacity);
  }
`;

/** Throws when the browser cannot create a WebGL context (the page then keeps the painted sky only). */
export function createAura(canvas: HTMLCanvasElement): AuraHandle {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 10, 8000);

  const dotCanvas = document.createElement("canvas");
  dotCanvas.width = dotCanvas.height = 128;
  const c = dotCanvas.getContext("2d");
  if (c) {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    // a long, gentle fall-off so no aura shows an edge
    for (const [stop, alpha] of [[0, 1], [0.2, 0.68], [0.45, 0.3], [0.7, 0.09], [1, 0]]) g.addColorStop(stop, `rgba(255,255,255,${alpha})`);
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  }
  const dot = new CanvasTexture(dotCanvas);
  dot.colorSpace = SRGBColorSpace;

  scene.add(new HemisphereLight(0xfff0c8, 0x2a1055, 1.6));
  const key = new DirectionalLight(0xffe6b8, 1.8);
  key.position.set(-200, 280, 400);
  scene.add(key);

  /* ───────── built (and rebuilt) to the screen's shape ───────── */
  const world = new Group();
  scene.add(world);
  const animate: ((t: number) => void)[] = [];
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const keep = <G extends BufferGeometry>(g: G) => (geometries.push(g), g);
  const own = <M extends Material>(m: M) => (materials.push(m), m);

  const build = (width: number, height: number, pixelRatio: number, cameraZ: number) => {
    const at = composition(width, height);

    at.auras.forEach((a) => {
      const material = own(new SpriteMaterial({ map: dot, color: a.color, opacity: a.opacity, transparent: true, depthWrite: false, blending: AdditiveBlending }));
      const sprite = new Sprite(material);
      sprite.position.set(a.x, a.y, -260);
      world.add(sprite);
      animate.push((t) => {
        const breath = Math.sin(t * 0.32 + a.phase);
        // the sprite sits behind the z = 0 plane: scale it up so it covers the intended size on screen
        const size = a.size * ((cameraZ + 260) / cameraZ) * (1 + breath * 0.07);
        sprite.scale.setScalar(size);
        sprite.position.x = a.x + Math.sin(t * 0.11 + a.phase) * width * 0.04;
        sprite.position.y = a.y + Math.cos(t * 0.09 + a.phase) * height * 0.025;
        material.opacity = a.opacity * (1 + breath * 0.16);
      });
    });

    at.arcs.forEach((a, i) => {
      const material = own(new MeshBasicMaterial({ color: a.color, transparent: true, opacity: a.opacity, depthWrite: false, blending: AdditiveBlending }));
      const mesh = new Mesh(keep(new TorusGeometry(a.radius, a.width, 6, 160, a.sweep * Math.PI)), material);
      mesh.position.set(0, a.y, -4);
      world.add(mesh);
      animate.push((t) => {
        // sway to and fro rather than spin, so the halo never leaves its band of the screen
        mesh.rotation.z = a.from * Math.PI + Math.sin(t * Math.abs(a.spin) * 4 + i) * a.spin * 5;
        material.opacity = a.opacity * (0.75 + 0.25 * Math.sin(t * 0.5 + i * 1.3));
      });
    });

    const warm = new Color(0xffd76a);
    const pale = new Color(0xfff2c9);
    const violet = new Color(0xb79bff);
    const cloud = (specks: Speck[], opacity: number, soft: number) => {
      const n = specks.length;
      const position = new Float32Array(n * 3);
      const color = new Float32Array(n * 3);
      const size = new Float32Array(n);
      const speed = new Float32Array(n);
      const phase = new Float32Array(n);
      specks.forEach((s, i) => {
        position.set([s.x, s.y, s.z], i * 3);
        const tint = s.gold < 0.55 ? warm : s.gold < 0.82 ? pale : violet;
        color.set([tint.r, tint.g, tint.b], i * 3);
        size[i] = s.size;
        speed[i] = s.speed;
        phase[i] = s.phase;
      });
      const geometry = keep(new BufferGeometry());
      geometry.setAttribute("position", new BufferAttribute(position, 3));
      geometry.setAttribute("aColor", new BufferAttribute(color, 3));
      geometry.setAttribute("aSize", new BufferAttribute(size, 1));
      geometry.setAttribute("aSpeed", new BufferAttribute(speed, 1));
      geometry.setAttribute("aPhase", new BufferAttribute(phase, 1));
      const material = own(
        new ShaderMaterial({
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          uniforms: {
            uTime: { value: 0 },
            uHeight: { value: height * 1.06 },
            uPixelRatio: { value: pixelRatio },
            uCameraZ: { value: cameraZ },
            uOpacity: { value: opacity },
            uSoft: { value: soft },
          },
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      );
      const points = new Points(geometry, material);
      points.frustumCulled = false;
      world.add(points);
      animate.push((t) => {
        material.uniforms.uTime.value = t;
      });
    };
    cloud(at.bokeh, 0.2, 1.1);
    cloud(at.dust, 0.95, 1.8);

    const gold = own(new MeshStandardMaterial({ color: 0xe9c35a, metalness: 0.55, roughness: 0.25, emissive: 0x7a5608, flatShading: true }));
    const flakes = new InstancedMesh(keep(new OctahedronGeometry(1)), gold, at.flakes.length);
    const dummy = new Object3D();
    world.add(flakes);
    animate.push((t) => {
      at.flakes.forEach((f, i) => {
        dummy.position.set(f.x, f.y + Math.sin(t * 0.5 + f.phase) * 7, f.z);
        dummy.rotation.set(t * 0.4 + f.phase, t * 0.6 + f.phase * 2, f.phase);
        dummy.scale.set(f.size, f.size * 1.5, f.size * 0.35);
        dummy.updateMatrix();
        flakes.setMatrixAt(i, dummy.matrix);
      });
      flakes.instanceMatrix.needsUpdate = true;
    });
  };

  const clear = () => {
    for (const child of world.children) if (child instanceof InstancedMesh) child.dispose();
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
      const cameraZ = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
      camera.position.set(0, 0, cameraZ);
      camera.updateProjectionMatrix();
      if (built !== `${width}x${height}@${pixelRatio}`) {
        built = `${width}x${height}@${pixelRatio}`;
        clear();
        build(width, height, pixelRatio, cameraZ);
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
