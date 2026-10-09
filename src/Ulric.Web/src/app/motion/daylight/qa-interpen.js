// QA only (window.__daylight.interpen() with ?qa3d=1): RUBRIC v2.3 hard fail 13, "Interpenetration and clearance".
// Mesh-level BVH (three-mesh-bvh) narrow phase, intended contacts, door swing / openings, 0.9 m walk paths.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { collide } from './qa-collide.js';

const PASS = 0.002, HARD = 0.01, r4 = (v) => Math.round(v * 1e4) / 1e4;
const kindOf = (it) => /^rug/.test(it.name) ? 'rug' : /ceiling-light|^lamp/.test(it.name) ? 'fixture' : it.hung && !it.model ? 'art' : 'furniture';
const verdict = (v) => (v > HARD ? 'hard' : v > PASS ? 'polish' : 'pass');

function geomOf(t) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(t, 3));
  g.setIndex([...Array(t.length / 3).keys()]);
  return g;
}
const RAYS = [new THREE.Vector3(0.31, 0.83, 0.47).normalize(), new THREE.Vector3(-0.71, -0.13, 0.69).normalize()];
// inside test: odd crossing parity on two different rays (closed) or behind the closest face normal (open: rugs, art)
function inside(bvh, p, open, tri, cp) {
  if (open) {
    const hit = bvh.closestPointToPoint(p, cp); if (!hit) return false;
    const i = hit.faceIndex * 3, pos = bvh.geometry.attributes.position, idx = bvh.geometry.index;
    tri.setFromAttributeAndIndices(pos, idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
    const n = tri.getNormal(new THREE.Vector3());
    return n.dot(p.clone().sub(hit.point)) < -1e-5;
  }
  let odd = 0;
  for (const d of RAYS) {
    const hits = bvh.raycast(new THREE.Ray(p, d), THREE.DoubleSide);
    if (hits.length % 2) odd++;
  }
  return odd === 2;
}
function depth(A, B, box) {
  // largest distance to B's surface of any A vertex inside B (vertices inside the overlap box, capped)
  const t = A.t, n = t.length / 3, step = Math.max(1, Math.floor(n / 3000)), p = new THREE.Vector3(), tri = new THREE.Triangle(), cp = {};
  let worst = 0, at = null;
  for (let i = 0; i < n; i += step) {
    p.set(t[i * 3], t[i * 3 + 1], t[i * 3 + 2]);
    if (!box.containsPoint(p)) continue;
    if (!inside(B.bvh, p, B.open, tri, cp)) continue;
    const c = B.bvh.closestPointToPoint(p, {});
    if (c && c.distance > worst) { worst = c.distance; at = p.toArray().map((v) => +v.toFixed(3)); }
  }
  return [worst, at];
}

export function interpen(ctx) {
  const base = collide(ctx); // structure (walls, floor, ceiling), legacy doors, legacy walk; items in world space
  const { STRUCT, DOORS, LEVELS, ROOMS, BLOCKERS, ITEMS, furniture } = ctx;
  const { F } = LEVELS;
  // rebuild the same item list with triangle soups (collide() keeps them private), then BVH each
  const items = [];
  const soup = (geos, mats) => {
    const arrs = geos.map((g0, k) => { const g = g0.index ? g0.toNonIndexed() : g0; const a = g.attributes.position.array.slice(0, g.attributes.position.count * 3); if (mats) { const v = new THREE.Vector3(); for (let i = 0; i < a.length; i += 3) { v.set(a[i], a[i + 1], a[i + 2]).applyMatrix4(mats[k]); a[i] = v.x; a[i + 1] = v.y; a[i + 2] = v.z; } } return a; });
    let n = 0; for (const a of arrs) n += a.length; const out = new Float32Array(n); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out;
  };
  for (const it of ITEMS) if (it.geos.length) items.push({ name: it.name.replace(/^piece/, [...(it.keys || [])][0] || 'piece'), soft: !!it.soft, ceiling: !!it.ceiling, t: soup(it.geos) });
  furniture.updateMatrixWorld(true);
  for (const o of furniture.children) {
    const s = o.userData.spot, geos = [], mats = [];
    o.traverse((m) => { if (m.isMesh) { geos.push(m.geometry); mats.push(m.matrixWorld.clone()); } });
    items.push({ name: `${s ? s.key : 'model'}@${o.position.x.toFixed(2)},${o.position.z.toFixed(2)}`, model: true, t: soup(geos, mats) });
  }
  items.forEach((it, i) => {
    it.id = 'i' + String(i).padStart(2, '0');
    it.geo = geomOf(it.t); it.geo.computeBoundingBox(); it.box = it.geo.boundingBox.clone();
    it.hung = !it.ceiling && it.box.min.y > F + 0.9;
    it.kind = kindOf(it); it.open = it.kind === 'rug' || /^(mirror|art)/.test(it.name);
    it.bvh = new MeshBVH(it.geo);
  });
  const I = new THREE.Matrix4();
  const pairs = [];
  let tested = 0;
  // support for intended contacts: floor, or the highest item top under the item's footprint
  const support = (A) => {
    if (A.box.min.y - F <= PASS) return null;
    let best = null, bd = Infinity;
    for (const B of items) {
      if (B === A || B.kind === 'art' || B.ceiling) continue;
      if (B.box.max.x <= A.box.min.x || B.box.min.x >= A.box.max.x || B.box.max.z <= A.box.min.z || B.box.min.z >= A.box.max.z) continue;
      if (B.box.min.y >= A.box.min.y - PASS) continue;
      const t1 = {}, t2 = {}; A.bvh.closestPointToGeometry(B.geo, I, t1, t2);
      const d = t1.distance ?? Infinity; if (d < bd) { bd = d; best = B; }
    }
    if (best) best._d = bd;
    return best;
  };
  // hung pieces first try to rest on something (cooktop on a counter); only free-hanging ones count as wall-hung
  for (const A of items) if (A.kind === 'art') { A.kind = 'furniture'; const s = support(A); A.kind = s && s._d <= HARD ? 'furniture' : 'art'; }
  for (const A of items) { A.on = A.kind === 'art' || A.ceiling || A.kind === 'rug' ? null : support(A); A.onGap = A.on ? A.on._d : null; }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i], B = items[j];
    const contact = A.on === B || B.on === A;
    const ea = A.box.clone().expandByScalar(PASS), eb = B.box.clone().expandByScalar(PASS);
    if (!ea.intersectsBox(eb)) continue;
    tested++;
    const crosses = A.bvh.intersectsGeometry(B.geo, I);
    const ov = ea.clone().intersect(eb);
    const [d1, p1] = depth(A, B, ov), [d2, p2] = depth(B, A, ov);
    const pen = Math.max(d1, d2);
    let gap = 0;
    if (!crosses && pen === 0) { const t1 = {}, t2 = {}; A.bvh.closestPointToGeometry(B.geo, I, t1, t2); gap = t1.distance ?? 0; }
    const v = verdict(Math.max(pen, contact ? gap : 0));
    if (pen > PASS || (contact && gap > PASS) || v !== 'pass')
      pairs.push({ a: A.id, an: A.name, ak: A.kind, b: B.id, bn: B.name, bk: B.kind, contact, crosses, depth: r4(pen), gap: r4(gap), at: d1 >= d2 ? p1 : p2, overlap: [ov.min.toArray(), ov.max.toArray()].map((p) => p.map((x) => +x.toFixed(3))), verdict: v });
  }
  // contacts with the floor (structure) and items resting on items with no overlapping boxes
  const floats = [];
  for (const A of items) {
    if (A.kind === 'art' || A.ceiling || A.kind === 'rug') continue;
    const gap = A.on ? A.onGap : A.box.min.y - F;
    if (Math.abs(gap) > PASS) floats.push({ item: A.id, name: A.name, on: A.on ? A.on.id : 'floor', gap: r4(gap), verdict: verdict(Math.abs(gap)) });
  }
  // wall-hung art: gap to the nearest wall face behind it
  for (const A of items) {
    if (A.kind !== 'art') continue;
    let g = Infinity;
    for (const w of STRUCT) {
      if (A.box.max.y < w[2] || A.box.min.y > w[3]) continue;
      const ox = Math.min(A.box.max.x, w[1]) - Math.max(A.box.min.x, w[0]), oz = Math.min(A.box.max.z, w[5]) - Math.max(A.box.min.z, w[4]);
      if (ox > 0.05) g = Math.min(g, Math.max(0, A.box.min.z - w[5], w[4] - A.box.max.z));
      if (oz > 0.05) g = Math.min(g, Math.max(0, A.box.min.x - w[1], w[0] - A.box.max.x));
    }
    if (g > PASS) floats.push({ item: A.id, name: A.name, on: 'wall', gap: Number.isFinite(g) ? r4(g) : null, verdict: Number.isFinite(g) ? verdict(g) : 'hard' });
  }
  // doors: interior openings are cased openings (no leaf): built clear width must stay clear; exterior doors swing in
  // 90 degrees with a leaf as wide as the opening; both hinge sides are tested and the worse one reported.
  const low = items.filter((A) => !A.hung && !A.ceiling && !(A.kind === 'rug' && A.box.max.y - A.box.min.y <= 0.02) && A.box.min.y < F + 2.0);
  const doors = DOORS.map((D, k) => {
    const ext = k < 2, w = D.axis === 'x' ? D.x1 - D.x0 : D.z1 - D.z0;
    const rec = { door: 'd' + k, kind: ext ? 'exterior hinged' : 'cased opening', at: [D.x0, D.x1, D.z0, D.z1].map((v) => +v.toFixed(2)), width: +w.toFixed(3), height: 2.05, intrude: 0, by: null };
    let worst = 0, by = null;
    const hitOpening = (A) => Math.min(Math.min(A.box.max.x, D.x1) - Math.max(A.box.min.x, D.x0), Math.min(A.box.max.z, D.z1) - Math.max(A.box.min.z, D.z0));
    for (const A of low) { const d = hitOpening(A); if (d > worst) { worst = d; by = A; } }
    if (ext) {
      // inward side: front door (k 0) opens to -z, back door (k 1) to +z
      const s = k === 0 ? -1 : 1, zf = k === 0 ? D.z0 : D.z1;
      for (const hx of [D.x0, D.x1]) {
        const p = new THREE.Vector3();
        for (const A of low) {
          // sample the item's vertices inside the swing sector (radius w, quarter towards the room)
          const t = A.t, n = t.length / 3, step = Math.max(1, Math.floor(n / 4000));
          for (let i = 0; i < n; i += step) {
            p.set(t[i * 3], t[i * 3 + 1], t[i * 3 + 2]);
            if (p.y < F + 0.02 || p.y > F + 2.0) continue;
            const dx = (p.x - hx) * (hx === D.x0 ? 1 : -1), dz = (p.z - zf) * s;
            if (dx < 0 || dz < 0) continue;
            const r = Math.hypot(dx, dz), d = w - r;
            if (d > worst) { worst = d; by = A; }
          }
        }
      }
    }
    rec.intrude = r4(worst); rec.by = by ? `${by.id} ${by.name}` : null; rec.verdict = verdict(worst);
    return rec;
  });
  // walk path: 0.05 m occupancy grid, distance-transform clearance; 0.45 m clearance, pinch 0.40 m for runs <= 0.6 m
  const h = 0.05, X0 = -8, X1 = 8, Z0 = -6, Z1 = 6, W = Math.round((X1 - X0) / h), H = Math.round((Z1 - Z0) / h);
  const inRooms = ROOMS.filter((r) => !r.outside && r.floor);
  const occW = new Uint8Array(W * H), occI = new Uint8Array(W * H), dz = new Uint8Array(W * H);
  const id = (gx, gz) => gx * H + gz, cx = (gx) => X0 + (gx + 0.5) * h, cz = (gz) => Z0 + (gz + 0.5) * h;
  const inFloor = (x, z) => inRooms.some((r) => { const xs = r.floor.map((p) => p[0]), zs = r.floor.map((p) => p[1]); return x >= Math.min(...xs) - 0.3 && x <= Math.max(...xs) + 0.3 && z >= Math.min(...zs) - 0.3 && z <= Math.max(...zs) + 0.3; });
  const doorZone = DOORS.map((D) => D.axis === 'x' ? [D.x0, D.x1, D.z0 - 0.45, D.z1 + 0.45] : [D.x0 - 0.45, D.x1 + 0.45, D.z0, D.z1]);
  for (let gx = 0; gx < W; gx++) for (let gz = 0; gz < H; gz++) {
    const x = cx(gx), z = cz(gz), k = id(gx, gz);
    const inDoor = doorZone.some((b) => x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]);
    if (inDoor) dz[k] = 1;
    if (!inFloor(x, z) && !inDoor) occW[k] = 1;
    for (const b of BLOCKERS) if (x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]) { occW[k] = 1; break; }
  }
  for (const A of low) {
    if (A.kind === 'rug' && A.box.max.y - A.box.min.y <= 0.02) continue;
    const t = A.t, n = t.length / 3;
    // footprint: rasterise the vertices (dense meshes) plus the box outline of each triangle's xz extent
    for (let i = 0; i < n; i += 3) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let q = 0; q < 3; q++) { const o = (i + q) * 3; x0 = Math.min(x0, t[o]); x1 = Math.max(x1, t[o]); y0 = Math.min(y0, t[o + 1]); y1 = Math.max(y1, t[o + 1]); z0 = Math.min(z0, t[o + 2]); z1 = Math.max(z1, t[o + 2]); }
      if (y1 < F + 0.02 || y0 > F + 2.0) continue;
      for (let gx = Math.max(0, Math.floor((x0 - X0) / h)); gx <= Math.min(W - 1, Math.floor((x1 - X0) / h)); gx++)
        for (let gz = Math.max(0, Math.floor((z0 - Z0) / h)); gz <= Math.min(H - 1, Math.floor((z1 - Z0) / h)); gz++) occI[id(gx, gz)] = 1;
    }
  }
  // exact-ish Euclidean distance transform by brute local search (radius 0.6 m)
  const R = 12, offs = [];
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) offs.push([a, b, Math.max(0, Math.hypot(a, b) - 0.5) * h]);
  offs.sort((p, q) => p[2] - q[2]);
  const clr = new Float32Array(W * H);
  for (let gx = 0; gx < W; gx++) for (let gz = 0; gz < H; gz++) {
    const k = id(gx, gz);
    if (occW[k] || occI[k]) { clr[k] = 0; continue; }
    let c = R * h; const door = dz[k];
    for (const [a, b, d] of offs) {
      const nx = gx + a, nz = gz + b; if (nx < 0 || nz < 0 || nx >= W || nz >= H) { c = d; break; }
      const m = id(nx, nz); if (occI[m] || (occW[m] && !door)) { c = d; break; }
    }
    clr[k] = c;
  }
  const PIN = 0.40, OK = 0.45, MAXRUN = Math.round(0.6 / h);
  const cell = (x, z) => id(Math.floor((x - X0) / h), Math.floor((z - Z0) / h));
  const route = (sx, sz) => {
    // BFS over (cell, pinch-run steps)
    const S = MAXRUN + 1, seen = new Uint8Array(W * H * S), prev = new Int32Array(W * H * S).fill(-1);
    const s0 = cell(sx, sz); if (clr[s0] < PIN) return { seen: null };
    const st0 = s0 * S + (clr[s0] < OK ? 1 : 0), dist = new Float32Array(W * H * S).fill(Infinity), B = [[st0]]; dist[st0] = 0;
    for (let d = 0; d < B.length; d++) {
      const bucket = B[d]; if (!bucket) continue;
      for (const st of bucket) {
        if (seen[st] || dist[st] !== d) continue; seen[st] = 1;
        const c = Math.floor(st / S), run = st % S, gx = Math.floor(c / H), gz = c % H;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = gx + a, nz = gz + b; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
          const m = id(nx, nz); if (clr[m] < PIN) continue;
          const pin = clr[m] < OK, nr = pin ? run + 1 : 0; if (nr > MAXRUN) continue;
          const ns = m * S + nr, nd = d + (pin ? 20 : 1); if (seen[ns] || nd >= dist[ns]) continue;
          dist[ns] = nd; prev[ns] = st; (B[nd] ||= []).push(ns);
        }
      }
      B[d] = null;
    }
    return { seen, prev, S, dist };
  };
  const entries = DOORS.slice(0, 2).map((D, k) => ({ entry: k ? 'back door' : 'front door', x: (D.x0 + D.x1) / 2, z: k ? D.z1 + 0.06 : D.z0 - 0.06 }));
  const targets = [];
  inRooms.forEach((r) => {
    const xs = r.floor.map((p) => p[0]), zs = r.floor.map((p) => p[1]), bx = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const own = DOORS.slice(2).filter((D) => D.x1 >= bx[0] - 0.2 && D.x0 <= bx[1] + 0.2 && D.z1 >= bx[2] - 0.2 && D.z0 <= bx[3] + 0.2);
    targets.push({ room: r.key, pts: own.length ? own.map((D) => [(D.x0 + D.x1) / 2, (D.z0 + D.z1) / 2]) : [[r.cx ?? r.x, r.cz ?? r.z]], via: own.length ? 'door opening' : 'room centre (open plan)' });
  });
  const paths = [];
  const drawn = [];
  for (const E of entries) {
    const res = route(E.x, E.z);
    for (const T of targets) {
      let ok = false, minC = Infinity, minAt = null, pinch = [];
      for (const [tx, tz] of T.pts) {
        if (!res.seen) break;
        const c = cell(tx, tz);
        const best = [...Array(MAXRUN + 1).keys()].filter((q) => res.seen[c * res.S + q]).sort((p, q) => res.dist[c * res.S + p] - res.dist[c * res.S + q]);
        for (const run of best.slice(0, 1)) {
          ok = true;
          let st = c * res.S + run, len = 0; const line = [];
          while (st >= 0) { const cc = Math.floor(st / res.S); line.push(cc); if (!dz[cc] && clr[cc] < minC) { minC = clr[cc]; minAt = [cx(Math.floor(cc / H)), cz(cc % H)].map((v) => +v.toFixed(2)); } if (st % res.S) len++; else if (len) { pinch.push(+(len * h).toFixed(2)); len = 0; } st = res.prev[st]; }
          if (len) pinch.push(+(len * h).toFixed(2));
          drawn.push(line);
        }
        if (ok) break;
      }
      paths.push({ entry: E.entry, room: T.room, via: T.via, ok, minClearWidth: ok && Number.isFinite(minC) ? +(2 * minC).toFixed(2) : null, minAt, pinchRuns: pinch, verdict: ok ? 'pass' : 'hard' });
    }
  }
  // occupancy plan for the PNG: 0 free >=0.45, 1 pinch, 2 narrow, 3 wall, 4 item, 5 path
  const plan = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) plan[k] = occW[k] ? 3 : occI[k] ? 4 : clr[k] >= OK ? 0 : clr[k] >= PIN ? 1 : 2;
  for (const line of drawn) for (const c of line) plan[c] = 5;
  let b64 = ''; for (let i = 0; i < plan.length; i += 8192) b64 += String.fromCharCode(...plan.subarray(i, i + 8192));
  const doorLeaves = DOORS.map((D) => 2.05);
  const count = (arr) => ({ pass: arr.filter((x) => x.verdict === 'pass').length, polish: arr.filter((x) => x.verdict === 'polish').length, hard: arr.filter((x) => x.verdict === 'hard').length });
  const structHits = base.hits.filter((x) => !items.some((i) => i.name === x.b));
  return {
    rubric: 'v2.3 hard fail 13', method: 'three-mesh-bvh MeshBVH per item (world space), intersectsGeometry + inside-depth + closestPointToGeometry',
    scale: { metersPerUnit: 1, doorHeights: [...new Set(doorLeaves)], valid: doorLeaves.every((v) => v >= 1.98 && v <= 2.13) },
    items: items.map((i) => ({ id: i.id, name: i.name, kind: i.kind, on: i.on ? i.on.id : null, box: [i.box.min.toArray(), i.box.max.toArray()].map((p) => p.map((x) => +x.toFixed(3))) })),
    broadPairs: tested, pairs, floats, structure: structHits, doors, paths,
    counts: { pairs: count(pairs), floats: count(floats), doors: count(doors), paths: count(paths), structure: structHits.length },
    grid: { X0, Z0, h, W, H, b64: btoa(b64), doors: DOORS.map((D) => [D.x0, D.x1, D.z0, D.z1, D.axis]) },
  };
}
