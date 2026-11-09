// The Home intro, in three.js. Two small scenes on two canvases, each drawn only while its section is on screen:
//   A  trailer + hero: a glass coin flies in, frost stops it, it cracks and shatters into 24 shards that hang in the air;
//      Ctrl+Z (keys or the real keyboard) flies the shards home and the coin leaves for its wallet.
//   B  the PANIC rig: frosted ice plinth, steel collar, red dome; it pulses during a theft and sinks when pressed.
// Weight budget (the v4 prototype was too heavy): no transmission pass, pixel ratio capped at 1.25 (1 on phones,
// and lowered further while frames run slow), no antialias on phones, text stays HTML (sharp), no backdrop blur over
// the canvas. The loop only runs while one of the two sections is on screen, and it never reads layout per frame.
// Everything here is decoration: it never touches the chain, and nothing claims to be a real transfer.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type RigFx = { armed: boolean; press: number; frozen: number; burst: number };
export type IntroCopy = { capIdle: string; capDone: string; clockRun: string; clockFrozen: string };
export type IntroEls = {
  trailer: HTMLElement;
  panic: HTMLElement;
  canvasA: HTMLCanvasElement;
  canvasB: HTMLCanvasElement;
  lines: HTMLElement[]; // three trailer lines
  hero: HTMLElement; // hero headline
  heroUi: HTMLElement; // keys + caption + CTA
  keyC: HTMLElement;
  keyZ: HTMLElement;
  cap: HTMLElement;
  toast: HTMLElement;
  clock: HTMLElement;
  clockT: HTMLElement;
  clockS: HTMLElement;
  frost: HTMLElement;
  fog: HTMLElement;
  skip: HTMLElement;
};
export type IntroApi = { undo: () => void; skip: () => void; stop: () => void };

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const band = (x: number, a: number, b: number, c: number, d: number) => ss(a, b, x) * (1 - ss(c, d, x));
const fmt = (s: number) => {
  const v = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOISE = `
  float h3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int k = 0; k < 4; k++){ s += a*vn(p); p *= 2.03; a *= 0.5; } return s; }`;

/** Frost grows from the rim inward as uFrost goes 0 -> 1: the glass whitens, roughens and gets frost veins. */
function frosted<M extends THREE.MeshPhysicalMaterial>(mat: M, U: { value: number }, frostTex: THREE.Texture | null, span: number): M {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFrost = U;
    sh.uniforms.uFrostTex = { value: frostTex };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aCoin;\nvarying vec3 vCoin;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCoin = aCoin;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uFrost;\nuniform sampler2D uFrostTex;\nvarying vec3 vCoin;\n${NOISE}\nfloat fm; float vein;`)
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float fN = fbm(vCoin*2.4 + 3.1);
        float rr = length(vCoin.xy) / ${span.toFixed(2)};
        float th = mix(1.55, -0.3, uFrost);
        fm = smoothstep(th, th + 0.12, rr*0.8 + fN*0.6);
        ${frostTex ? "vein = dot(texture2D(uFrostTex, vCoin.xy*0.31 + 0.5).rgb, vec3(0.333));" : "vein = pow(1.0 - abs(vn(vCoin*9.0)*2.0 - 1.0), 5.0);"}
        vein = clamp(vein*1.5, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.55,0.75,0.9), vec3(1.0), vein), fm*(0.45 + vein*0.5));`,
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55 - vein*0.3, fm);")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.35, 0.75, 1.0) * fm * vein * 0.2;");
  };
  return mat;
}

/** Dark smoked glass: no transmission pass (too heavy); it reads as glass through clearcoat reflections and the glowing engraving. */
const darkGlass = (o: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({
    color: 0x0d1820,
    metalness: 0.1,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.6,
    ...o,
  });

function makeRenderer(canvas: HTMLCanvasElement, mobile: boolean) {
  // Phones: 1x pixels and no MSAA (a 3x screen at 1.5x was four times the pixels of a laptop). See govern() for the rest.
  const r = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: "high-performance" });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.25));
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.outputColorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(r);
  const env = pm.fromScene(new RoomEnvironment(), 0.03).texture;
  pm.dispose();
  return { r, env };
}

/** Frozen smoke: billboarded noise puffs, fully driven by a time value so scrolling back plays it backwards. */
function puffTexture() {
  const N = 128,
    c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!,
    r2 = rng(5);
  const G = 17,
    grid = Array.from({ length: G * G }, () => r2());
  const vn = (x: number, y: number) => {
    const xi = Math.floor(x),
      yi = Math.floor(y),
      xf = x - xi,
      yf = y - yi,
      sx = xf * xf * (3 - 2 * xf),
      sy = yf * yf * (3 - 2 * yf);
    const at = (i: number, j: number) => grid[(((j % G) + G) % G) * G + (((i % G) + G) % G)];
    return (at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx) * (1 - sy) + (at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx) * sy;
  };
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let s = 0,
        a = 0.5,
        f = 4 / N;
      for (let o = 0; o < 5; o++) {
        s += a * vn(x * f + o * 3.7, y * f + o * 1.9);
        f *= 2;
        a *= 0.5;
      }
      const dx = (x - N / 2) / (N / 2),
        dy = (y - N / 2) / (N / 2),
        fall = clamp(1 - Math.sqrt(dx * dx + dy * dy)),
        k = (y * N + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = clamp((s - 0.32) * 2.2) * fall * fall * 255;
    }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}
function smoke(n: number, mode: "burst" | "wisp" | "ring", seed: number, tex: THREE.Texture, R: number, tint = 0xd8eefa) {
  const base = new THREE.PlaneGeometry(1, 1),
    geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute("position", base.getAttribute("position"));
  geo.setAttribute("uv", base.getAttribute("uv"));
  const st = new Float32Array(n * 3),
    ve = new Float32Array(n * 3),
    rn = new Float32Array(n * 4),
    r3 = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = r3() * Math.PI * 2,
      d = Math.sqrt(r3());
    if (mode === "burst") {
      st.set([Math.cos(a) * d * R, Math.sin(a) * d * R, (r3() - 0.5) * 0.4], i * 3);
      const sp = 2 + r3() * 7;
      ve.set([Math.cos(a) * sp, Math.sin(a) * sp * 0.8 + 0.3, 0.5 + r3() * 4.5], i * 3);
      rn.set([1 + r3() * 2.6, r3(), r3() - 0.5, r3()], i * 4);
    } else if (mode === "ring") {
      st.set([Math.cos(a) * 1.4, 0.1, Math.sin(a) * 1.0], i * 3);
      const sp = 0.8 + r3() * 1.8;
      ve.set([Math.cos(a) * sp, 0.2 + r3() * 0.7, Math.sin(a) * sp * 0.6], i * 3);
      rn.set([0.3 + r3() * 0.6, r3(), r3() - 0.5, r3()], i * 4);
    } else {
      const aa = Math.PI * (1.05 + r3() * 0.9);
      st.set([Math.cos(aa) * R * 0.95, Math.sin(aa) * R * 0.95, (r3() - 0.5) * 0.3], i * 3);
      ve.set([(r3() - 0.5) * 0.8, -1.4 - r3() * 1.4, 0.2 + r3() * 0.6], i * 3);
      rn.set([0.5 + r3() * 0.9, r3(), r3() - 0.5, r3()], i * 4);
    }
  }
  geo.setAttribute("aStart", new THREE.InstancedBufferAttribute(st, 3));
  geo.setAttribute("aVel", new THREE.InstancedBufferAttribute(ve, 3));
  geo.setAttribute("aRnd", new THREE.InstancedBufferAttribute(rn, 4));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uAmt: { value: 0 }, uTex: { value: tex }, uTint: { value: new THREE.Color(tint) } },
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `
      attribute vec3 aStart; attribute vec3 aVel; attribute vec4 aRnd; uniform float uT; varying vec2 vUv; varying float vA;
      void main(){
        ${
          mode === "wisp"
            ? `float t = fract(aRnd.w + uT*0.22); vec3 p = aStart + aVel*t + vec3(sin(t*4.0 + aRnd.y*6.28)*0.15, 0.0, 0.0); float sz = aRnd.x * (0.6 + t*1.6); vA = sin(t*3.14159);`
            : `float t = clamp((uT - aRnd.w*0.10) / (1.0 - aRnd.w*0.10), 0.0, 1.0); float e = 1.0 - pow(1.0 - t, 3.0);
               vec3 p = aStart + aVel*e + vec3(sin(t*3.0 + aRnd.y*6.28)*0.35, t*0.9, 0.0); float sz = aRnd.x * (0.5 + e*2.6);
               vA = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.22, 0.85, t)) * step(0.0005, uT);`
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0); float r = aRnd.y*6.283 + aRnd.z*t*2.5;
        mv.xy += mat2(cos(r), -sin(r), sin(r), cos(r)) * position.xy * sz; gl_Position = projectionMatrix * mv; vUv = uv;
      }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uAmt; uniform vec3 uTint; varying vec2 vUv; varying float vA;
      void main(){ float ta = texture2D(uTex, vUv).a; float a = clamp(ta * vA * uAmt * 1.15, 0.0, 1.0);
        vec3 c = mix(uTint * 0.8, vec3(0.97, 0.99, 1.0), smoothstep(0.1, 0.7, ta)); gl_FragColor = vec4(c * a * 1.35, a); }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

/** The coin engraving (undo arrow round a dollar sign + rim lettering) as a normal map and a glow map. */
function engraving() {
  const S = 1024,
    m = S / 2,
    c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, S, S);
  g.strokeStyle = g.fillStyle = "#fff";
  g.lineWidth = S * 0.012;
  g.beginPath();
  g.arc(m, m, S * 0.39, 0, Math.PI * 2);
  g.stroke();
  g.font = `800 ${S * 0.04}px Archivo, Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const chars = [..."UNDO · CTRL+Z · TESTNET USDC · FIVE MINUTES · "],
    step = (Math.PI * 2) / chars.length;
  chars.forEach((ch, i) => {
    const a = -Math.PI / 2 + i * step;
    g.save();
    g.translate(m + Math.cos(a) * S * 0.44, m + Math.sin(a) * S * 0.44);
    g.rotate(a + Math.PI / 2);
    g.fillText(ch, 0, 0);
    g.restore();
  });
  g.lineCap = g.lineJoin = "round";
  g.lineWidth = S * 0.04;
  const r = S * 0.2,
    a0 = -Math.PI * 0.62,
    a1 = Math.PI * 1.05;
  g.beginPath();
  g.arc(m, m, r, a0, a1);
  g.stroke();
  const hx = m + Math.cos(a0) * r,
    hy = m + Math.sin(a0) * r;
  g.beginPath();
  g.moveTo(hx - S * 0.075, hy - S * 0.02);
  g.lineTo(hx + S * 0.012, hy + S * 0.008);
  g.lineTo(hx - S * 0.03, hy + S * 0.085);
  g.stroke();
  g.font = `900 ${S * 0.21}px Archivo, Arial, sans-serif`;
  g.fillText("$", m, m + S * 0.01);
  const b = document.createElement("canvas");
  b.width = b.height = S;
  const bg = b.getContext("2d")!;
  bg.filter = "blur(3px)";
  bg.drawImage(c, 0, 0);
  const src = bg.getImageData(0, 0, S, S).data,
    out = new ImageData(S, S),
    o = out.data,
    st = 3.2;
  const H = (x: number, y: number) => src[(Math.min(S - 1, Math.max(0, y)) * S + Math.min(S - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * st,
        dy = (H(x, y + 1) - H(x, y - 1)) * st,
        l = Math.hypot(dx, dy, 1),
        k = (y * S + x) * 4;
      o[k] = (-dx / l) * 127.5 + 127.5;
      o[k + 1] = (dy / l) * 127.5 + 127.5;
      o[k + 2] = (1 / l) * 127.5 + 127.5;
      o[k + 3] = 255;
    }
  const nc = document.createElement("canvas");
  nc.width = nc.height = S;
  nc.getContext("2d")!.putImageData(out, 0, 0);
  const normal = new THREE.CanvasTexture(nc),
    glow = new THREE.CanvasTexture(c);
  glow.colorSpace = THREE.SRGBColorSpace;
  return { normal, glow };
}

export async function startIntro(els: IntroEls, copy: { current: IntroCopy }, rigFx: RigFx): Promise<IntroApi> {
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
  try {
    await Promise.race([document.fonts.load("900 120px Archivo"), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* fonts are a nicety for the engraving */
  }
  const frostImg = await new Promise<HTMLImageElement | null>((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = "/undo/frost.webp";
  });
  const frostTex = frostImg
    ? (() => {
        const t = new THREE.Texture(frostImg);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.needsUpdate = true;
        return t;
      })()
    : null;
  const PUFF = puffTexture();
  const R = 1.6,
    T = 0.24;
  const tanH = Math.tan(THREE.MathUtils.degToRad(17.5));

  // ======================= scene A: coin, shards, keys =======================
  const A = makeRenderer(els.canvasA, mobile);
  const sceneA = new THREE.Scene();
  sceneA.environment = A.env;
  const camA = new THREE.PerspectiveCamera(35, 1, 0.1, 300);
  const keyL = new THREE.DirectionalLight(0xdff2ff, 1.4);
  keyL.position.set(-3, 6, 6);
  const rimL = new THREE.DirectionalLight(0x9fe8ff, 2.2);
  rimL.position.set(5, 2, -6);
  sceneA.add(keyL, rimL);

  const ENG = engraving();
  const coinFrost = { value: 0 };
  const coinMat = frosted(
    darkGlass({ normalMap: ENG.normal, normalScale: new THREE.Vector2(0.9, 0.9), emissive: 0x6fd0ff, emissiveMap: ENG.glow, emissiveIntensity: 0.55 }),
    coinFrost,
    frostTex,
    R,
  );
  const shardNormal = ENG.normal.clone();
  shardNormal.repeat.set(1 / (2 * R), 1 / (2 * R));
  shardNormal.offset.set(0.5, 0.5);
  shardNormal.needsUpdate = true;
  const shardGlow = ENG.glow.clone();
  shardGlow.repeat.copy(shardNormal.repeat);
  shardGlow.offset.copy(shardNormal.offset);
  shardGlow.needsUpdate = true;
  const shardMat = frosted(
    darkGlass({ normalMap: shardNormal, normalScale: new THREE.Vector2(0.9, 0.9), emissive: 0x6fd0ff, emissiveMap: shardGlow, emissiveIntensity: 0.55 }),
    coinFrost,
    frostTex,
    R,
  );
  const edgeMat = frosted(darkGlass({ color: 0x1a3442, roughness: 0.12 }), coinFrost, frostTex, R);

  const holder = new THREE.Group();
  sceneA.add(holder);
  const coin = new THREE.Group();
  holder.add(coin);
  const prof = [
    [0, -T / 2 + 0.03], [R - 0.2, -T / 2 + 0.03], [R - 0.16, -T / 2], [R - 0.05, -T / 2], [R, -T / 2 + 0.05],
    [R, T / 2 - 0.05], [R - 0.05, T / 2], [R - 0.16, T / 2], [R - 0.2, T / 2 - 0.03], [0, T / 2 - 0.03],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const lathe = new THREE.LatheGeometry(prof, 128);
  lathe.rotateX(Math.PI / 2);
  {
    const p = lathe.getAttribute("position"),
      uv = lathe.getAttribute("uv");
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * R) + 0.5, p.getY(i) / (2 * R) + 0.5);
    uv.needsUpdate = true;
  }
  lathe.setAttribute("aCoin", lathe.getAttribute("position").clone());
  const whole = new THREE.Mesh(lathe, coinMat);
  coin.add(whole);

  // 24 Voronoi shards, cut ahead of time; swapped in the moment the coin cracks
  const rnd = rng(11);
  const seeds = Array.from({ length: 24 }, () => {
    const a = rnd() * Math.PI * 2,
      r = Math.sqrt(rnd()) * R * 0.98;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  const circle = Array.from({ length: 160 }, (_, i) => {
    const a = (i / 160) * Math.PI * 2;
    return { x: Math.cos(a) * R, y: Math.sin(a) * R };
  });
  type P2 = { x: number; y: number };
  const clip = (poly: P2[], a: P2, b: P2) => {
    const nx = b.x - a.x,
      ny = b.y - a.y,
      mx = (a.x + b.x) / 2,
      my = (a.y + b.y) / 2,
      out: P2[] = [],
      d = (p: P2) => (p.x - mx) * nx + (p.y - my) * ny;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length],
        dp = d(p),
        dq = d(q);
      if (dp <= 0) out.push(p);
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
        const t = dp / (dp - dq);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
    return out;
  };
  const shardGroup = new THREE.Group();
  shardGroup.visible = false;
  coin.add(shardGroup);
  type Shard = { mesh: THREE.Mesh; base: THREE.Vector3; nx: number; ny: number; z: number; size: number; axis: THREE.Vector3; ang: number; ph: number };
  const shards: Shard[] = [];
  seeds.forEach((sd, i) => {
    let poly = circle;
    seeds.forEach((o, j) => {
      if (i !== j && poly.length > 2) poly = clip(poly, sd, o);
    });
    if (poly.length < 3) return;
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y))), {
      depth: T - 0.06,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    geo.translate(0, 0, -(T - 0.06) / 2);
    geo.setAttribute("aCoin", geo.getAttribute("position").clone());
    let cx = 0,
      cy = 0;
    poly.forEach((p) => {
      cx += p.x;
      cy += p.y;
    });
    cx /= poly.length;
    cy /= poly.length;
    geo.translate(-cx, -cy, 0);
    const mesh = new THREE.Mesh(geo, [shardMat, edgeMat]);
    const base = new THREE.Vector3(cx, cy, 0);
    mesh.position.copy(base);
    // where it hangs once time stops: a screen spot (nx, ny in -1..1) and a depth. Headline band and keys stay clear.
    const a = Math.atan2(cy, cx) + (rnd() - 0.5) * 0.9,
      rn = 0.62 + rnd() * 0.42;
    const near = shards.length % 6 === 2,
      deep = !near && shards.length % 5 === 1;
    let nx = Math.cos(a) * rn,
      ny = Math.sin(a) * rn * 0.95;
    if (near) {
      nx = Math.sign(nx || 1) * (0.58 + rnd() * 0.3);
      ny = -0.5 + rnd() * 0.7;
    } else if (deep) {
      nx = (rnd() - 0.5) * 0.7;
      ny = -0.05 + rnd() * 0.3;
    } else if (ny > 0.3) ny = 0.28 - rnd() * 0.3;
    if (!deep && ny < 0 && ny > -0.75 && Math.abs(nx) < 0.5) nx = Math.sign(nx || 1) * (0.5 + Math.abs(nx) * 0.7);
    shards.push({
      mesh,
      base,
      nx,
      ny,
      z: near ? 0.5 + rnd() * 1.8 : deep ? -9 - rnd() * 3 : -6 + rnd() * 5,
      size: near ? 0.95 : deep ? 0.85 : 0.75 + rnd() * 0.35,
      axis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
      ang: (rnd() - 0.5) * 5,
      ph: rnd() * 6.28,
    });
    shardGroup.add(mesh);
  });
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(R * 0.97, 96),
    new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }),
  );
  coin.add(core);
  const haloTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!,
      gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "rgba(210,244,255,1)");
    gr.addColorStop(0.25, "rgba(120,205,255,.4)");
    gr.addColorStop(1, "rgba(80,150,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  halo.position.z = -1.4;
  holder.add(halo);

  // flight echoes + speed streaks
  const ghostGeo = new THREE.CylinderGeometry(R, R, T, 64);
  ghostGeo.rotateX(Math.PI / 2);
  const ghosts = [1, 2, 3, 4].map((k) => {
    const g = new THREE.Mesh(
      ghostGeo,
      new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    g.userData.k = k;
    sceneA.add(g);
    return g;
  });
  const NS = mobile ? 80 : 140,
    streakPos = new Float32Array(NS * 6);
  const streakMeta = Array.from({ length: NS }, () => ({ a: rnd() * Math.PI * 2, r: 2.5 + rnd() * 14, ph: rnd() }));
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute("position", new THREE.BufferAttribute(streakPos, 3));
  const streakMat = new THREE.LineBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const streaks = new THREE.LineSegments(streakGeo, streakMat);
  streaks.frustumCulled = false;
  sceneA.add(streaks);

  // Smoke is the main overdraw: every puff is a large transparent quad. Fewer, same look at speed.
  const burst = smoke(mobile ? 32 : 64, "burst", 21, PUFF, R);
  const wisps = smoke(mobile ? 12 : 22, "wisp", 33, PUFF, R);
  holder.add(burst, wisps);
  const burstU = (burst.material as THREE.ShaderMaterial).uniforms,
    wispU = (wisps.material as THREE.ShaderMaterial).uniforms;

  // glass keycaps with a glowing legend etched on top
  const legend = (txt: string, wide: boolean) => {
    const c = document.createElement("canvas");
    c.width = wide ? 620 : 400;
    c.height = 400;
    const g = c.getContext("2d")!;
    g.font = `800 ${wide ? 150 : 190}px Archivo, Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = "rgba(160,230,255,.95)";
    g.shadowBlur = 40;
    g.fillStyle = "#ffffff";
    g.fillText(txt, c.width / 2, c.height / 2 + 8);
    g.shadowBlur = 0;
    g.fillText(txt, c.width / 2, c.height / 2 + 8);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const keyFrost = { value: 0.3 };
  const keys = new THREE.Group();
  sceneA.add(keys);
  const makeKey = (txt: string, w: number) => {
    const g = new THREE.Group();
    const geo = new RoundedBoxGeometry(w, 1, 0.62, 4, 0.16);
    geo.setAttribute("aCoin", geo.getAttribute("position").clone());
    const body = new THREE.Mesh(geo, frosted(darkGlass({ color: 0x122431 }), keyFrost, frostTex, 0.9));
    const wide = w > 1.2;
    const lg = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.8, w * 0.8 * (400 / (wide ? 620 : 400))),
      new THREE.MeshBasicMaterial({ map: legend(txt, wide), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }),
    );
    lg.position.z = 0.315;
    g.add(body, lg);
    g.userData = { lg, press: 0 };
    return g;
  };
  const kCtrl = makeKey("Ctrl", 1.6),
    kZ = makeKey("Z", 1.0);
  kCtrl.position.x = -0.62;
  kZ.position.x = 0.95;
  keys.add(kCtrl, kZ);
  keys.rotation.x = -0.42;
  const keyLight = new THREE.PointLight(0x9fe8ff, 0, 6);
  keyLight.position.set(0.2, 0.2, 1.2);
  keys.add(keyLight);

  // ======================= scene B: the PANIC rig =======================
  const B = makeRenderer(els.canvasB, mobile);
  const sceneB = new THREE.Scene();
  sceneB.environment = B.env;
  const camB = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const kB = new THREE.DirectionalLight(0xdff2ff, 1.2);
  kB.position.set(-3, 6, 5);
  sceneB.add(kB);
  const rig = new THREE.Group();
  sceneB.add(rig);
  const plinthFrost = { value: 0.55 };
  const plinthGeo = new RoundedBoxGeometry(4.6, 0.75, 3.0, 4, 0.14);
  plinthGeo.setAttribute("aCoin", plinthGeo.getAttribute("position").clone());
  const plinthMat = frosted(darkGlass({ color: 0x2a4656, roughness: 0.15, emissive: 0xff2e4d, emissiveIntensity: 0 }), plinthFrost, frostTex, 2.6);
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  plinth.position.y = 0.375;
  rig.add(plinth);
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xc9d2dc, metalness: 1, roughness: 0.22, clearcoat: 0.5, envMapIntensity: 1.6, side: THREE.DoubleSide });
  const collar = new THREE.Mesh(
    new THREE.LatheGeometry([[1.02, 0], [1.18, 0], [1.2, 0.08], [1.14, 0.2], [1.0, 0.22], [0.96, 0.12]].map(([x, y]) => new THREE.Vector2(x, y)), 96),
    steel,
  );
  collar.position.y = 0.75;
  rig.add(collar);
  [0, 1, 2, 3].forEach((i) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 6), steel);
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    b.position.set(Math.cos(a) * 1.1, 0.98, Math.sin(a) * 1.1);
    rig.add(b);
  });
  const domeTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 1024;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(400, 360, 40, 512, 512, 520);
    gr.addColorStop(0, "#ff7a8c");
    gr.addColorStop(0.45, "#ff2e4d");
    gr.addColorStop(1, "#8a0018");
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 1024);
    g.font = "900 250px Archivo, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.save();
    g.scale(1, 1.5);
    g.fillStyle = "rgba(90,0,15,.55)";
    g.fillText("PANIC", 512, 350);
    g.fillStyle = "#fff";
    g.fillText("PANIC", 512, 342);
    g.restore();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const domeProf: THREE.Vector2[] = [new THREE.Vector2(1.0, -0.12)];
  for (let i = 0; i <= 24; i++) {
    const a = ((i / 24) * Math.PI) / 2;
    domeProf.push(new THREE.Vector2(Math.cos(a) * 0.98, Math.sin(a) * 0.42));
  }
  const domeGeo = new THREE.LatheGeometry(domeProf, 96);
  {
    const p = domeGeo.getAttribute("position"),
      uv = domeGeo.getAttribute("uv");
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 2.0 + 0.5, -p.getZ(i) / 2.0 + 0.5);
    uv.needsUpdate = true;
  }
  const domeMat = new THREE.MeshPhysicalMaterial({
    map: domeTex,
    emissive: 0xff2040,
    emissiveMap: domeTex,
    emissiveIntensity: 0.35,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.2,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.y = 0.86;
  rig.add(dome);
  const redLight = new THREE.PointLight(0xff2e4d, 0, 9, 1.6);
  redLight.position.set(0, 1.5, 0.6);
  rig.add(redLight);
  const chunkMat = darkGlass({ color: 0x24465a });
  [
    [-2.9, 0.2, 0.9, 0.38],
    [3.1, 0.25, 0.6, 0.45],
    [-3.4, 0.1, -0.6, 0.22],
    [2.6, 0.1, 1.4, 0.2],
  ].forEach(([x, y, z, s], i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), chunkMat);
    m.position.set(x, y, z);
    m.rotation.set(i, i * 2, i * 0.5);
    m.scale.y = 0.7;
    rig.add(m);
  });
  const panicBurst = smoke(mobile ? 20 : 36, "ring", 44, PUFF, R, 0xff6b80);
  panicBurst.position.y = 0.9;
  rig.add(panicBurst);
  const panicU = (panicBurst.material as THREE.ShaderMaterial).uniforms;
  rig.rotation.x = 0.55;

  // ======================= layout =======================
  let camZ = 10,
    coinY = 0,
    aspect = 1;
  const halfH = (z: number) => (camZ - z) * tanH,
    halfW = (z: number) => halfH(z) * aspect;
  const worldY = (frac: number, z: number) => (1 - 2 * frac) * halfH(z);

  // Section geometry, measured outside the frame (on resize and when the page height changes). Reading
  // getBoundingClientRect inside the frame, after writing styles, forced a full layout on every frame while scrolling.
  const box = { tTop: 0, tH: 1, vh: window.innerHeight };
  let scrollY = window.scrollY;
  function measure() {
    scrollY = window.scrollY;
    box.tTop = els.trailer.getBoundingClientRect().top + scrollY;
    box.tH = els.trailer.offsetHeight;
    box.vh = window.innerHeight;
  }
  const onScroll = () => (scrollY = window.scrollY);
  window.addEventListener("scroll", onScroll, { passive: true });
  const heightWatch = new ResizeObserver(measure);
  heightWatch.observe(document.body);

  function resize() {
    const w = els.canvasA.clientWidth || window.innerWidth,
      h = els.canvasA.clientHeight || window.innerHeight;
    A.r.setSize(w, h, false);
    aspect = w / h;
    camA.aspect = aspect;
    const share = aspect < 0.8 ? 0.68 : 0.5;
    camZ = Math.max(9.2, (2 * R) / (share * 2 * tanH * Math.min(1, aspect)));
    camA.position.set(0, 0, camZ);
    camA.lookAt(0, 0, 0);
    camA.updateProjectionMatrix();
    coinY = -2 * halfH(0) * (aspect < 0.8 ? 0.04 : 0.08);
    const kz = 1.2,
      kh = Math.min(0.13 * 2 * halfH(kz), 0.27 * halfW(kz));
    keys.scale.setScalar(kh);
    keys.position.set(-0.165 * kh, worldY(0.66, kz), kz);
    const wb = els.canvasB.clientWidth || w,
      hb = els.canvasB.clientHeight || h;
    B.r.setSize(wb, hb, false);
    camB.aspect = wb / hb;
    // the rig (4.6 wide) takes about half the width on a laptop and 85% on a phone
    const fitW = 4.6 / ((wb / hb < 0.8 ? 0.8 : 0.4) * 2 * Math.tan(THREE.MathUtils.degToRad(15)) * (wb / hb));
    const dist = Math.max(11, fitW);
    camB.position.set(0, (3.2 * dist) / 11, dist);
    camB.lookAt(0, 0.6, 0);
    camB.updateProjectionMatrix();
    measure();
  }
  resize();
  window.addEventListener("resize", resize);

  // Adaptive resolution: when frames run slow, draw fewer pixels (down to 0.7x); give them back once there is room.
  const qual = { dpr: A.r.getPixelRatio(), cap: A.r.getPixelRatio(), ema: 16.7, fast: 0, cool: 0 };
  function govern(ms: number, now: number) {
    if (ms > 250 || document.hidden) return; // a throttled or hidden tab, not a slow GPU
    qual.ema += (ms - qual.ema) * 0.1;
    qual.fast = qual.ema < 18 ? qual.fast + ms : 0;
    if (now < qual.cool) return;
    let next = qual.dpr;
    if (qual.ema > 24) next = Math.max(0.7, qual.dpr - 0.15);
    else if (qual.fast > 4000 && qual.dpr < qual.cap) next = Math.min(qual.cap, qual.dpr + 0.1);
    if (next === qual.dpr) return;
    qual.dpr = next;
    qual.fast = 0;
    qual.cool = now + 1200;
    A.r.setPixelRatio(next);
    B.r.setPixelRatio(next);
    resize();
  }

  // ======================= timeline =======================
  const st = { p: 0, intro: 0, spin: 0, from: null as number | null, target: 0, clock: 300, time: 0, h: 0, hT: 0 };
  const Sx = new THREE.Vector3(-30, 15, -60),
    Cx = new THREE.Vector3(14, 7, -22),
    home = new THREE.Vector3(),
    tmp = new THREE.Vector3();
  const bez = (e: number, o: THREE.Vector3) =>
    o
      .set(0, 0, 0)
      .addScaledVector(Sx, (1 - e) * (1 - e))
      .addScaledVector(Cx, 2 * (1 - e) * e)
      .addScaledVector(tmp.set(0, coinY, 0), e * e);
  const flight = (x: number) => 1 - Math.pow(1 - clamp(x), 3.4);
  const q = new THREE.Quaternion(),
    hang = new THREE.Vector3(),
    from = new THREE.Vector3();
  const trailerP = () => clamp((scrollY - box.tTop) / (box.tH - box.vh));
  const keyDown = { c: 0, z: 0 };
  let ctrlHeld = false;

  // programmatic scroll for Skip intro and for Ctrl+Z pressed during the trailer
  let auto: { from: number; to: number; t0: number; ms: number } | null = null;
  const pToY = (p: number) => box.tTop + p * (box.tH - box.vh);
  const scrollToY = (to: number, ms: number) => (auto = { from: window.scrollY, to, t0: performance.now(), ms });
  const cancelAuto = () => (auto = null);
  window.addEventListener("wheel", cancelAuto, { passive: true });
  window.addEventListener("touchstart", cancelAuto, { passive: true });

  const undo = () => {
    keyDown.c = keyDown.z = 1;
    if (st.p < 0.9) {
      if (st.p > 0.5) scrollToY(pToY(1), 1400);
      return;
    }
    st.hT = st.hT > 0.5 ? 0 : 1;
  };
  const onKey = (ev: KeyboardEvent) => {
    const el = ev.target as HTMLElement | null;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    if (ev.key === "Control" || ev.key === "Meta") {
      ctrlHeld = true;
      keyDown.c = 1;
    }
    if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === "z") {
      // only while the intro is on screen; elsewhere Ctrl+Z keeps its normal meaning
      if (box.tTop + box.tH - scrollY < 0) return;
      ev.preventDefault();
      undo();
    }
  };
  const onKeyUp = (ev: KeyboardEvent) => {
    if (ev.key === "Control" || ev.key === "Meta") ctrlHeld = false;
  };
  const onBlur = () => (ctrlHeld = false);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  let last = performance.now(),
    raf = 0,
    clockStr = "",
    capStr = "";
  /** `off`: at 0 the layer is also hidden, so a blended full-screen layer costs nothing while it is invisible. */
  const setO = (el: HTMLElement, v: number, off = false) => {
    const s = v.toFixed(3);
    if (el.style.opacity !== s) el.style.opacity = s;
    if (off) {
      const vis = v < 0.002 ? "hidden" : "";
      if (el.style.visibility !== vis) el.style.visibility = vis;
    }
  };

  // The loop runs only while the trailer or the PANIC section is on screen; scrolling past the intro stops it.
  let onT = false,
    onP = false;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.target === els.trailer) onT = e.isIntersecting;
      else if (e.target === els.panic) onP = e.isIntersecting;
    }
    if ((onT || onP) && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });
  io.observe(els.trailer);
  io.observe(els.panic);

  function frame(now: number) {
    if (!onT && !onP && !auto) {
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(frame);
    const raw = Math.max(0, (now - last) / 1000),
      dt = Math.min(0.05, raw);
    govern(now - last, now);
    last = now;
    st.time += dt;
    if (auto) {
      const k = clamp((now - auto.t0) / auto.ms),
        e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      window.scrollTo(0, auto.from + (auto.to - auto.from) * e);
      if (k >= 1) auto = null;
    }

    // ---------- A ----------
    if (onT) {
      st.p += (trailerP() - st.p) * (1 - Math.exp(-raw * 8));
      const p = st.p;
      st.intro = clamp(st.intro + (raw / 2.6) * (p > 0.03 ? 4 : 1));
      if (p < 0.85) st.hT = 0;
      st.h += clamp(st.hT - st.h, -raw / 2.6, raw / 2.6);
      const h = st.h,
        e = flight(st.intro),
        speed = Math.pow(1 - st.intro, 1.4);
      const f0 = ss(0.06, 0.44, p) * ss(0.85, 1, st.intro),
        c0 = clamp((p - 0.45) / 0.12),
        s0 = clamp((p - 0.57) / 0.2),
        u = clamp((p - 0.57) / 0.33),
        rev = ss(0.7, 0.9, p);
      const s = s0 * (1 - ss(0, 0.42, h)),
        c = c0 * (1 - ss(0.28, 0.46, h)),
        f = f0 * (1 - ss(0.32, 0.62, h)),
        fly = ss(0.6, 1, h);

      bez(e, holder.position);
      holder.position.y += Math.sin(st.time * 1.3) * 0.05 * (1 - f0) * e;
      if (fly > 0) {
        home.set(-halfW(-8) * 1.25, halfH(-8) * 1.05, -8);
        holder.position.lerp(home, fly * fly);
      }
      let rotY: number;
      if (f0 < 0.002) {
        st.from = null;
        st.spin += dt * 2.3 * e;
        rotY = st.spin;
      } else {
        if (st.from === null) {
          st.from = st.spin;
          st.target = Math.ceil((st.spin + Math.PI * 0.8) / (Math.PI * 2)) * Math.PI * 2;
        }
        rotY = st.from + (st.target - st.from) * (1 - Math.pow(1 - clamp(f0 / 0.75), 3));
        st.spin = rotY;
      }
      rotY += Math.pow(ss(0.45, 1, h), 2) * Math.PI * 6;
      coin.rotation.set(0.2 * (1 - f0) + (1 - e) * 3.0 + fly * 0.6, rotY + (1 - e) * 16, -0.06 * (1 - f0));
      coin.scale.setScalar(1 - fly * 0.4);
      const shake = c * (1 - s) * 0.018;
      coin.position.set(Math.sin(st.time * 83) * shake, Math.cos(st.time * 71) * shake, 0);
      coinFrost.value = f * (1 - 0.72 * ss(0.15, 1, s));
      const broken = c > 0.02 || s > 0.001;
      whole.visible = !broken;
      shardGroup.visible = broken;
      if (broken) {
        const es = 1 - Math.pow(1 - s, 4);
        for (const sh of shards) {
          from.copy(sh.base).multiplyScalar(1 + c * 0.025);
          hang.set(sh.nx * halfW(sh.z) * 0.9, sh.ny * halfH(sh.z) * 0.86 - coinY, sh.z);
          sh.mesh.position.copy(from).lerp(hang, es);
          sh.mesh.position.x += Math.sin(st.time * 0.5 + sh.ph) * 0.05 * es;
          sh.mesh.position.y += Math.cos(st.time * 0.4 + sh.ph * 1.3) * 0.06 * es;
          q.setFromAxisAngle(sh.axis, sh.ang * es + Math.sin(st.time * 0.3 + sh.ph) * 0.06 * es);
          sh.mesh.quaternion.copy(q);
          sh.mesh.scale.setScalar(1 + (sh.size - 1) * es);
        }
      }
      const flash = ss(0, 0.04, s0) * (1 - ss(0.04, 0.35, s0)) * (1 - ss(0, 0.1, h));
      (core.material as THREE.MeshBasicMaterial).opacity = clamp(c * 0.9 * (1 - ss(0, 0.2, s)));
      halo.lookAt(camA.position);
      halo.scale.setScalar(5.5 + c * 3 + flash * 6 + speed * 2);
      (halo.material as THREE.MeshBasicMaterial).opacity = (0.16 + f * 0.25 + c * 0.5 + flash * 0.7) * (1 - ss(0.3, 0.8, s)) * (1 - fly);
      for (const g of ghosts) {
        const ek = flight(st.intro - g.userData.k * 0.05);
        bez(ek, g.position);
        g.rotation.set(coin.rotation.x, rotY + (1 - ek) * 16, 0);
        const mat = g.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.22 * (1 - g.userData.k / 5) * speed * ss(0.02, 0.15, st.intro);
        g.visible = mat.opacity > 0.005;
      }
      const streakAmt = Math.max(speed, fly * (1 - fly) * 2.2);
      streakMat.opacity = streakAmt * 0.7;
      streaks.visible = streakAmt > 0.01;
      if (streaks.visible) {
        const len = 1 + streakAmt * 14,
          dir = fly > 0 ? -1 : 1;
        streakMeta.forEach((m, i) => {
          const z = -80 + ((((m.ph + dir * st.time * 1.1) % 1) + 1) % 1) * 90,
            x = Math.cos(m.a) * m.r,
            y = Math.sin(m.a) * m.r;
          streakPos.set([x, y, z, x, y, z - len], i * 6);
        });
        streakGeo.getAttribute("position").needsUpdate = true;
      }
      burstU.uT.value = u;
      burstU.uAmt.value = 1;
      wispU.uT.value = st.time;
      wispU.uAmt.value = ss(0.15, 0.6, f) * (1 - ss(0, 0.15, s)) * 0.8;

      // keys rise in with the hero and sink when pressed
      const kv = ss(0.78, 0.95, p);
      keys.visible = kv > 0.01;
      keyFrost.value = 0.3 * (1 - ss(0.3, 0.7, h)) + 0.05;
      for (const [k, d] of [
        [kCtrl, keyDown.c],
        [kZ, keyDown.z],
      ] as const) {
        k.userData.press += ((d > 0.5 ? 1 : 0) - k.userData.press) * (1 - Math.exp(-raw * 22));
        k.position.z = -0.22 * k.userData.press;
        k.position.y = (1 - kv) * -1.2;
        (k.userData.lg.material as THREE.MeshBasicMaterial).opacity = kv * (0.75 + 0.6 * k.userData.press);
      }
      keyDown.z = Math.max(0, keyDown.z - raw * 3);
      if (!ctrlHeld) keyDown.c = Math.max(0, keyDown.c - raw * 3);
      keyLight.intensity = 6 * Math.max(kCtrl.userData.press, kZ.userData.press) * kv;

      // HTML layers (sharp text): trailer lines, frozen headline, frost, fog, clock, hero controls
      setO(els.lines[0], 1 - ss(0.025, 0.09, p));
      setO(els.lines[1], band(p, 0.1, 0.16, 0.28, 0.34));
      setO(els.lines[2], band(p, 0.34, 0.4, 0.56, 0.62));
      setO(els.hero, rev);
      els.hero.style.transform = `scale(${(1.06 - 0.06 * rev).toFixed(4)})`;
      els.hero.classList.toggle("melt", h > 0.5);
      setO(els.frost, f0 * 0.85 * (1 - ss(0.6, 0.76, p)), true);
      setO(els.fog, 0.4 * ss(0.58, 0.64, p) * (1 - ss(0.66, 0.8, p)), true);
      setO(els.clock, st.intro < 0.6 ? ss(0.3, 0.6, st.intro) : 1 - ss(0.54, 0.6, p));
      setO(els.heroUi, kv);
      els.heroUi.style.pointerEvents = kv > 0.5 ? "auto" : "none";
      els.skip.style.visibility = p > 0.85 ? "hidden" : "visible";
      els.toast.classList.toggle("on", h > 0.97);
      els.keyC.classList.toggle("down", kCtrl.userData.press > 0.5);
      els.keyZ.classList.toggle("down", kZ.userData.press > 0.5);
      const cap = h > 0.97 ? copy.current.capDone : copy.current.capIdle;
      if (cap !== capStr) {
        capStr = cap;
        els.cap.textContent = cap;
      }
      const frozen = f0 > 0.3;
      if (!frozen && st.intro > 0.6) st.clock = Math.max(0, st.clock - raw);
      const txt = fmt(st.clock) + (frozen ? copy.current.clockFrozen : copy.current.clockRun);
      if (txt !== clockStr) {
        clockStr = txt;
        els.clockT.textContent = fmt(st.clock);
        els.clockS.textContent = frozen ? copy.current.clockFrozen : copy.current.clockRun;
        els.clock.classList.toggle("frozen", frozen);
      }
      A.r.render(sceneA, camA);
    }

    // ---------- B ----------
    if (onP) {
      rigFx.press = Math.max(0, rigFx.press - raw * 2.5);
      const pulse = rigFx.armed ? 0.5 + 0.5 * Math.sin(st.time * 6) : 0;
      dome.position.y = 0.86 - 0.14 * Math.sin((Math.min(1, rigFx.press) * Math.PI) / 2);
      domeMat.emissiveIntensity = 0.3 + pulse * 0.9 + rigFx.press * 1.6;
      redLight.intensity = 2 + pulse * 10 + rigFx.press * 26;
      plinthMat.emissiveIntensity = 0.02 + pulse * 0.08 + rigFx.press * 0.25;
      plinthFrost.value += ((rigFx.frozen ? 1.05 : 0.5) - plinthFrost.value) * (1 - Math.exp(-raw * 1.6));
      if (rigFx.burst >= 0) {
        rigFx.burst += raw / 1.8;
        if (rigFx.burst > 1) rigFx.burst = -1;
      }
      panicU.uT.value = Math.max(0, rigFx.burst);
      panicU.uAmt.value = rigFx.burst >= 0 ? 0.55 : 0;
      rig.rotation.y = Math.sin(st.time * 0.25) * 0.12;
      B.r.render(sceneB, camB);
    }
  }
  return {
    undo,
    skip: () => {
      scrollToY(pToY(1), 1600);
      if (!raf) raf = requestAnimationFrame(frame);
    },
    stop: () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      heightWatch.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("wheel", cancelAuto);
      window.removeEventListener("touchstart", cancelAuto);
      A.r.dispose();
      B.r.dispose();
    },
  };
}
