// Daylight study for the demo bungalow: renderer, sun, camera, controls.
// Framework-free: mountDaylight(canvas, opts) -> controller. The Angular component wraps this.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildBungalow, buildMassing, groundAt, D, ROOMS, FOOTPRINTS, BUNGALOW_FRAME, BUNGALOW_COLORS, BLOCKERS, MODEL_SPOTS, LIGHTS, ITEMS, STRUCT, DOORS, LEVELS } from './house.js';
import { buildTextures, contactTexture } from './textures.js';
import { createAssets, bind as bindSet, SETS, BINDINGS } from './realism.js';

const R = Math.PI / 180;
// Fictional location (Fernhollow, a made-up town). No real coordinates.
export const SITE = { lat: 46.2, lon: -98.5, front: 225 }; // front faces SW [GUESS, see spec]
export const SEASONS = {
  summer: { label: 'Jun 21', doy: 172, tz: -7 },
  autumn: { label: 'Sep 22', doy: 265, tz: -7 },
  winter: { label: 'Dec 21', doy: 355, tz: -8 },
};

// NOAA general solar position (declination + equation of time). hours = local clock time.
export function sunAt(doy, hours, tz, lat = SITE.lat, lon = SITE.lon) {
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (hours - 12) / 24);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const tst = hours * 60 + eq + 4 * lon - 60 * tz;
  const ha = (tst / 4 - 180) * R;
  const phi = lat * R;
  const cz = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha);
  const elevation = Math.asin(Math.max(-1, Math.min(1, cz))) / R;
  const azimuth = ((Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / R) + 180 + 360) % 360;
  return { elevation, azimuth };
}
export function dayWindow(season) {
  const s = SEASONS[season];
  const el = (h) => sunAt(s.doy, h, s.tz).elevation + 0.83;
  const cross = (a, b) => { for (let i = 0; i < 40; i++) { const m = (a + b) / 2; (el(a) < 0) === (el(m) < 0) ? (a = m) : (b = m); } return (a + b) / 2; };
  let noon = 12, best = -99;
  for (let h = 9; h < 16; h += 0.02) { const e = el(h); if (e > best) { best = e; noon = h; } }
  return { rise: cross(2, noon), set: cross(noon, 23), noon, peak: best - 0.83 };
}
// compass azimuth -> world direction (front of house = +z, faces SITE.front)
function azDir(az, el) {
  const d = (az - SITE.front) * R, e = el * R;
  return new THREE.Vector3(-Math.sin(d) * Math.cos(e), Math.sin(e), Math.cos(d) * Math.cos(e));
}
const POINTS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export const compass = (az) => POINTS[Math.round(az / 45) % 8];
export function clock(h) {
  const hh = Math.floor(h + 1e-6), mm = Math.round((h - hh) * 60 / 5) * 5;
  const H = (mm === 60 ? hh + 1 : hh), M = mm === 60 ? 0 : mm;
  const ap = H >= 12 ? 'pm' : 'am', h12 = ((H + 11) % 12) + 1;
  return `${h12}:${String(M).padStart(2, '0')} ${ap}`;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const PALETTE = {
  light: { clear: '#faf9f5', plinth: '#ece6dc', hemiSky: '#eef0f2', hemiGround: '#c9bfae', hemi: 0.42, env: 0.6, exposure: 1.0 },
  dark: { clear: '#1a1917', plinth: '#2c2925', hemiSky: '#9a948a', hemiGround: '#2a2723', hemi: 0.3, env: 0.5, exposure: 0.92 },
};
// Render quality ladders (RUBRIC v2.2 budgets). Desktop: DPR capped at 2, shadow map 2048. Phone: DPR capped at 1.5,
// shadow map 1024. Adaptive: when the p95 frame time over the last 2 s of motion is over budget (22.2 ms desktop,
// 33.3 ms phone), step one rung down: pixel ratio 2 -> 1.5 -> 1, then shadow map 2048 -> 1024. Never below DPR 1.
const LADDERS = {
  desk: [
    { dpr: 2, ao: true, shadow: 2048 },
    { dpr: 1.5, ao: true, shadow: 2048 },
    { dpr: 1, ao: false, shadow: 2048 },
    { dpr: 1, ao: false, shadow: 1024 },
  ],
  phone: [
    { dpr: 1.5, ao: false, shadow: 1024 },
    { dpr: 1, ao: false, shadow: 1024 },
  ],
};
const BUDGET_MS = { desk: 22.2, phone: 33.3 };
// MOTION.md 3D pattern: wireframe on mount, morph to solid over 700 ms (emphasized easing), then data-3d="settled".
const MORPH_MS = 700;
const emphasized = (x) => { // cubic-bezier(0.3, 0, 0, 1)
  let t = x;
  for (let i = 0; i < 6; i++) { const u = 1 - t, bx = 3 * u * u * t * 0.3 + t * t * t - x, d = 3 * u * u * 0.3 - 6 * u * t * 0.3 + 3 * t * t; if (Math.abs(d) < 1e-6) break; t = Math.min(1, Math.max(0, t - bx / d)); }
  const u = 1 - t; return 3 * u * t * t + t * t * t;
};
// Rug: a grey-and-cream lattice in a classic living-room style (pattern drawn here; relief from the CC0 weave maps).
function rugTexture() {
  const n = 512, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d2c4'; g.fillRect(0, 0, n, n);
  g.strokeStyle = '#6f6a62'; g.lineWidth = 26;
  for (const o of [0, n]) { g.beginPath(); g.moveTo(o - n / 2, 0); g.lineTo(o, n / 2); g.lineTo(o - n / 2, n); g.stroke(); g.beginPath(); g.moveTo(o + n / 2, 0); g.lineTo(o, n / 2); g.lineTo(o + n / 2, n); g.stroke(); }
  g.strokeStyle = '#9b9283'; g.lineWidth = 8;
  for (const [x, y] of [[n / 2, n / 2], [0, 0], [n, 0], [0, n], [n, n]]) { g.beginPath(); g.moveTo(x, y - 70); g.lineTo(x + 70, y); g.lineTo(x, y + 70); g.lineTo(x - 70, y); g.closePath(); g.stroke(); }
  g.fillStyle = '#4f4a44';
  for (const [x, y] of [[n / 2, n / 2], [0, 0], [n, 0], [0, n], [n, n]]) { g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 1.1, 1 / 1.1);
  return t;
}

export async function mountDaylight(canvas, opts = {}) {
  const reduced = !!opts.reduced;
  performance.mark?.('3d-mount');
  const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
  const QUALITY = LADDERS[phone ? 'phone' : 'desk'];
  const budget = BUDGET_MS[phone ? 'phone' : 'desk'];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; // one tone mapper for every view and the fallback still
  renderer.toneMappingExposure = 1.0; // 0.8 to 1.2: light 1.0, dark 0.92 (PALETTE.exposure)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  performance.mark?.('3d-gl');
  const scene = new THREE.Scene();
  // Environment: the CC0 HDRI (loaded below). The procedural RoomEnvironment is only a fallback if the HDRI fails,
  // so the wireframe frame is not held up by an extra PMREM pass at mount.
  let envRT = null;
  const roomEnv = () => { if (envRT) return; const pm = new THREE.PMREMGenerator(renderer); envRT = pm.fromScene(new RoomEnvironment(), 0.04); pm.dispose(); scene.environment = envRT.texture; };

  const T = buildTextures(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  performance.mark?.('3d-tex');
  const assets = createAssets(renderer, { phone });
  const rugMap = rugTexture();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    siding: std({ color: '#e6cd8c', map: T.siding, bumpMap: T.siding, bumpScale: 1.2, roughness: 0.82 }),
    trim: std({ color: '#f6f3ec', roughness: 0.6 }),
    sash: std({ color: '#f3f0e8', roughness: 0.5 }),
    door: std({ color: '#1f1f21', roughness: 0.45 }),
    glass: std({ color: '#d5dfe3', roughness: 0.02, metalness: 0, envMapIntensity: 1, transparent: true, opacity: 0.24 }),
    glassLit: std({ color: '#fff1d0', emissive: '#ffd99a', emissiveIntensity: 0.5, roughness: 0.4 }),
    metal: std({ color: '#3a3a3a', roughness: 0.4, metalness: 0.6 }),
    roof: std({ color: '#5d5f57', map: T.shingle, bumpMap: T.shingle, bumpScale: 2.2, roughness: 0.9 }),
    brick: std({ map: T.brick, bumpMap: T.brick, bumpScale: 1.2, roughness: 0.9 }),
    // inside the firebox: the same brick, smoked dark
    mat: std({ color: '#3a3936', roughness: 1 }),
    // fridge: satin stainless that reads light in a sunny room 
    fridge: std({ color: '#e6e4df', metalness: 0.8, roughness: 0.3, envMapIntensity: 2.3 }), // brushed stainless (Booking Desk kitchen r4): metal BRDF, reads light
    quarry: std({ color: '#7d3a2b', roughness: 0.35, envMapIntensity: 0.8 }),
    brickDark: std({ map: T.brick, color: '#4a3b35', roughness: 0.95 }),
    // fireplace doors: dark smoked tempered glass, strong reflections
    smoke: std({ color: '#121110', roughness: 0.02, metalness: 0.3, envMapIntensity: 2.2, transparent: true, opacity: 0.62 }),
    stone: std({ color: '#d9d6cf', map: T.stone, bumpMap: T.stone, bumpScale: 2.4, roughness: 0.95 }),
    paver: std({ map: T.paver, bumpMap: T.paver, bumpScale: 1.0, roughness: 0.9 }),
    deck: std({ color: '#a9a8a1', map: T.deck, roughness: 0.75 }),
    bead: std({ color: '#f8f6f0', map: T.bead, roughness: 0.7 }),
    concrete: std({ color: '#d9d4ca', map: T.concrete, roughness: 0.92 }),
    asphalt: std({ color: '#b9b5ad', map: T.asphalt, roughness: 0.95 }),
    lawn: std({ color: '#aebb93', map: T.lawn, roughness: 1 }),
    fence: std({ color: '#ddd2bf', map: T.fence, roughness: 0.9 }),
    soil: std({ color: '#6e5848', roughness: 1 }),
    greens: std({ color: '#7f9e62', roughness: 0.9, flatShading: true, side: THREE.DoubleSide }),
    hedge: std({ color: '#86a06a', roughness: 0.95 }),
    barrel: std({ color: '#8a6a4c', roughness: 0.8 }),
    leaf: std({ color: '#9aae7e', roughness: 0.9 }),
    fir: std({ color: '#6c8a66', roughness: 0.9, flatShading: true }),
    trunk: std({ color: '#76604f', roughness: 0.95 }),
    plinth: std({ color: '#ece6dc', roughness: 0.95 }),
    base: std({ color: '#6f6c67', map: T.concrete, roughness: 0.9 }),
    cedar: std({ color: '#a7764e', roughness: 0.65 }),
    sail: std({ color: '#a8916c', roughness: 0.85, side: THREE.DoubleSide }),
    // interior: wall paint per room comes in as vertex colour; CC0 maps arrive when someone looks inside
    plaster: std({ color: '#ffffff', vertexColors: true, roughness: 0.92 }),
    ceiling: std({ color: '#ffffff', roughness: 0.95, emissive: '#fff1de', emissiveIntensity: 0 }),
    oak: std({ color: '#dbd0c4', map: T.deck, roughness: 0.85 }), // warm oak (living palette)
    tile: std({ color: '#efe4ca', roughness: 0.4 }),
    cabinet: std({ color: '#e9cf98', roughness: 0.55 }), // cream-white painted shaker (photo 07); the yellow is counters + backsplash
    counter: std({ color: '#f6c62e', roughness: 0.3 }),
    wood: std({ color: '#8a6446', roughness: 0.6 }),
    walnut: std({ color: '#8f6f5c', roughness: 0.6 }),
    honey: std({ color: '#d39150', roughness: 0.65 }),
    dark: std({ color: '#2e2b28', roughness: 0.7 }),
    firebox: std({ color: '#1b1918', roughness: 0.9 }),
    fabric: std({ color: '#5d4e45', roughness: 1 }),
    sofa: std({ color: '#5a4b42', roughness: 1 }),
    cushion: std({ color: '#63544a', roughness: 1 }),
    pillowA: std({ color: '#cbbb98', roughness: 1 }),
    pillowB: std({ color: '#d7724f', roughness: 1 }),
    bedding: std({ color: '#f5f2eb', roughness: 1 }),
    teal: std({ color: '#2f8d97', roughness: 1 }),
    rug: std({ color: '#ffffff', map: rugMap, roughness: 1 }),
    leather: std({ color: '#3a3532', roughness: 0.6 }),
    steel: std({ color: '#efebe5', metalness: 0.7, roughness: 0.34, envMapIntensity: 1 }), // brushed stainless: some diffuse so the room light reads on it, not only the outdoor HDRI
    chrome: std({ color: '#ececec', metalness: 1, roughness: 0.07 }),
    brass: std({ color: '#d9b46a', metalness: 1, roughness: 0.3, envMapIntensity: 1.6 }),
    porcelain: std({ color: '#f7f6f2', roughness: 0.1 }),
    mirror: std({ color: '#e7eaec', metalness: 1, roughness: 0.02 }),
    screen: std({ color: '#0b0b0d', roughness: 0.06 }),
    toasterRed: std({ color: '#a8302a', roughness: 0.35, metalness: 0.2 }),
    sofaGrey: std({ color: '#6c6d70', roughness: 1 }),
    blackPlastic: std({ color: '#3b2c24', roughness: 0.5 }), // appliance plastics: read soft black, not void
    cushionGrey: std({ color: '#77787b', roughness: 1 }),
    ceramic: std({ color: '#3a2318', roughness: 0.08 }), // glass-ceramic cooktop: reads warm brown-black under the kitchen light
    blackMetal: std({ color: '#1e1e20', metalness: 0.6, roughness: 0.45 }),
    lamp: std({ color: '#fbf7ef', emissive: '#fff0d8', emissiveIntensity: 1, roughness: 0.5 }),
    lampshade: std({ color: '#f3e9d6', emissive: '#ffd59a', emissiveIntensity: 0.6, roughness: 0.9, side: THREE.DoubleSide }),
    sheer: std({ color: '#fbfaf6', roughness: 1, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    art: std({ color: '#7f9cb2', roughness: 0.6 }),
    art2: std({ color: '#7a6a58', roughness: 0.6 }), // R8: was coral, within dE76 8 of the accent and not in the photos
    art3: std({ color: '#a8bcc9', roughness: 0.6 }),
  };

  const model = opts.model === 'bungalow' ? 'bungalow' : 'massing';
  const built = model === 'bungalow'
    ? { geos: (performance.mark?.('3d-build0'), buildBungalow()), footprints: FOOTPRINTS, frame: BUNGALOW_FRAME, colors: BUNGALOW_COLORS }
    : buildMassing(opts.squareFeet);
  const { geos, footprints, frame } = built;
  for (const [k, c] of Object.entries(built.colors)) M[k]?.color.set(c);
  performance.mark?.('3d-built');
  const group = new THREE.Group();
  const noCast = new Set(['smoke', 'glass', 'glassLit', 'lawn', 'asphalt', 'paver', 'bead', 'soil', 'plinth', 'rug', 'tile', 'oak', 'sheer', 'lamp', 'lampshade']);
  let tris = 0;
  for (const [id, g] of Object.entries(geos)) {
    const [layer, key] = id.includes('/') ? id.split('/') : ['site', id];
    const mesh = new THREE.Mesh(g, M[key] || M.trim);
    mesh.castShadow = !noCast.has(key);
    mesh.receiveShadow = true;
    mesh.userData = { layer, mat: key, solid: mesh.material, cast: mesh.castShadow };
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    tris += g.attributes.position.count / 3;
  }
  scene.add(group);
  // soft contact shadows (AO decals)
  const ao = contactTexture();
  const aoMat = new THREE.MeshBasicMaterial({ color: '#000', alphaMap: ao, transparent: true, opacity: 0.2, depthWrite: false });
  const decals = [];
  for (const [x0, x1, z0, z1] of footprints) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), aoMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0.008, (z0 + z1) / 2);
    m.renderOrder = 1;
    decals.push(m);
    scene.add(m);
  }
  // lights
  const hemi = new THREE.HemisphereLight('#f6f1e8', '#c9bfae', 0.75);
  const sun = new THREE.DirectionalLight('#fff4e4', 3);
  sun.castShadow = true;
  const Q = { level: 0, t: [], d: [], since: 0, lock: false };
  const sm = QUALITY[Q.level].shadow;
  sun.shadow.mapSize.set(sm, sm);
  const sx = frame.shadow;
  Object.assign(sun.shadow.camera, { left: -sx, right: sx, top: sx, bottom: -sx, near: 1, far: 120 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  const target = new THREE.Object3D();
  target.position.set(...frame.sunTarget);
  sun.target = target;
  const fill = new THREE.AmbientLight('#fff6ea', 0); // soft room light for the walk-through and the open views
  scene.add(hemi, sun, target, fill);

  // ---------- photoreal assets (CC0, lazy) ----------
  // Exterior maps + the HDRI load with the 3D view. The interior (maps + glTF furniture) loads the first time
  // someone looks inside: cutaway, x-ray, walk, or taking control of the view.
  const furniture = new THREE.Group();
  scene.add(furniture);
  const roomLights = [];
  if (model === 'bungalow') for (const l of LIGHTS) {
    // ceiling domes throw a soft warm cone (a pool on the floor, falling off up the walls); bedside lamps are small points
    let p;
    if (l.kind === 'lamp') { p = new THREE.PointLight('#ffc47e', 0, 2.6, 2); p.userData.k = 3; }
    else if (l.kind === 'fill') { p = new THREE.PointLight('#ffd49a', 0, l.r ?? 5, 1); p.userData.k = l.k ?? 6; } // bounce from sunlit windows: soft, no shadow
    else {
      p = new THREE.SpotLight('#ffcf94', 0, 7, 1.1, 1, 2); p.userData.k = l.k ?? 50;
      p.target.position.set(l.x, l.y - 3, l.z); scene.add(p.target);
    }
    p.position.set(l.x, l.y, l.z);
    roomLights.push(p); scene.add(p);
  }
  const AFTER = { brickDark: '#5a4740', roof: '#d6d7d3', lawn: '#b9d39c', brick: '#ffffff', concrete: '#f4f2ec', paver: '#ffffff', asphalt: '#d8d8d8', hedge: '#a9cc8a', leaf: '#b5d395', fir: '#93b48c', greens: '#a9cc8a', base: '#a29f99', stone: '#bdb8af', deck: '#c4c0b6', fence: '#e8e0cf' };
  let skyHdr = null, envP = null, extP = null, intP = null;
  const bindGroup = (grp) => Promise.all(Object.entries(BINDINGS).filter(([k, [set]]) => M[k] && SETS[set].group === grp).map(async ([k, [set, opt]]) => {
    const loaded = await assets.loadSet(set);
    const m = M[k];
    m.bumpMap = null;
    bindSet(m, loaded, opt);
    if (AFTER[k]) m.color.set(AFTER[k]);
  }));
  const refresh = () => {
    if (disposed) return;
    for (const m of xrayOf.values()) m.dispose();
    xrayOf.clear();
    setMode(state.mode);
    renderer.shadowMap.needsUpdate = true; dirty = true; wake();
  };
  const loadEnv = () => envP || (envP = assets.loadEnv().then(({ hdr, rt }) => {
    if (disposed) return;
    skyHdr = hdr; scene.environment = rt.texture; envRT?.dispose(); envRT = null;
    applySun(); dirty = true; wake();
  }).catch(() => { if (!disposed) { roomEnv(); dirty = true; wake(); } }));
  const loadExterior = () => extP || (extP = bindGroup('exterior').then(refresh).catch(() => {}));
  const loadInterior = () => intP || (intP = (async () => {
    if (model !== 'bungalow') return;
    await bindGroup('interior');
    const keys = [...new Set(MODEL_SPOTS.map((s) => s.key))];
    const srcs = Object.fromEntries(await Promise.all(keys.map(async (k) => [k, await assets.loadModel(k).catch(() => null)])));
    if (disposed) return;
    for (const s of MODEL_SPOTS) {
      const src = srcs[s.key];
      if (!src) continue;
      src.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(src), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      const inner = src.clone(true);
      inner.position.set(-ctr.x, -box.min.y, -ctr.z);
      const outer = new THREE.Group();
      outer.add(inner);
      const k = s.size / Math.max(size.x, size.z);
      outer.scale.set(k, s.height ? s.height / size.y : k, k);
      outer.rotation.y = s.rot; outer.position.set(s.x, s.y, s.z); outer.userData.spot = s;
      outer.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        furnTris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      });
      furniture.add(outer);
    }
  })().then(refresh).catch(() => {}));
  const wantInterior = () => { if (model === 'bungalow') loadInterior(); };
  let furnTris = 0, disposed = false, env2P = null;
  const morph = { t: reduced ? 1 : 0, start: reduced ? -1 : 0, ready: false };
  let phase = '';
  const setPhase = (p) => {
    if (p === phase) return;
    phase = p; opts.onPhase?.(p); performance.mark?.('3d-' + p);
    if (p === 'settled') setTimeout(() => hiEnv?.(), 0);
  };
  const finishMorph = () => { morph.t = 1; morph.start = -1; if (morph.ready) setPhase('settled'); else setPhase('loading'); dirty = true; };
  const onLost = (e) => { e.preventDefault(); opts.onLost?.(); };

  // ---------- post: GTAO ambient occlusion (corners, under furniture), MSAA, ACES output ----------
  let composer = null, gtao = null;
  const sizeComposer = () => { if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, Hh); } };
  const ensureComposer = () => {
    if (composer) return composer;
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(scene, camera, 1, 1);
    gtao.blendIntensity = 0.9;
    gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 12, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    // glass, sheers and x-ray skins do not occlude
    const hide = gtao._overrideVisibility.bind(gtao);
    gtao._overrideVisibility = () => {
      hide();
      scene.traverse((o) => { if (o.isMesh && o.visible && o.material?.transparent) { o.visible = false; gtao._visibilityCache.push(o); } });
    };
    composer.addPass(gtao);
    composer.addPass(new OutputPass());
    sizeComposer();
    return composer;
  };
  const aoOn = () => QUALITY[Q.level].ao && state.mode !== 'xray' && state.mode !== 'wire';
  // wire -> solid morph: solid frame, a veil in the page colour fading out, and the edges fading out on top
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color() }, a: { value: 1 } },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform vec3 c; uniform float a; void main() { gl_FragColor = vec4(c, a); }',
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  }));
  veil.frustumCulled = false;
  const drawMorph = () => {
    if (!introEdges) { performance.mark?.('3d-edges0'); buildIntroEdges(); performance.mark?.('3d-edges1'); }
    const e = emphasized(morph.t);
    if (edges) edges.visible = false;
    if (e > 0) renderer.render(scene, camera); else renderer.clear();
    renderer.autoClear = false;
    veil.material.uniforms.c.value.set(PALETTE[state.theme].clear).convertLinearToSRGB();
    veil.material.uniforms.a.value = 1 - e;
    if (e > 0) renderer.render(veil, camera);
    edgeMat.opacity = 0.55 * (1 - e); edgeMat.depthTest = false; edgeMat.color.set(state.theme === 'dark' ? '#f0eee6' : '#2a2825');
    renderer.render(introEdges, camera);
    if (edges) edges.visible = state.mode === 'wire';
    edgeMat.opacity = 0.55; edgeMat.depthTest = true;
    renderer.autoClear = true;
  };
  const draw = () => {
    if (morph.t < 1) { drawMorph(); return; }
    if (aoOn()) ensureComposer().render(); else renderer.render(scene, camera);
  };
  const applyQuality = () => {
    const q = QUALITY[Q.level];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    if (sun.shadow.mapSize.x !== q.shadow) { sun.shadow.mapSize.set(q.shadow, q.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    renderer.setSize(W, Hh, false); sizeComposer();
    renderer.shadowMap.needsUpdate = true; dirty = true;
  };
  // walk collision: circle of radius 0.22 m against wall and furniture footprints
  const RW = 0.22;
  const blocked = (x, z) => BLOCKERS.some(([x0, x1, z0, z1]) => x > x0 - RW && x < x1 + RW && z > z0 - RW && z < z1 + RW);

  // ---------- camera + controls ----------
  // Orbit: OrbitControls (damped), but only while the viewer is "interactive" (clicked in, or fullscreen),
  // so the 3D never captures page scroll. Walk: first-person at eye height with WASD / pointer lock / touch.
  const ORBIT_FOV = 28, WALK_FOV = 68, EYE = 1.6;
  const camera = new THREE.PerspectiveCamera(ORBIT_FOV, 1, 0.3, 260);
  // RUBRIC R8: in-scene UI marks (pins, selection, hover outline, dimension lines, room tags, Rotate hint) live on UI_LAYER
  // and must use accent or ink only. canvas.__accentMask() returns a CSS-size 0/1 mask of those marks for the hue2 check.
  // Today every label, pin and hint is a DOM overlay, so nothing is on the layer and the mask is empty (all scene pixels exempt).
  const UI_LAYER = 7;
  canvas.__accentMask = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth)), h = Math.max(1, Math.round(canvas.clientHeight));
    const out = new Uint8Array(w * h);
    let any = false;
    scene.traverse((o) => { if (o.visible && o.layers.isEnabled(UI_LAYER) && !o.layers.isEnabled(0)) any = true; });
    if (!any) return out;
    const rt = new THREE.WebGLRenderTarget(w, h);
    const keep = { mask: camera.layers.mask, bg: scene.background, cc: renderer.getClearColor(new THREE.Color()), ca: renderer.getClearAlpha() };
    camera.layers.set(UI_LAYER); scene.background = null;
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
    const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    renderer.setRenderTarget(null); camera.layers.mask = keep.mask; scene.background = keep.bg; renderer.setClearColor(keep.cc, keep.ca); rt.dispose();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[(h - 1 - y) * w + x] = px[(y * w + x) * 4 + 3] > 0 ? 1 : 0;
    dirty = true;
    return out;
  };
  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 3;
  controls.maxDistance = 70;
  controls.maxPolarAngle = Math.PI * 0.475;   // never under the ground
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.rotateSpeed = 0.7;
  const lookWide = new THREE.Vector3(...frame.look), lookNarrow = new THREE.Vector3(...frame.lookNarrow);
  const home = { target: lookWide.clone(), pos: new THREE.Vector3(), dist: 34 };
  const homePose = (yawOff = 0, distK = 1) => {
    const yaw = frame.yaw + yawOff, cp = Math.cos(frame.pitch), d = home.dist * distK;
    return new THREE.Vector3(home.target.x + Math.sin(yaw) * cp * d, home.target.y + Math.sin(frame.pitch) * d, home.target.z + Math.cos(yaw) * cp * d);
  };
  const bounds = { x0: -16, x1: 14, z0: -20, z1: 22 };
  const clampOrbit = () => {
    const t = controls.target;
    t.set(Math.min(bounds.x1, Math.max(bounds.x0, t.x)), Math.min(8, Math.max(0, t.y)), Math.min(bounds.z1, Math.max(bounds.z0, t.z)));
    if (camera.position.y < 0.4) camera.position.y = 0.4;
  };
  let userMoved = false;
  controls.addEventListener('start', () => { userMoved = true; fly = null; wake(); });
  controls.addEventListener('change', () => { dirty = true; wake(); });

  // smooth camera moves (intro, reset, double-click focus)
  let fly = null;
  const flyTo = (pos, target, dur = 0.9) => {
    if (reduced || dur <= 0) { camera.position.copy(pos); controls.target.copy(target); controls.update(); dirty = true; wake(); return; }
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), t: 0, dur };
    wake();
  };

  // walk-through state
  const walk = { on: false, x: 0, z: 0, y: EYE, yaw: 0, pitch: 0, keys: new Set(), joy: { x: 0, y: 0 }, look: null };
  const setWalkPose = (r) => {
    walk.x = r.x; walk.z = r.z; walk.y = groundAt(r.x, r.z) + EYE;
    walk.yaw = Math.atan2(-r.look[0], -r.look[1]); walk.pitch = -0.04;
  };
  const placeWalk = () => {
    camera.position.set(walk.x, walk.y, walk.z);
    camera.rotation.set(walk.pitch, walk.yaw, 0, 'YXZ');
  };
  const setFov = (fov, near) => { camera.fov = fov; camera.near = near; camera.updateProjectionMatrix(); };

  // state
  const state = { season: opts.season || 'summer', hour: 0, hourT: 0, theme: 'light', playing: false, win: null, mode: 'solid' };
  const setSeason = (s) => {
    state.season = SEASONS[s] ? s : 'summer';
    state.win = dayWindow(state.season);
    const lo = state.win.rise + 0.25, hi = state.win.set - 0.17;
    state.lo = lo; state.hi = hi;
    if (!state.hourT) state.hourT = state.hour = state.win.noon;
    state.hourT = Math.min(hi, Math.max(lo, state.hourT));
    dirty = true;
  };
  let dirty = true;
  const warmLow = new THREE.Color('#ff8a3d'), warmMid = new THREE.Color('#ffc382'), white = new THREE.Color('#fff5e6');
  const applySun = () => {
    const s = SEASONS[state.season];
    const { elevation, azimuth } = sunAt(s.doy, state.hour, s.tz);
    const dir = azDir(azimuth, Math.max(elevation, 0.5));
    sun.position.copy(target.position).addScaledVector(dir, 60);
    const e = elevation;
    const k = smooth(-0.5, 9, e);
    sun.intensity = 4.6 * k * (0.86 + 0.14 * smooth(10, 50, e));
    sun.color.copy(warmLow).lerp(warmMid, smooth(2, 14, e)).lerp(white, smooth(14, 40, e));
    const p = PALETTE[state.theme];
    const inside = walk.on || state.mode === 'cutaway' || state.mode === 'xray';
    hemi.intensity = p.hemi * (0.5 + 0.5 * smooth(-2, 35, e)) * (walk.on ? 1.0 : state.mode !== 'solid' ? 1.1 : 1);
    hemi.color.set(p.hemiSky).lerp(warmMid, (1 - smooth(4, 25, e)) * 0.25);
    fill.intensity = (walk.on ? 0.42 : state.mode === 'solid' || state.mode === 'wire' ? 0 : 0.15) * (0.45 + 0.55 * smooth(-2, 30, e)) * (state.theme === 'dark' ? 0.8 : 1);
    // warm interior light: ceiling domes and table lamps, stronger as the daylight goes
    const lampK = (inside ? 1 : 0.3) * (0.6 + 0.4 * (1 - smooth(5, 40, e)));
    for (const l of roomLights) l.intensity = l.userData.k * lampK * (walk.on ? 1 : 0.6);
    // ceiling bounce: light off the floor and walls warms the painted ceiling a little when inside
    M.ceiling.emissiveIntensity = inside ? 0.3 * (0.7 + 0.3 * lampK) : 0;
    M.lamp.emissiveIntensity = 0.5 + 1.5 * lampK; M.lampshade.emissiveIntensity = 0.25 + 0.9 * lampK;
    scene.environmentIntensity = Math.min(1.5, Math.max(0.5, p.env * (0.3 + 0.7 * smooth(-2, 30, e)) * (walk.on ? 0.7 : 1))); // 0.5 to 1.5
    scene.background = walk.on && skyHdr ? skyHdr : null;
    scene.backgroundIntensity = 0.35 + 0.65 * k;
    renderer.shadowMap.needsUpdate = true;
    state.sun = { elevation, azimuth };
    // front of house faces SITE.front: sun on the entry face when within 80 degrees
    const diff = Math.abs((((azimuth - SITE.front) % 360) + 540) % 360 - 180);
    state.porchSun = elevation > 1 && diff < 80;
    opts.onState?.({ season: state.season, hour: state.hour, hourT: state.hourT, lo: state.lo, hi: state.hi, ...state.sun, porchSun: state.porchSun, playing: state.playing, win: state.win });
  };

  // walk-through: a tighter sun frustum around the house for crisper window light (fixed, so it never swims)
  const fitShadow = (tight) => {
    const e = tight ? 10.5 : frame.shadow;
    Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e });
    sun.shadow.camera.updateProjectionMatrix();
    if (tight) target.position.set(0, 1, 0.2); else target.position.set(...frame.sunTarget);
    target.updateMatrixWorld();
    applySun();
  };

  // ---------- view modes: solid / x-ray / cutaway / wireframe ----------
  const xrayOf = new Map();
  let edges = null;
  const edgeMat = new THREE.LineBasicMaterial({ color: '#3b3833', transparent: true, opacity: 0.55 });
  const edgesOf = (keep) => {
    const g = new THREE.Group();
    for (const mesh of group.children) {
      if (mesh.userData.layer === 'site' && /lawn|asphalt|plinth|soil/.test(mesh.userData.mat)) continue;
      if (!keep(mesh)) continue;
      const deg = /leaf|fir|hedge|greens|trunk/.test(mesh.userData.mat) ? 50 : 20;
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, deg), edgeMat);
      l.matrixAutoUpdate = false;
      g.add(l);
    }
    return g;
  };
  const buildEdges = () => {
    edges = edgesOf(() => true);
    edges.visible = state.mode === 'wire';
    scene.add(edges);
  };
  // the intro wireframe only needs what the opening (exterior) view shows: shell, roof and the site
  let introEdges = null;
  const buildIntroEdges = () => { introEdges = edgesOf((m) => ['shell', 'roof', 'site'].includes(m.userData.layer)); };
  const setMode = (mode) => {
    if (morph.t < 1 && mode !== state.mode) finishMorph();
    state.mode = ['solid', 'xray', 'cutaway', 'wire'].includes(mode) ? mode : 'solid';
    const m = state.mode;
    if (m === 'wire' && !edges) buildEdges();
    if (edges) edges.visible = m === 'wire';
    for (const mesh of group.children) {
      const { layer, solid } = mesh.userData;
      const outer = layer === 'shell' || layer === 'roof';
      mesh.visible = m !== 'wire' && !(m === 'cutaway' && outer);
      if (outer && m === 'xray') {
        let x = xrayOf.get(solid);
        if (!x) { x = solid.clone(); Object.assign(x, { transparent: true, opacity: 0.14, depthWrite: false }); xrayOf.set(solid, x); }
        mesh.material = x; mesh.castShadow = false;
      } else { mesh.material = solid; mesh.castShadow = mesh.userData.cast; }
    }
    for (const d of decals) d.visible = m !== 'wire';
    furniture.visible = m !== 'wire';
    if (m !== 'solid') wantInterior();
    const wireFill = state.theme === 'dark' ? '#f0eee6' : '#2a2825';
    edgeMat.color.set(wireFill);
    labelLayer?.classList.toggle('on', (m === 'cutaway' || m === 'xray') && !walk.on && model === 'bungalow');
    applySun();
    dirty = true; wake();
  };

  // room labels for x-ray / cutaway (DOM, projected each frame).
  // The whole pill has to sit on that room's floor. Grazing a partition is allowed
  // (the floor polygon is loose on interior edges) but crossing an exterior wall is not.
  // If the words cannot fit, the pill parks fully outside the wall, 8px clear, with a 1px leader.
  const labelLayer = opts.labels || null;
  const labels = [];
  if (labelLayer && model === 'bungalow') {
    labelLayer.replaceChildren();
    for (const r of ROOMS) {
      if (r.cx == null || !r.floor) continue;
      const el = document.createElement('span');
      el.className = 'sun-label';
      el.textContent = r.short || r.label;
      const leader = document.createElement('span');
      leader.className = 'sun-leader';
      labelLayer.appendChild(leader);
      labelLayer.appendChild(el);
      labels.push({ el, leader, floor: r.floor, yard: r.yard || [], p: new THREE.Vector3(r.cx, D.floor + 1.05, r.cz) });
    }
  }
  const v = new THREE.Vector3();
  const projectAt = (x, z, y) => {
    v.set(x, y, z).project(camera);
    return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * Hh, ok: v.z < 1 };
  };
  const insidePoly = (poly, x, y) => {
    let sign = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      if (Math.abs(c) < 0.01) continue;
      const s = c > 0 ? 1 : -1;
      if (sign && s !== sign) return false;
      sign = s;
    }
    return !!sign;
  };
  const rectInside = (poly, x, y, w, h) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([sx, sy]) => insidePoly(poly, x + sx * w / 2, y + sy * h / 2));
  const hitsShown = (shown, box) => shown.some((q) => box.x0 < q.x1 && box.x1 > q.x0 && box.y0 < q.y1 && box.y1 > q.y0);
  const placeLabels = () => {
    if (!labels.length || !labelLayer.classList.contains('on')) return;
    const shown = [];
    const housePolys = [];
    for (const y of [0, D.floor]) for (const q of [
      [[D.xl - 0.35, D.zb - 0.35], [D.xr + 0.35, D.zb - 0.35], [D.xr + 0.35, D.zf + 0.35], [D.xl - 0.35, D.zf + 0.35]],
      [[D.wx0 - 0.35, D.zf - 0.2], [D.xr + 0.35, D.zf - 0.2], [D.xr + 0.35, D.wz + 0.4], [D.wx0 - 0.35, D.wz + 0.4]],
    ]) {
      const pts = q.map(([x, z]) => projectAt(x, z, y));
      if (pts.every((pt) => pt.ok)) housePolys.push(pts);
    }
    const hitsHouse = (x, y, w, h) => housePolys.some((poly) => [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]].some(([sx, sy]) => insidePoly(poly, x + sx * w / 2, y + sy * h / 2)));
    for (const l of labels) {
      const anchor = projectAt(l.p.x, l.p.z, l.p.y);
      const w = l.el.offsetWidth || 96, h = l.el.offsetHeight || 26;
      const poly = anchor.ok ? l.floor.map(([x, z]) => projectAt(x, z, D.floor)) : null;
      const polyOk = poly && poly.every((pt) => pt.ok);
      const onCanvas = (x, y) => x - w / 2 >= 8 && x + w / 2 <= W - 8 && y - h / 2 >= 8 && y + h / 2 <= Hh - 8;
      const boxOf = (x, y) => ({ x0: x - w / 2 - 4, x1: x + w / 2 + 4, y0: y - h / 2 - 4, y1: y + h / 2 + 4 });
      let placed = null;
      if (polyOk) {
        const cx = poly.reduce((s, pt) => s + pt.x, 0) / poly.length;
        const cy = poly.reduce((s, pt) => s + pt.y, 0) / poly.length;
        // wall lines at the floor, so a pill cannot cover the foundation the way a high slice would allow
        const walls = [];
        for (const seg of l.yard) {
          const a = projectAt(seg[0][0], seg[0][1], D.floor), b = projectAt(seg[1][0], seg[1][1], D.floor);
          if (!a.ok || !b.ok) continue;
          const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey) || 1;
          let nx = ey / len, ny = -ex / len;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          if ((cx - mx) * nx + (cy - my) * ny > 0) { nx = -nx; ny = -ny; }
          walls.push({ nx, ny, mx, my });
        }
        const support = (n) => Math.abs(n.nx) * w / 2 + Math.abs(n.ny) * h / 2;
        const clears = (x, y) => walls.every((n) => (x - n.mx) * n.nx + (y - n.my) * n.ny + support(n) <= 1);
        const tries = [[anchor.x, anchor.y], [cx, cy]];
        for (let t = 0.25; t < 1; t += 0.25) tries.push([anchor.x + (cx - anchor.x) * t, anchor.y + (cy - anchor.y) * t]);
        for (const dx of [-24, 0, 24]) for (const dy of [-16, 0, 16]) tries.push([cx + dx, cy + dy]);
        // push the anchor back inside any exterior wall it crosses
        let px = anchor.x, py = anchor.y;
        for (let iter = 0; iter < 4; iter++) for (const n of walls) {
          const over = (px - n.mx) * n.nx + (py - n.my) * n.ny + support(n);
          if (over > 0.5) { px -= n.nx * (over + 1); py -= n.ny * (over + 1); }
        }
        tries.unshift([px, py]);
        for (const [x, y] of tries) {
          if (!onCanvas(x, y) || !rectInside(poly, x, y, w, h) || !clears(x, y) || hitsShown(shown, boxOf(x, y))) continue;
          placed = { x, y, leader: false };
          break;
        }
        if (!placed && l.yard.length) {
          const spots = [];
          for (const seg of l.yard) {
            // ground line: past the base of the foundation, not just the top of the wall
            const a = projectAt(seg[0][0], seg[0][1], 0), b = projectAt(seg[1][0], seg[1][1], 0);
            if (!a.ok || !b.ok) continue;
            const ex = b.x - a.x, ey = b.y - a.y, len = Math.hypot(ex, ey) || 1;
            let nx = ey / len, ny = -ex / len;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            if ((cx - mx) * nx + (cy - my) * ny > 0) { nx = -nx; ny = -ny; }
            const reach = Math.abs(nx) * w / 2 + Math.abs(ny) * h / 2;
            const x = mx + nx * (8 + reach), y = my + ny * (8 + reach);
            const overflow = reach + (anchor.x - mx) * nx + (anchor.y - my) * ny;
            spots.push({ x, y, nx, ny, overflow });
          }
          spots.sort((a, b) => b.overflow - a.overflow);
          for (const s of spots) {
            // slide along the wall so a long pill can still land on the canvas, clear of the others
            const tx = -s.ny, ty = s.nx;
            const shifts = [0, 48, -48, 96, -96, 144, -144];
            for (const along of shifts) {
              const x = s.x + tx * along, y = s.y + ty * along;
              if (!onCanvas(x, y) || hitsShown(shown, boxOf(x, y)) || hitsHouse(x, y, w, h)) continue;
              if (rectInside(poly, x, y, w, h)) continue;
              placed = { x, y, leader: true };
              break;
            }
            if (placed) break;
          }
        }
      }
      const hide = !placed;
      l.el.style.visibility = hide ? 'hidden' : 'visible';
      l.leader.style.visibility = hide || !placed.leader ? 'hidden' : 'visible';
      if (hide) continue;
      shown.push(boxOf(placed.x, placed.y));
      l.el.style.transform = `translate(${placed.x - w / 2}px, ${placed.y - h / 2}px)`;
      if (placed.leader) {
        const dx = placed.x - anchor.x, dy = placed.y - anchor.y, dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist, uy = dy / dist;
        const back = Math.abs(ux) * w / 2 + Math.abs(uy) * h / 2;
        const ex = placed.x - ux * back, ey = placed.y - uy * back;
        const len = Math.max(0, Math.hypot(ex - anchor.x, ey - anchor.y));
        const ang = Math.atan2(ey - anchor.y, ex - anchor.x) * 180 / Math.PI;
        l.leader.style.width = `${len}px`;
        l.leader.style.transform = `translate(${anchor.x}px, ${anchor.y}px) rotate(${ang}deg)`;
      }
    }
  };

  const paint = (mode) => {
    state.theme = mode === 'dark' ? 'dark' : 'light';
    const p = PALETTE[state.theme];
    renderer.setClearColor(p.clear, 1);
    M.plinth.color.set(p.plinth);
    hemi.groundColor.set(p.hemiGround);
    scene.environmentIntensity = p.env;
    renderer.toneMappingExposure = p.exposure;
    edgeMat.color.set(state.theme === 'dark' ? '#f0eee6' : '#2a2825');
    dirty = true;
    applySun();
  };

  // sizing: fit the house + front yard to the canvas
  let W = 1, Hh = 1;
  const resize = () => {
    W = canvas.clientWidth || 640; Hh = canvas.clientHeight || 360;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[Q.level].dpr));
    renderer.setSize(W, Hh, false);
    sizeComposer();
    camera.aspect = W / Math.max(1, Hh);
    const narrow = camera.aspect < 1.3;
    const rH = narrow ? frame.rHn : frame.rH, rV = narrow ? frame.rVn : frame.rV;
    home.target.copy(narrow ? lookNarrow : lookWide);
    const vf = (ORBIT_FOV * R) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
    home.dist = Math.max(rH / Math.tan(hf), rV / Math.tan(vf));
    if (!userMoved && !walk.on && !fly) { camera.position.copy(homePose()); controls.target.copy(home.target); controls.update(); }
    camera.updateProjectionMatrix();
    dirty = true;
  };

  // ---------- input ----------
  let interactive = false;
  const syncInput = () => {
    controls.enabled = interactive && !walk.on;
    canvas.style.touchAction = interactive ? 'none' : 'pan-y';
    canvas.style.cursor = walk.on ? (document.pointerLockElement === canvas ? 'none' : 'crosshair') : interactive ? 'grab' : 'pointer';
  };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pick = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(group.children.filter((m) => m.visible && !(state.mode === 'xray' && /shell|roof/.test(m.userData.layer))), false);
    return hits[0]?.point || null;
  };
  const onDbl = (e) => {
    if (!interactive) return;
    const p = pick(e);
    if (!p) return;
    if (walk.on) { // walk to the spot
      if (!blocked(p.x, p.z)) { walk.x = p.x; walk.z = p.z; }
      dirty = true; wake(); return;
    }
    userMoved = true;
    const off = camera.position.clone().sub(controls.target);
    const d = Math.min(Math.max(controls.minDistance * 1.6, off.length() * 0.55), 18);
    flyTo(p.clone().add(off.normalize().multiplyScalar(d)), p, 0.8);
  };
  // walk: mouse look (pointer lock when available, drag otherwise), touch drag-look
  const onDown = (e) => {
    if (!walk.on) return;
    if (e.pointerType === 'mouse' && e.button === 0 && canvas.requestPointerLock && document.pointerLockElement !== canvas) {
      try { const r = canvas.requestPointerLock(); r?.catch?.(() => {}); } catch { /* drag-look still works */ }
    }
    walk.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* locked or synthetic pointer */ }
  };
  const turn = (dx, dy) => {
    walk.yaw -= dx * 0.0032; walk.pitch = Math.max(-1.2, Math.min(1.2, walk.pitch - dy * 0.0032));
    dirty = true; wake();
  };
  const onMove = (e) => {
    if (!walk.on) return;
    if (document.pointerLockElement === canvas) { turn(e.movementX || 0, e.movementY || 0); return; }
    if (!walk.look || e.pointerId !== walk.look.id) return;
    const k = e.pointerType === 'touch' ? 1.5 : 1;
    turn((e.clientX - walk.look.x) * k, (e.clientY - walk.look.y) * k);
    walk.look.x = e.clientX; walk.look.y = e.clientY;
  };
  const onUp = (e) => { if (walk.look && e.pointerId === walk.look.id) walk.look = null; };
  const KEYS = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'run', ShiftRight: 'run' };
  const onKey = (e) => {
    if (!walk.on || !KEYS[e.code]) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    if (e.type === 'keydown') walk.keys.add(KEYS[e.code]); else walk.keys.delete(KEYS[e.code]);
    wake();
  };
  const onLock = () => { syncInput(); opts.onView?.(view()); };
  const onBlur = () => walk.keys.clear();
  canvas.addEventListener('dblclick', onDbl);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', onBlur);
  document.addEventListener('pointerlockchange', onLock);

  const view = () => ({ mode: state.mode, walking: walk.on, interactive, locked: document.pointerLockElement === canvas });
  const fwd = new THREE.Vector3();

  // loop: renders only when something changed; sleeps offscreen / hidden
  let raf = 0, running = false, onscreen = true, started = false, last = 0;
  const loop = (now) => {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const ft = last ? now - last : 0;
    const dt = Math.min(0.1, ft / 1000);
    last = now;
    let moving = false;
    if (state.playing) {
      state.hourT += dt * 1.1; // ~1.1 clock hours per second
      if (state.hourT >= state.hi - 0.9 && !opts.loop) { state.hourT = state.hi - 0.9; state.playing = false; }
      if (state.hourT >= state.hi && opts.loop) state.hourT = state.lo;
    }
    const dh = state.hourT - state.hour;
    if (Math.abs(dh) > 0.0008) { state.hour += reduced ? dh : dh * (1 - Math.exp(-dt * 9)); moving = true; applySun(); }
    if (walk.on) {
      const k = walk.keys;
      let f = (k.has('f') ? 1 : 0) - (k.has('b') ? 1 : 0) + walk.joy.y, s = (k.has('r') ? 1 : 0) - (k.has('l') ? 1 : 0) + walk.joy.x;
      const mag = Math.hypot(f, s);
      if (mag > 0.02) {
        walk.hold = false;
        if (mag > 1) { f /= mag; s /= mag; }
        const sp = (k.has('run') ? 3.2 : 1.45) * dt;
        const sy = Math.sin(walk.yaw), cy = Math.cos(walk.yaw);
        const nx = Math.min(bounds.x1 - 4, Math.max(bounds.x0 + 4, walk.x + (-sy * f + cy * s) * sp));
        const nz = Math.min(bounds.z1 - 4, Math.max(bounds.z0 + 4, walk.z + (-cy * f - sy * s) * sp));
        const stuck = blocked(walk.x, walk.z); // never trap someone who landed inside a footprint
        if (stuck || !blocked(nx, walk.z)) walk.x = nx;
        if (stuck || !blocked(walk.x, nz)) walk.z = nz;
        moving = true;
      }
      const gy = groundAt(walk.x, walk.z) + EYE;
      if (!walk.hold && Math.abs(gy - walk.y) > 0.002) { walk.y += (gy - walk.y) * (1 - Math.exp(-dt * 10)); moving = true; }
      if (moving || dirty) placeWalk();
    } else if (fly) {
      fly.t = Math.min(1, fly.t + dt / fly.dur);
      const e = 1 - Math.pow(1 - fly.t, 3);
      camera.position.lerpVectors(fly.p0, fly.p1, e);
      controls.target.lerpVectors(fly.t0, fly.t1, e);
      camera.lookAt(controls.target);
      if (fly.t >= 1) { fly = null; controls.update(); }
      moving = true;
    } else if (controls.enabled) {
      if (controls.update(dt)) { clampOrbit(); moving = true; }
    }
    if (moving || dirty) { draw(); placeLabels(); dirty = false; }
    // adaptive quality: p95 of the frame times over the last 2 s of motion against the budget
    if (moving && prevMoving && ft > 0 && ft < 2000 && !Q.lock) { // over 2 s is a stall (tab switch), not a frame
      if (!Q.since) Q.since = now;
      Q.t.push(now); Q.d.push(ft);
      while (Q.t.length > 4 && now - Q.t[0] > 2000) { Q.t.shift(); Q.d.shift(); } // last 2 s, and never fewer than 4 frames
      if (now - Q.since > 2000 && Q.d.length >= 4 && Q.level < QUALITY.length - 1) {
        const sorted = Q.d.slice().sort((a, b) => a - b);
        if (sorted[Math.floor(sorted.length * 0.95)] > budget) { Q.level++; Q.since = now; Q.t.length = 0; Q.d.length = 0; applyQuality(); }
      }
    }
    if (morph.start === 0 && morph.ready && onscreen) morph.start = now;
    if (morph.start && morph.t < 1) {
      morph.t = Math.min(1, (now - morph.start) / MORPH_MS);
      if (morph.t >= 1) { setPhase('settled'); if (introEdges) { for (const l of introEdges.children) l.geometry.dispose(); introEdges = null; } }
      dirty = true;
    }
    prevMoving = moving;
  };
  let prevMoving = false;
  const wake = () => {
    const go = onscreen && document.visibilityState !== 'hidden';
    if (go && !running) { running = true; last = 0; raf = requestAnimationFrame(loop); }
    else if (!go && running) { running = false; cancelAnimationFrame(raf); }
  };
  const io = new IntersectionObserver((es) => {
    onscreen = es.some((x) => x.isIntersecting);
    if (onscreen && !started && !opts.still) begin();
    if (!onscreen && interactive && !document.fullscreenElement) api.setInteractive(false);
    wake();
  }, { threshold: 0.2 });
  const ro = new ResizeObserver(() => { resize(); wake(); });
  const onWin = () => { resize(); wake(); };   // full screen enter/exit also fires a window resize
  window.addEventListener('resize', onWin);
  const vis = () => wake();
  document.addEventListener('visibilitychange', vis);

  function begin() {
    started = true;
    // intro is the wire -> solid morph only (MOTION.md 3.8): no camera move, no autoplay
    wake();
  }

  setSeason(state.season);
  resize();
  camera.position.copy(homePose()); controls.target.copy(home.target); camera.lookAt(home.target);
  paint(opts.theme || (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  state.hour = state.hourT = state.lo + 0.62 * (state.hi - state.lo); // mid afternoon
  if (opts.hour != null) { state.hour = state.hourT = Math.min(state.hi, Math.max(state.lo, opts.hour)); }
  if (opts.still || reduced) started = true;
  syncInput();
  applySun();
  draw();
  setPhase(morph.t < 1 ? 'wire' : 'loading');
  ro.observe(canvas);
  loadEnv(); loadExterior();
  // morph starts once the sky and the exterior maps are in (interior loads after, on demand); 2.5 s cap
  const kick = () => { if (disposed || morph.ready) return; morph.ready = true; if (morph.t >= 1) setPhase('settled'); wake(); };
  Promise.all([envP, extP]).then(kick);
  setTimeout(kick, 2500);
  // desktop: swap in the 2048x1024 HDRI once settled
  const hiEnv = () => {
    if (phone || env2P || disposed) return env2P;
    env2P = assets.loadEnv('sky-2k.hdr', { pmrem: false }).then(({ hdr }) => {
      if (disposed) return;
      const old = skyHdr;
      skyHdr = hdr; old?.dispose?.();
      applySun(); dirty = true; wake();
    }).catch(() => {});
    return env2P;
  };
  canvas.addEventListener('webglcontextlost', onLost);
  io.observe(canvas);

  const api = {
    stats: () => ({ calls: renderer.info.render.calls, tris: Math.round(tris + furnTris), furniture: furniture.children.length, meshes: group.children.length, textures: renderer.info.memory.textures, quality: Q.level, dpr: renderer.getPixelRatio(), ao: aoOn(), lights: roomLights.length, env: !!skyHdr }),
    /** Resolves when the assets requested so far (and the interior, if asked) have loaded and been applied. */
    ready(interior = false) {
      if (interior) wantInterior();
      return Promise.all([envP, extP, intP, env2P].filter(Boolean)).then(() => { renderer.shadowMap.needsUpdate = true; dirty = true; wake(); });
    },
    get phase() { return phase; },
    /** QA: interpenetration, contact, doorway and walk-path check (RUBRIC 3D realism, overlap rule). Loads the interior first. */
    collide: async () => { wantInterior(); await intP; const { collide } = await import('./qa-collide.js'); return collide({ ITEMS, STRUCT, DOORS, LEVELS, BLOCKERS, ROOMS, furniture }); },
    interpen: async () => { wantInterior(); await intP; const { interpen } = await import('./qa-interpen.js'); return interpen({ ITEMS, STRUCT, DOORS, LEVELS, BLOCKERS, ROOMS, furniture }); },
    /** QA: render the current view at w x h CSS px (DPR 1) and return a PNG data URL; same scene, tone mapping, exposure. */
    snapshot(w, h, pts) {
      const pr = renderer.getPixelRatio(), keep = [W, Hh];
      renderer.setPixelRatio(1); W = w; Hh = h; renderer.setSize(w, h, false); sizeComposer();
      camera.aspect = w / h; camera.updateProjectionMatrix();
      if (walk.on) placeWalk();
      renderer.shadowMap.needsUpdate = true; draw();
      const url = canvas.toDataURL('image/png');
      const px = pts ? pts.map(([x, y, z]) => { const v = new THREE.Vector3(x, y, z).project(camera); return [(v.x + 1) / 2 * w, (1 - v.y) / 2 * h, v.z]; }) : null;
      renderer.setPixelRatio(pr); [W, Hh] = keep; resize(); dirty = true; wake();
      return pts ? { url, px } : url;
    },
    /** QA: raycast pixels [[px, py], ...] of a w x h view to world points (first visible hit). */
    pick(w, h, list) {
      const keep = camera.aspect; camera.aspect = w / h; camera.updateProjectionMatrix();
      if (walk.on) placeWalk();
      camera.updateMatrixWorld();
      const rc = new THREE.Raycaster();
      const out = list.map(([px, py]) => {
        rc.setFromCamera(new THREE.Vector2(px / w * 2 - 1, 1 - py / h * 2), camera);
        const hit = rc.intersectObjects([group, furniture], true).find((x) => x.object.visible && !x.object.material?.transparent);
        return hit ? hit.point.toArray().map((v) => +v.toFixed(3)) : null;
      });
      camera.aspect = keep; camera.updateProjectionMatrix();
      return out;
    },
    /** QA: world point -> CSS px in the current view. */
    project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(camera); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * Hh, v.z]; },
    camera: () => ({ pos: camera.position.toArray().map((v) => +v.toFixed(3)), fov: camera.fov, yaw: +(walk.yaw / R).toFixed(1), pitch: +(walk.pitch / R).toFixed(1) }),
    /** GPU memory estimate per RUBRIC v2.2: textures w x h x 4 x 1.33 (unique sources) + geometry buffers, in MB. */
    memory(list = false) {
      const seen = new Set(); let tex = 0, geo = 0; const big = [], names = [];
      const addTex = (t) => {
        if (!t || !t.isTexture) return;
        const key = t.source?.uuid || t.uuid; if (seen.has(key)) return; seen.add(key);
        const img = t.mipmaps?.[0] || t.image || {}; const w = img.width || 0, h = img.height || 0;
        tex += w * h * 4 * 1.33; big.push(Math.max(w, h)); if (list) names.push(`${t.name || (t.isCompressedTexture ? 'ktx' : t.constructor.name)}:${w}x${h}`);
      };
      const geos = new Set();
      scene.traverse((o) => {
        if (o.geometry && !geos.has(o.geometry)) { geos.add(o.geometry); for (const a of Object.values(o.geometry.attributes)) geo += a.array.byteLength; if (o.geometry.index) geo += o.geometry.index.array.byteLength; }
        for (const m of [].concat(o.material || [])) for (const v of Object.values(m)) addTex(v);
      });
      addTex(scene.environment); addTex(skyHdr);
      return { texturesMB: +(tex / 2 ** 20).toFixed(1), geometryMB: +(geo / 2 ** 20).toFixed(1), totalMB: +((tex + geo) / 2 ** 20).toFixed(1), maxTexture: Math.max(0, ...big), count: seen.size, shadowMap: sun.shadow.mapSize.x, phone, ...(list ? { list: names } : {}) };
    },
    /** Scripted perf path: walk for walkMs through the house, then a 360 degree orbit; rAF deltas -> p50/p95/p99. */
    async perfRun({ walkMs = 20000, orbitMs = 8000, adaptive = true } = {}) {
      Q.lock = !adaptive;
      const deltas = { walk: [], orbit: [] };
      const frames = (bucket, ms, step) => new Promise((res) => {
        let t0 = 0, prev = 0;
        const f = (now) => {
          if (!t0) t0 = now; if (prev) bucket.push(now - prev); prev = now;
          step((now - t0) / ms);
          if (now - t0 < ms) requestAnimationFrame(f); else res();
        };
        requestAnimationFrame(f);
      });
      api.setInteractive(true);
      api.setWalk(true, 'living');
      const route = ['living', 'dining', 'kitchen', 'bed1', 'bed2', 'bath', 'bed3'].filter((k) => ROOMS.some((r) => r.key === k && r.x != null));
      let leg = -1;
      await frames(deltas.walk, walkMs, (u) => {
        const i = Math.min(route.length - 1, Math.floor(u * route.length));
        if (i !== leg) { leg = i; setWalkPose(ROOMS.find((r) => r.key === route[i])); }
        walk.yaw += 0.012; walk.joy.y = 0.6; dirty = true;
      });
      walk.joy.y = 0; api.setWalk(false); api.setMode('solid');
      const c = controls.target.clone(), r0 = camera.position.clone().sub(c);
      await frames(deltas.orbit, orbitMs, (u) => { camera.position.copy(c).add(r0.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), u * Math.PI * 2)); camera.lookAt(c); dirty = true; });
      const pct = (a, q) => { const s2 = a.slice().sort((x, y) => x - y); return +s2[Math.min(s2.length - 1, Math.floor(s2.length * q))].toFixed(1); };
      const all = deltas.walk.concat(deltas.orbit);
      Q.lock = false;
      return { frames: all.length, p50: pct(all, 0.5), p95: pct(all, 0.95), p99: pct(all, 0.99), walkP95: pct(deltas.walk, 0.95), orbitP95: pct(deltas.orbit, 0.95), budget, quality: Q.level, dpr: renderer.getPixelRatio(), shadow: sun.shadow.mapSize.x, ao: aoOn(), css: [W, Hh], renderer: renderer.getContext().getParameter(renderer.getContext().RENDERER) };
    },
    setQuality(level, lock = true) { Q.level = Math.max(0, Math.min(QUALITY.length - 1, level)); Q.lock = lock; applyQuality(); wake(); },
    walkPos: () => ({ x: +walk.x.toFixed(3), z: +walk.z.toFixed(3), y: +walk.y.toFixed(3), on: walk.on }),
    /** Renders n frames back to back (GPU-synchronised) and reports the time per frame. */
    bench(n = 60) {
      const gl = renderer.getContext();
      draw(); gl.finish();
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        if (walk.on) { walk.yaw += 0.01; placeWalk(); } else { camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.01); camera.lookAt(controls.target); }
        draw();
      }
      gl.finish();
      const ms = (performance.now() - t0) / n;
      return { frames: n, msPerFrame: +ms.toFixed(2), fps: +(1000 / ms).toFixed(1), quality: Q.level, dpr: renderer.getPixelRatio(), ao: aoOn(), css: [W, Hh], px: [Math.round(W * renderer.getPixelRatio()), Math.round(Hh * renderer.getPixelRatio())], tris: Math.round(tris + furnTris), renderer: gl.getParameter(gl.RENDERER) };
    },
    setHour(h) { state.playing = false; state.hourT = Math.min(state.hi, Math.max(state.lo, h)); wake(); },
    setSeason(s) { const f = (state.hourT - state.lo) / (state.hi - state.lo); setSeason(s); state.hourT = state.lo + f * (state.hi - state.lo); applySun(); wake(); },
    play() { if (state.hourT >= state.hi - 0.95) state.hourT = state.lo; state.playing = true; applySun(); wake(); },
    pause() { state.playing = false; applySun(); },
    setTheme: paint,
    setMode,
    setInteractive(on) {
      interactive = !!on;
      if (interactive) wantInterior();
      if (!interactive && walk.on) api.setWalk(false);
      syncInput(); opts.onView?.(view()); wake();
    },
    setWalk(on, roomKey) {
      on = !!on && model === 'bungalow';
      if (on === walk.on && !roomKey) return;
      if (on) {
        walk.hold = false;
        if (!walk.on) walk.saved = { pos: camera.position.clone(), target: controls.target.clone() };
        walk.on = true; fly = null;
        wantInterior(); fitShadow(true);
        setWalkPose(ROOMS.find((r) => r.key === (roomKey || 'living')) || ROOMS[1]);
        setFov(WALK_FOV, 0.05); placeWalk();
      } else {
        walk.on = false; walk.keys.clear(); walk.joy.x = walk.joy.y = 0;
        fitShadow(false);
        if (document.pointerLockElement === canvas) document.exitPointerLock?.();
        setFov(ORBIT_FOV, 0.3);
        const s = walk.saved;
        if (s) { camera.position.copy(s.pos); controls.target.copy(s.target); }
        camera.lookAt(controls.target); controls.update();
      }
      setMode(state.mode); syncInput(); opts.onView?.(view()); dirty = true; wake();
    },
    goTo(roomKey) { api.setWalk(true, roomKey); },
    setMove(x, y) { walk.joy.x = x; walk.joy.y = y; wake(); },
    setPose(p) { // for scripted captures: { walk: [x, z, yawDeg, pitchDeg] } or { orbit: [px,py,pz, tx,ty,tz] }
      if (p.walk && walk.on) {
        [walk.x, walk.z] = p.walk; walk.yaw = (p.walk[2] || 0) * R; walk.pitch = (p.walk[3] || 0) * R;
        walk.y = p.y ?? groundAt(walk.x, walk.z) + EYE; walk.hold = p.y != null; // p.y: absolute camera height for photo matching
        if (p.walk[4]) setFov(p.walk[4], 0.05); // [4]: vertical FOV for photo matching
        placeWalk();
      }
      if (p.orbit) { fly = null; userMoved = true; camera.position.set(...p.orbit.slice(0, 3)); controls.target.set(...p.orbit.slice(3)); camera.lookAt(controls.target); controls.update(); }
      dirty = true; wake();
    },
    resetView() {
      if (walk.on) { walk.saved = null; api.setWalk(false); }
      userMoved = false; resize();
      flyTo(homePose(), home.target, 0.9);
      opts.onView?.(view());
    },
    resize() { resize(); wake(); },
    rooms: () => (model === 'bungalow' ? ROOMS.filter((r) => r.x != null).map(({ key, label }) => ({ key, label })) : []),
    renderNow() { applySun(); state.hour = state.hourT; applySun(); if (walk.on) placeWalk(); else if (!fly) controls.update(); draw(); placeLabels(); },
    get state() { return state; },
    get view() { return view(); },
    dispose() {
      running = false; cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', vis);
      document.removeEventListener('pointerlockchange', onLock);
      window.removeEventListener('resize', onWin);
      canvas.removeEventListener('dblclick', onDbl);
      canvas.removeEventListener('webglcontextlost', onLost);
      veil.geometry.dispose(); veil.material.dispose();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      controls.dispose();
      labelLayer?.replaceChildren();
      for (const m of group.children) m.geometry.dispose();
      if (edges) for (const l of edges.children) l.geometry.dispose();
      if (introEdges) for (const l of introEdges.children) l.geometry.dispose();
      edgeMat.dispose();
      for (const m of xrayOf.values()) m.dispose();
      for (const m of Object.values(M)) m.dispose();
      for (const t of Object.values(T)) t.dispose();
      ao.dispose(); aoMat.dispose(); envRT?.dispose();
      disposed = true;
      furniture.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach((m) => m.dispose()); } });
      composer?.dispose(); gtao?.dispose(); rugMap.dispose(); assets.dispose();
      renderer.dispose();
    },
  };
  return api;
}
