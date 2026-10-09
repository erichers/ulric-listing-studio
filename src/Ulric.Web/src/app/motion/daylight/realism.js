// Photoreal assets for the bungalow model: CC0 PBR maps (KTX2), a CC0 HDRI, and CC0 glTF furniture (Draco + KTX2).
// Everything is fetched lazily from <base>/3d/. Exterior maps load with the 3D view; interior maps and furniture
// load the first time someone looks inside (cutaway, x-ray, walk) or takes control of the view.
import * as THREE from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Real-world size of one texture tile in metres (u, v). UVs on the model are in metres.
// floor: 9 planks per 1.7 m tile = 189 mm boards. tile: 6 x 3 tiles per 1.8 x 0.9 m = 300 mm tiles.
// siding: 14 courses per 1.57 m = 112 mm exposure. shingle: 26 courses per 4 m = 154 mm.
// Texel density (albedo px per metre). Desktop: floor 602, plaster 640, siding 652, tile 569, walnut 512, oak veneer 512,
// brick 512, fabrics 640 to 985; roof shingle and yard ground (concrete, grass, paver, asphalt, deck) 256 to 284, held
// there by the 96 MB desktop texture budget. Phone (tex/phone/): every surface 256 to 326, normal + roughness 256.
export const SETS = {
  floor: { tile: [1.7, 1.7], group: 'interior' },
  plaster: { tile: [1.6, 1.6], group: 'interior' },
  weave: { tile: [0.27, 0.28], group: 'interior' },
  cotton: { tile: [0.26, 0.26], group: 'interior' },
  linen: { tile: [0.27, 0.27], group: 'interior' },
  leather: { tile: [0.4, 0.4], group: 'interior' },
  walnut: { tile: [1.0, 1.0], group: 'interior' },
  oakveneer: { tile: [1.0, 1.0], group: 'interior' },
  tile: { tile: [1.8, 0.9], group: 'interior' },
  siding: { tile: [1.57, 1.57], group: 'exterior' },
  shingle: { tile: [4.0, 4.0], group: 'exterior' },
  brick: { tile: [1.0, 1.0], group: 'exterior' },
  concrete: { tile: [2.0, 2.0], group: 'exterior' },
  grass: { tile: [2.0, 2.0], group: 'exterior' },
  paver: { tile: [2.0, 2.0], group: 'exterior' },
  asphalt: { tile: [2.0, 2.0], group: 'exterior' },
  deck: { tile: [1.8, 1.8], group: 'exterior' },
};

// material key -> [set, options]. normalScale tunes how strongly the surface reads; rough is a multiplier.
export const BINDINGS = {
  siding: ['siding', { normal: 0.8 }], roof: ['shingle', { normal: 1.2 }], brick: ['brick', { normal: 1 }], brickDark: ['brick', { normal: 1 }],
  concrete: ['concrete', { normal: 0.6 }], base: ['concrete', { normal: 0.6 }], paver: ['paver', { normal: 1 }],
  lawn: ['grass', { normal: 0.8 }], asphalt: ['asphalt', { normal: 0.6 }], deck: ['deck', { normal: 0.8 }],
  fence: ['deck', { normal: 0.6 }], hedge: ['grass', { normal: 1.4 }], leaf: ['grass', { normal: 1.4 }], greens: ['grass', { normal: 1.4 }],
  fir: ['grass', { normal: 1.4 }], stone: ['concrete', { normal: 1.2 }],
  // interior
  oak: ['floor', { normal: 0.6 }], plaster: ['plaster', { normal: 0.35 }], ceiling: ['plaster', { normal: 0.3 }],
  tile: ['tile', { normal: 0.8 }], walnut: ['walnut', { normal: 0.5 }], wood: ['walnut', { normal: 0.5 }], honey: ['oakveneer', { normal: 0.4 }],
  sofa: ['weave', { normal: 1.0 }], cushion: ['weave', { normal: 1.0 }], sofaGrey: ['weave', { normal: 1.0 }], cushionGrey: ['weave', { normal: 1.0 }], fabric: ['weave', { normal: 1.0 }], rug: ['weave', { normal: 1.2, keepMap: true }],
  pillowA: ['cotton', { normal: 0.8 }], pillowB: ['linen', { normal: 0.8 }], bedding: ['cotton', { normal: 0.8 }], teal: ['linen', { normal: 0.9 }],
  leather: ['leather', { normal: 0.8 }], cabinet: ['plaster', { normal: 0.08, noMap: true }],
};

export const MODELS = {
  // CC0 glTF from Poly Haven, Draco geometry + KTX2 textures. size: target footprint in metres (largest of x/z).
  recliner: { file: 'modern_arm_chair_01.glb' },
  ottoman: { file: 'Ottoman_01.glb' },
  coffee: { file: 'WoodenTable_01.glb' },
  pillows: { file: 'throw_pillows_01.glb' },
  plantSmall: { file: 'potted_plant_04.glb' },
  plantLarge: { file: 'potted_plant_02.glb' },
  nightstand: { file: 'ClassicNightstand_01.glb' },
};

export function assetBase() {
  const b = typeof document !== 'undefined' ? document.baseURI : '/';
  return new URL('3d/', b).href;
}

export function createAssets(renderer, { phone = false } = {}) {
  const base = assetBase();
  const ktx2 = new KTX2Loader().setTranscoderPath(base + 'basis/').detectSupport(renderer);
  const draco = new DRACOLoader().setDecoderPath(base + 'draco/');
  const gltf = new GLTFLoader().setKTX2Loader(ktx2).setDRACOLoader(draco);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const cache = new Map();
  const loadTex = (name, srgb) => {
    if (!cache.has(name)) cache.set(name, ktx2.loadAsync(base + 'tex/' + (phone ? 'phone/' : '') + name + '.ktx2').then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
      return t;
    }));
    return cache.get(name);
  };
  const sets = new Map();
  const loadSet = (key) => {
    if (!sets.has(key)) sets.set(key, Promise.all([loadTex(key + '_c', true), loadTex(key + '_n', false), loadTex(key + '_r', false)])
      .then(([map, normalMap, roughnessMap]) => ({ map, normalMap, roughnessMap, tile: SETS[key].tile })));
    return sets.get(key);
  };
  const models = new Map();
  const loadModel = (key) => {
    if (!models.has(key)) models.set(key, gltf.loadAsync(base + 'models/' + (phone ? 'phone/' : '') + MODELS[key].file).then((g) => g.scene));
    return models.get(key);
  };
  // HDRI: sky.hdr is 1024x512 (phone; and on desktop the PMREM lighting source). sky-2k.hdr is 2048x1024 (desktop,
  // swapped in after settle as the background seen through the windows; pmrem: false keeps the 96 MB texture budget).
  const envs = new Map();
  const loadEnv = (file = 'sky.hdr', { pmrem = true } = {}) => envs.get(file) || envs.set(file, new HDRLoader().loadAsync(base + file).then((hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    if (!pmrem) return { hdr, rt: null };
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromEquirectangular(hdr);
    pm.dispose();
    return { hdr, rt };
  })).get(file);
  return {
    loadSet, loadModel, loadEnv,
    dispose() {
      ktx2.dispose(); draco.dispose();
      for (const p of cache.values()) p.then((t) => t.dispose()).catch(() => {});
      for (const p of envs.values()) p.then(({ hdr, rt }) => { hdr.dispose(); rt?.dispose(); }).catch(() => {});
    },
  };
}

// Bind a loaded set to a material: one transform per texture so every map shares the metre-scale tiling.
export function bind(mat, set, opt = {}) {
  const rep = [1 / set.tile[0], 1 / set.tile[1]];
  const use = (t) => { const c = t.clone(); c.repeat.set(rep[0], rep[1]); c.needsUpdate = true; return c; };
  if (!opt.noMap && !opt.keepMap) mat.map = use(set.map);
  if (opt.keepMap && mat.map) { /* pattern stays; texture from the set supplies relief only */ }
  mat.normalMap = use(set.normalMap);
  const n = opt.normal ?? 1; mat.normalScale.set(n, n);
  mat.roughnessMap = use(set.roughnessMap);
  mat.needsUpdate = true;
}
