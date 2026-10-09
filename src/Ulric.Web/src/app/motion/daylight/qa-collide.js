// QA only (window.__daylight.collide with ?qa3d=1): interpenetration, contact and clearance check for the interior.
// - every pair of furniture/fixture items: vertices of one inside the other's mesh (6-ray parity), depth = nearest exit
//   distance; fail over 1 cm. Rugs are soft (furniture may stand on them).
// - items against wall solids, the floor and the ceiling (analytic boxes); fail over 1 cm.
// - contact: an item that stands (its base below F + 1 m, not wall-hung or ceiling-hung) must touch the floor or the
//   item under it within 2 mm (no float, no sink).
// - doorways: no item footprint (below 1.9 m) within the opening extended 0.45 m each side.
// - walk paths: 5 cm grid over the floor plan, blockers grown by a 0.18 m body radius; every room start reachable.
import * as THREE from 'three';

const PEN = 0.01, TOUCH = 0.002;

function triSoup(geos, matrix) {
  const out = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.attributes.position, v = new THREE.Vector3();
    const arr = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (matrix) v.applyMatrix4(matrix); arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z; }
    out.push(arr);
  }
  let n = 0; for (const a of out) n += a.length;
  const all = new Float32Array(n); let o = 0; for (const a of out) { all.set(a, o); o += a.length; }
  return all;
}
function bbox(t) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], t[i + k]); b[k + 3] = Math.max(b[k + 3], t[i + k]); }
  return b;
}
const ovl = (a, b, k) => Math.min(a[k + 3], b[k + 3]) - Math.max(a[k], b[k]);
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(([x, y, z]) => [x + 0.013, y + 0.007, z + 0.011]);
// ray from p along d against triangles t: hit count and nearest distance
function cast(t, p, d) {
  let hits = 0, near = Infinity;
  for (let i = 0; i < t.length; i += 9) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2];
    const e1x = t[i + 3] - ax, e1y = t[i + 4] - ay, e1z = t[i + 5] - az, e2x = t[i + 6] - ax, e2y = t[i + 7] - ay, e2z = t[i + 8] - az;
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det, sx = p[0] - ax, sy = p[1] - ay, sz = p[2] - az;
    const u = (sx * px + sy * py + sz * pz) * inv; if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const w = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (w < 0 || u + w > 1) continue;
    const s = (e2x * qx + e2y * qy + e2z * qz) * inv; if (s <= 0) continue;
    hits++; if (s < near) near = s;
  }
  return [hits, near];
}
function samples(t, b, max = 260) {
  const n = t.length / 3, step = Math.max(1, Math.floor(n / max)), out = [];
  for (let i = 0; i < n; i += step) { const p = [t[i * 3], t[i * 3 + 1], t[i * 3 + 2]]; if (p[0] >= b[0] && p[0] <= b[3] && p[1] >= b[1] && p[1] <= b[4] && p[2] >= b[2] && p[2] <= b[5]) out.push(p); }
  return out;
}
// how deep points of A sit inside closed-ish mesh B (restricted to the overlap box)
function depthInside(A, B, box) {
  let worst = 0, at = null;
  for (const p of samples(A.t, box)) {
    let odd = 0, near = Infinity;
    for (const d of DIRS) { const [h, s] = cast(B.t, p, d); if (h % 2) { odd++; near = Math.min(near, s / Math.hypot(...d)); } }
    if (odd >= 5 && near > worst) { worst = near; at = p; }
  }
  return [worst, at];
}

export function collide({ ITEMS, STRUCT, DOORS, LEVELS, BLOCKERS, ROOMS, furniture }) {
  const { F, C } = LEVELS;
  const items = ITEMS.filter((it) => it.geos.length).map((it) => ({ name: it.name.replace(/^piece/, [...(it.keys || [])][0] || 'piece'), soft: !!it.soft, ceiling: !!it.ceiling, t: triSoup(it.geos), src: it }));
  furniture.updateMatrixWorld(true);
  for (const o of furniture.children) {
    const s = o.userData.spot; const geos = [], mats = [];
    o.traverse((m) => { if (m.isMesh) { geos.push(m.geometry); mats.push(m.matrixWorld.clone()); } });
    const parts = geos.map((g, i) => triSoup([g], mats[i]));
    let n = 0; for (const a of parts) n += a.length; const t = new Float32Array(n); let k = 0; for (const a of parts) { t.set(a, k); k += a.length; }
    items.push({ name: `${s ? s.key : 'model'}@${o.position.x.toFixed(2)},${o.position.z.toFixed(2)}`, model: true, t, piece: s && s.piece });
  }
  for (const it of items) { it.b = bbox(it.t); it.hung = !it.ceiling && it.b[1] > F + 0.9; }
  const hits = [], contacts = [], doors = [];
  // pairs
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i], B = items[j];
    if (A.soft || B.soft) continue;
    if ((A.piece && A.piece === B.src) || (B.piece && B.piece === A.src)) { /* model inside its own piece: still checked */ }
    const ox = ovl(A.b, B.b, 0), oy = ovl(A.b, B.b, 1), oz = ovl(A.b, B.b, 2);
    if (ox <= PEN || oy <= PEN || oz <= PEN) continue;
    const box = [Math.max(A.b[0], B.b[0]), Math.max(A.b[1], B.b[1]), Math.max(A.b[2], B.b[2]), Math.min(A.b[3], B.b[3]), Math.min(A.b[4], B.b[4]), Math.min(A.b[5], B.b[5])];
    const [d1, p1] = depthInside(A, B, box), [d2, p2] = depthInside(B, A, box);
    const d = Math.max(d1, d2);
    if (d > PEN) hits.push({ a: A.name, b: B.name, ab: A.b.map((v) => +v.toFixed(2)), bb: B.b.map((v) => +v.toFixed(2)), depth: +d.toFixed(3), at: (d1 >= d2 ? p1 : p2).map((v) => +v.toFixed(2)) });
  }
  // structure: walls, floor, ceiling
  for (const A of items) {
    let worst = 0, what = '';
    const n = A.t.length / 3, step = Math.max(1, Math.floor(n / 4000));
    for (let i = 0; i < n; i += step) {
      const x = A.t[i * 3], y = A.t[i * 3 + 1], z = A.t[i * 3 + 2];
      if (!A.soft && F - y > worst) { worst = F - y; what = 'floor'; }
      if (C - 0.01 - y < -worst && !A.ceiling) { worst = y - (C - 0.01); what = 'ceiling'; }
      for (const w of STRUCT) {
        if (x > w[0] && x < w[1] && y > w[2] && y < w[3] && z > w[4] && z < w[5]) {
          const d = Math.min(x - w[0], w[1] - x, z - w[4], w[5] - z);
          if (d > worst) { worst = d; what = `wall [${w.map((v) => v.toFixed(2)).join(',')}]`; }
        }
      }
    }
    if (worst > PEN) hits.push({ a: A.name, b: what, ab: A.b.map((v) => +v.toFixed(2)), depth: +worst.toFixed(3) });
  }
  // contact: standing items rest on the floor or on the item below, within 2 mm
  for (const A of items) {
    if (A.soft || A.hung || A.ceiling || A.b[1] > F + 1.0) continue;
    let support = F, by = 'floor';
    if (A.b[1] > F + 0.03) {
      support = -Infinity; by = 'nothing';
      for (const B of items) {
        if (B === A || B.soft) continue;
        if (ovl(A.b, B.b, 0) <= 0 || ovl(A.b, B.b, 2) <= 0) continue;
        const top = B.b[4]; if (top <= A.b[1] + 0.03 && top > support) { support = top; by = B.name; }
      }
    }
    const gap = A.b[1] - support;
    if (Math.abs(gap) > TOUCH) contacts.push({ item: A.name, on: by, gap: Number.isFinite(gap) ? +gap.toFixed(4) : null, box: A.b.map((v) => +v.toFixed(2)) });
  }
  // doorways: footprints below 1.9 m stay out of the opening plus 0.45 m each side
  for (const D of DOORS) {
    const z = D.axis === 'x' ? [D.x0, D.x1, D.z0 - 0.45, D.z1 + 0.45] : [D.x0 - 0.45, D.x1 + 0.45, D.z0, D.z1];
    for (const A of items) {
      if (A.hung || A.ceiling || A.soft || A.b[1] > F + 1.9) continue;
      const ix = Math.min(A.b[3], z[1]) - Math.max(A.b[0], z[0]), iz = Math.min(A.b[5], z[3]) - Math.max(A.b[2], z[2]);
      if (ix > PEN && iz > PEN) doors.push({ item: A.name, door: [D.x0, D.x1, D.z0, D.z1].map((v) => +v.toFixed(2)), intrude: +Math.min(ix, iz).toFixed(3) });
    }
  }
  // walk paths: grid flood fill from the living room start
  const R0 = 0.22, h = 0.05, X0 = -8, X1 = 8, Z0 = -6, Z1 = 6, W = Math.round((X1 - X0) / h), H = Math.round((Z1 - Z0) / h);
  const free = new Uint8Array(W * H);
  const inside = ROOMS.filter((r) => !r.outside && r.floor);
  for (let gx = 0; gx < W; gx++) for (let gz = 0; gz < H; gz++) {
    const x = X0 + (gx + 0.5) * h, z = Z0 + (gz + 0.5) * h;
    let ok = inside.some((r) => { const xs = r.floor.map((p) => p[0]), zs = r.floor.map((p) => p[1]); return x >= Math.min(...xs) - 0.6 && x <= Math.max(...xs) + 0.6 && z >= Math.min(...zs) - 0.6 && z <= Math.max(...zs) + 0.6; });
    if (ok) for (const b of BLOCKERS) if (x > b[0] - R0 && x < b[1] + R0 && z > b[2] - R0 && z < b[3] + R0) { ok = false; break; }
    free[gx * H + gz] = ok ? 1 : 0;
  }
  const idx = (x, z) => Math.floor((x - X0) / h) * H + Math.floor((z - Z0) / h);
  const start = ROOMS.find((r) => r.key === 'living'), seen = new Uint8Array(W * H), q = [idx(start.x, start.z)];
  seen[q[0]] = 1;
  while (q.length) { const c = q.pop(), gx = Math.floor(c / H), gz = c % H; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = gx + dx, nz = gz + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue; const n = nx * H + nz; if (!seen[n] && free[n]) { seen[n] = 1; q.push(n); } } }
  const walk = inside.map((r) => { const x = r.x ?? r.cx, z = r.z ?? r.cz; return { room: r.key, at: [x, z], start: free[idx(x, z)] === 1, reachable: seen[idx(x, z)] === 1 }; });
  return { blockers: BLOCKERS.map((b) => b.map((v) => +v.toFixed(2))), list: items.map((i) => ({ name: i.name, box: i.b.map((v) => +v.toFixed(2)) })), items: items.length, models: items.filter((i) => i.model).length, hits, contacts, doors, walk, walkFail: walk.filter((w) => !w.reachable).map((w) => w.room) };
}
