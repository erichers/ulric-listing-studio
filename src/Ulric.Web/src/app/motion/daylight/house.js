// The demo bungalow: a one-storey 1940s bungalow on a finished basement, built procedurally.
// Metres. +z = front (street).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------- small helpers ----------
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function box(w, h, d, x, y, z) { return new THREE.BoxGeometry(w, h, d).translate(x, y, z); }
function boxSpan(x0, x1, y0, y1, z0, z1) { return box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); }
export function worldUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i), p.getZ(i));
    else if (ax >= az) uv.setXY(i, p.getZ(i), p.getY(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  uv.needsUpdate = true;
  return g;
}
// per-triangle plane UVs: u along the horizontal, v up the slope (shingle courses)
function slopeUV(g) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, uv = g.attributes.uv;
  const a = V3(), b = V3(), c = V3(), n = V3(), t = V3(), s = V3(), q = V3(), up = V3(0, 1, 0);
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(q.subVectors(c, a)).normalize();
    t.crossVectors(up, n);
    if (t.lengthSq() < 1e-6) t.set(1, 0, 0);
    t.normalize();
    s.crossVectors(n, t).normalize();
    for (let k = 0; k < 3; k++) { q.fromBufferAttribute(p, i + k); uv.setXY(i + k, q.dot(t), q.dot(s)); }
  }
  uv.needsUpdate = true;
  return g;
}
// a board between two points: w wide (horizontal-ish), h tall, centred on the line
function beam(p, q, w, h, upHint = V3(0, 1, 0)) {
  const P = p.isVector3 ? p : V3(...p), Q = q.isVector3 ? q : V3(...q);
  const len = P.distanceTo(Q);
  const g = new THREE.BoxGeometry(w, h, len);
  const m = new THREE.Matrix4().lookAt(P, Q, upHint);
  g.applyMatrix4(m);
  g.translate((P.x + Q.x) / 2, (P.y + Q.y) / 2, (P.z + Q.z) / 2);
  return g;
}
// a parallelogram slab: corner A, edges U, V; thickness t on the upper side
function slab(A, U, V, t) {
  let u = U.clone(), v = V.clone();
  const c = V3().crossVectors(u, v);
  if (c.y < 0) [u, v] = [v, u];
  const n = V3().crossVectors(u, v).normalize().multiplyScalar(t);
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(u, v, n).setPosition(A));
  return slopeUV(g);
}
function prism2D(pts, depth) { // polygon in the XY plane, extruded +z by depth
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
}

// materials whose PBR maps are laid out in world metres (furniture and finishes get planar UVs from their normals)
const WORLD_UV = new Set(['plaster', 'ceiling', 'oak', 'tile', 'walnut', 'honey', 'sofa', 'cushion', 'pillowA', 'pillowB', 'bedding', 'teal', 'rug', 'leather', 'cabinet', 'counter', 'stone']);
// wall paint per room, sampled from the reference design (sage living and dining, yellow kitchen, warm creams)
export const ROOM_TINTS = [
  { key: 'kitchen', rect: [1.6, 6.4, -4.6, -1.0], color: '#f4d698' }, // cream walls; the yellow is the tile backsplash (photo)
  { key: 'dining', rect: [-2.6, 1.6, -4.6, -1.0], color: '#939a70' },
  { key: 'bed3', rect: [-6.4, -2.6, -4.6, -1.0], color: '#f7efdf' },
  { key: 'bed2', rect: [-6.4, -4.0, -1.0, 2.6], color: '#efe4b8' },
  { key: 'bath', rect: [2.6, 4.6, -1.0, 1.2], color: '#f1d8b4' },
  { key: 'half', rect: [4.6, 6.4, -1.0, 1.2], color: '#efdcbe' },
  { key: 'bed1', rect: [1.4, 6.4, 1.2, 5.0], color: '#f2e4c4' },
];
const SAGE = '#939a70'; // darker sage: living wall L* 35 in the fireplace photo
// split long wall triangles (longest edge first) so each piece sits inside one room before it is painted
function splitLong(g, max = 0.6) {
  const names = ['position', 'normal', 'uv'].filter((n) => g.attributes[n]), src = names.map((n) => g.attributes[n]);
  const out = names.map(() => []), P = g.attributes.position;
  const vert = (i) => src.map((a) => Array.from({ length: a.itemSize }, (_, k) => a.array[i * a.itemSize + k]));
  const mid = (a, b) => a.map((arr, j) => arr.map((v, k) => (v + b[j][k]) / 2));
  const d2 = (a, b) => (a[0][0] - b[0][0]) ** 2 + (a[0][1] - b[0][1]) ** 2 + (a[0][2] - b[0][2]) ** 2;
  const tri = (a, b, c, depth) => {
    const e = [d2(a, b), d2(b, c), d2(c, a)], m = Math.max(...e);
    if (m <= max * max || depth > 12) { for (const v of [a, b, c]) v.forEach((arr, j) => out[j].push(...arr)); return; }
    if (m === e[0]) { const q = mid(a, b); tri(a, q, c, depth + 1); tri(q, b, c, depth + 1); }
    else if (m === e[1]) { const q = mid(b, c); tri(a, b, q, depth + 1); tri(a, q, c, depth + 1); }
    else { const q = mid(c, a); tri(a, b, q, depth + 1); tri(q, b, c, depth + 1); }
  };
  for (let i = 0; i < P.count; i += 3) tri(vert(i), vert(i + 1), vert(i + 2), 0);
  const ng = new THREE.BufferGeometry();
  names.forEach((n, j) => ng.setAttribute(n, new THREE.Float32BufferAttribute(out[j], src[j].itemSize)));
  return ng;
}

function paintRooms(g) {
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3 + n.getX(i) * 0.25;
    const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3 + n.getZ(i) * 0.25;
    const r = ROOM_TINTS.find(({ rect: [x0, x1, z0, z1] }) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
    c.set(r ? r.color : SAGE);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// geometry bins merged per material key
// keys are "layer/material": layers drive the view modes (shell + roof go see-through or hidden)
class Kit {
  constructor() { this.bins = new Map(); this.layer = 'site'; this.lining = null; }
  add(key, g) {
    if (!g) return;
    key = this.layer + '/' + key;
    g = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (WORLD_UV.has(key.split('/')[1])) worldUV(g); // PBR maps tile in metres
    (this.bins.get(key) || this.bins.set(key, []).get(key)).push(g);
  }
  merged() {
    const out = {};
    for (const [k, list] of this.bins) {
      out[k] = mergeGeometries(list, false); list.forEach((g) => g.dispose());
      if (k.endsWith('/plaster')) { const sp = splitLong(out[k]); out[k].dispose(); out[k] = sp; paintRooms(sp); }
    }
    return out;
  }
}

// ---------- walls with openings ----------
// wall from a to b (plan points [x,z]); outward normal = dir x up. profile: [[u,y],...] top edge.
function wall(kit, a, b, y0, top, openings = [], { skin = 'siding', trim = 'trim' } = {}) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  const X = V3(dx / L, 0, dz / L), Y = V3(0, 1, 0), Z = V3().crossVectors(X, Y);
  const M = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(a[0], 0, a[1]);
  const prof = (typeof top === 'number' ? [[L, top], [0, top]] : top).slice().sort((p, q) => q[0] - p[0]);
  const s = new THREE.Shape();
  s.moveTo(0, y0); s.lineTo(L, y0);
  for (const [u, y] of prof) s.lineTo(u, y);
  s.lineTo(0, y0);
  for (const o of openings) {
    const h = new THREE.Path();
    const u0 = o.u - o.w / 2, u1 = o.u + o.w / 2, v0 = o.y, v1 = o.y + o.h;
    h.moveTo(u0, v0); h.lineTo(u0, v1); h.lineTo(u1, v1); h.lineTo(u1, v0); h.lineTo(u0, v0);
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: D.T, bevelEnabled: false });
  g.translate(0, 0, -D.T);
  g.applyMatrix4(M);
  kit.add(skin, g);
  if (kit.lining) { // plaster on the room side, same openings
    const inner = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: false });
    inner.translate(0, 0, -D.T - 0.012);
    inner.applyMatrix4(M);
    kit.add(kit.lining, inner);
  }
  for (const o of openings) if (!o.bare) opening(kit, M, kit.lining ? { ...o, lined: true } : o, trim);
  return { M, L };
}
function opening(kit, M, o, trimKey) {
  const parts = [];
  const add = (key, g) => parts.push([key, g]);
  const { u, y, w, h } = o;
  const u0 = u - w / 2, u1 = u + w / 2, y1 = y + h;
  const cw = 0.11, ct = 0.03, rv = 0.075;
  // casing
  add(trimKey, box(cw, h + 0.02, ct, u0 - cw / 2, y + h / 2, ct / 2));
  add(trimKey, box(cw, h + 0.02, ct, u1 + cw / 2, y + h / 2, ct / 2));
  add(trimKey, box(w + cw * 2 + 0.06, 0.17, ct + 0.01, u, y1 + 0.085, (ct + 0.01) / 2));
  add(trimKey, box(w + cw * 2 + 0.12, 0.035, 0.07, u, y1 + 0.19, 0.035));
  // jamb liners
  add(trimKey, box(0.02, h, rv, u0 + 0.01, y + h / 2, -rv / 2));
  add(trimKey, box(0.02, h, rv, u1 - 0.01, y + h / 2, -rv / 2));
  add(trimKey, box(w, 0.02, rv, u, y1 - 0.01, -rv / 2));
  if (o.type === 'door' && o.halfGlass) {
    // front door (living-room photo): half-glass upper light with white blinds inside, two raised panels below
    const P = o.panel || 'door', dw = w - 0.04, dz = -rv - 0.02, th = 0.045, st = 0.12, gy0 = y + h * 0.5, gy1 = y + h - 0.13;
    const rf = dz - th / 2, of = dz + th / 2; // room face, outside face
    add(P, box(dw, gy0 - y - 0.01, th, u, (y + 0.01 + gy0) / 2, dz));              // lower leaf
    add(P, box(st, gy1 - gy0, th, u - dw / 2 + st / 2, (gy0 + gy1) / 2, dz));      // stiles beside the light
    add(P, box(st, gy1 - gy0, th, u + dw / 2 - st / 2, (gy0 + gy1) / 2, dz));
    add(P, box(dw, y + h - 0.01 - gy1, th, u, (gy1 + y + h - 0.01) / 2, dz));       // top rail
    const lw = dw - st * 2, lh = gy1 - gy0;
    add('glass', box(lw, lh, 0.008, u, (gy0 + gy1) / 2, dz));
    for (const [f, sg] of [[rf, -1], [of, 1]]) {                                   // glazing beads both faces
      add(P, box(lw, 0.022, 0.012, u, gy0 + 0.011, f + sg * 0.006)); add(P, box(lw, 0.022, 0.012, u, gy1 - 0.011, f + sg * 0.006));
      add(P, box(0.022, lh, 0.012, u - lw / 2 + 0.011, (gy0 + gy1) / 2, f + sg * 0.006)); add(P, box(0.022, lh, 0.012, u + lw / 2 - 0.011, (gy0 + gy1) / 2, f + sg * 0.006));
      // two raised panels per face on the lower leaf: a field and a proud centre
      for (const k of [-1, 1]) {
        const pc = u + k * dw / 4, pw = dw / 2 - st * 0.9, py0 = y + 0.16, py1 = gy0 - 0.12;
        add(P, box(pw, py1 - py0, 0.006, pc, (py0 + py1) / 2, f + sg * 0.003));
        add(P, box(pw - 0.07, py1 - py0 - 0.07, 0.012, pc, (py0 + py1) / 2, f + sg * 0.006));
      }
    }
    // blinds on the room side: headrail, 25 mm slats tilted a little, bottom rail, two ladder cords
    const bz = rf - 0.03;
    add('sash', box(lw + 0.04, 0.035, 0.04, u, gy1 - 0.005, bz));
    for (let yy = gy1 - 0.05; yy > gy0 + 0.04; yy -= 0.024) add('sash', box(lw + 0.02, 0.003, 0.025, 0, 0, 0).rotateX(0.35).translate(u, yy, bz));
    add('sash', box(lw + 0.02, 0.012, 0.028, u, gy0 + 0.03, bz));
    for (const k of [-1, 1]) add('sash', box(0.004, lh - 0.06, 0.004, u + k * lw * 0.3, (gy0 + gy1) / 2, bz - 0.014));
    add(trimKey, box(w + 0.1, 0.03, 0.12, u, y + 0.015, -0.02));
    // hardware both sides: knob rose + knob, deadbolt above
    for (const [f, sg] of [[rf, -1], [of, 1]]) {
      add('brass', new THREE.CylinderGeometry(0.03, 0.03, 0.01, 16).rotateX(Math.PI / 2).translate(u + dw / 2 - 0.08, y + 0.95, f + sg * 0.005));
      add('brass', new THREE.SphereGeometry(0.028, 16, 10).translate(u + dw / 2 - 0.08, y + 0.95, f + sg * 0.05));
      add('brass', new THREE.CylinderGeometry(0.026, 0.026, 0.012, 16).rotateX(Math.PI / 2).translate(u + dw / 2 - 0.08, y + 1.12, f + sg * 0.006));
    }
  } else if (o.type === 'door') {
    add(o.panel || 'door', box(w - 0.04, h - 0.02, 0.045, u, y + h / 2, -rv - 0.02));
    const gw = w * 0.56, gh = h * 0.3, gy = y + h * 0.66;
    add('glass', box(gw, gh, 0.01, u, gy + gh / 2, -rv + 0.008));
    add(o.frame || 'door', box(gw + 0.08, 0.04, 0.02, u, gy - 0.02, -rv + 0.005));
    add(o.frame || 'door', box(gw + 0.08, 0.04, 0.02, u, gy + gh + 0.02, -rv + 0.005));
    add(o.frame || 'door', box(0.04, gh, 0.02, u - gw / 2 - 0.02, gy + gh / 2, -rv + 0.005));
    add(o.frame || 'door', box(0.04, gh, 0.02, u + gw / 2 + 0.02, gy + gh / 2, -rv + 0.005));
    add(trimKey, box(w + 0.1, 0.03, 0.12, u, y + 0.015, -0.02));
    add('metal', box(0.03, 0.12, 0.05, u + w / 2 - 0.12, y + 1.0, -rv + 0.01));
  } else {
    // sill + apron
    add(trimKey, box(w + cw * 2 + 0.1, 0.055, 0.1, u, y - 0.0275, 0.03));
    add(trimKey, box(w + cw * 2 - 0.02, 0.1, ct, u, y - 0.105, ct / 2));
    const units = o.units || 1, mull = 0.09, uw = (w - mull * (units - 1)) / units;
    const sz = -rv + 0.01, st = 0.035, f = 0.055;
    add('glass', box(w, h, 0.01, u, y + h / 2, -rv - 0.012));
    for (let i = 0; i < units; i++) {
      const cu = u0 + uw / 2 + i * (uw + mull);
      add('sash', box(f, h, st, cu - uw / 2 + f / 2, y + h / 2, sz));
      add('sash', box(f, h, st, cu + uw / 2 - f / 2, y + h / 2, sz));
      add('sash', box(uw, f, st, cu, y + f / 2, sz));
      add('sash', box(uw, f, st, cu, y1 - f / 2, sz));
      if (!o.fixed) add('sash', box(uw, f * 1.1, st + 0.012, cu, y + h * (o.meet ?? 0.52), sz + 0.004));
      if (i < units - 1) add(trimKey, box(mull, h, 0.05, cu + uw / 2 + mull / 2, y + h / 2, -0.02));
    }
  }
  if (o.lined) { // room side: jamb liners through the wall and a plain casing on the plaster
    const d0 = -rv - 0.045, d1 = -D.T - 0.012, dc = (d0 + d1) / 2, dd = d0 - d1, zc = -D.T - 0.012 - 0.012;
    add(trimKey, box(0.03, h, dd, u0 + 0.015, y + h / 2, dc));
    add(trimKey, box(0.03, h, dd, u1 - 0.015, y + h / 2, dc));
    add(trimKey, box(w, 0.03, dd, u, y1 - 0.015, dc));
    add(trimKey, box(0.09, h + 0.09, 0.024, u0 - 0.045, y + h / 2 + 0.045, zc));
    add(trimKey, box(0.09, h + 0.09, 0.024, u1 + 0.045, y + h / 2 + 0.045, zc));
    add(trimKey, box(w + 0.18, 0.09, 0.024, u, y1 + 0.045, zc));
    if (o.type !== 'door') {
      add(trimKey, box(w + 0.14, 0.03, dd + 0.06, u, y - 0.015, dc - 0.03));   // stool
      add(trimKey, box(w + 0.18, 0.08, 0.024, u, y - 0.07, zc));               // apron
    }
  }
  for (const [k, g] of parts) { g.applyMatrix4(M); kit.add(k, g); }
}

// ---------- trees ----------
function blob(r, seed) {
  const g = new THREE.IcosahedronGeometry(r, 2);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 2.1 + seed) * Math.cos(v.y * 2.7 - seed) * Math.sin(v.z * 2.3 + seed * 0.5);
    const nx = v.x / r, ny = v.y / r, nz = v.z / r;
    v.multiplyScalar(1 + n * 0.12);
    p.setXYZ(i, v.x, v.y, v.z);
    g.attributes.normal.setXYZ(i, nx, ny, nz);
  }
  return g;
}
function deciduous(kit, x, z, h, r, seed) {
  let s = seed;
  const rr = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  kit.add('trunk', new THREE.CylinderGeometry(0.12, 0.2, h * 0.6, 8).translate(x, h * 0.3, z));
  kit.add('trunk', beam([x, h * 0.42, z], [x + r * 0.35, h * 0.64, z + r * 0.2], 0.11, 0.11));
  kit.add('trunk', beam([x, h * 0.45, z], [x - r * 0.3, h * 0.62, z - r * 0.25], 0.1, 0.1));
  const blobs = 6;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rr();
    const d = i === 0 ? 0 : r * (0.42 + rr() * 0.22);
    const br = r * (i === 0 ? 0.7 : 0.48 + rr() * 0.16);
    const cy = h - r * 0.85 + (rr() - 0.35) * r * 0.5;
    const g = blob(br, seed + i);
    g.scale(1, 0.85, 1).translate(x + Math.cos(a) * d, cy, z + Math.sin(a) * d);
    kit.add('leaf', g);
  }
}
function fir(kit, x, z, h, seed) {
  kit.add('trunk', new THREE.CylinderGeometry(0.08, 0.22, h * 0.3, 7).translate(x, h * 0.15, z));
  const tiers = 7;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = (1 - t) * h * 0.15 + 0.3;
    const ch = h * 0.24;
    const y = h * 0.16 + t * h * 0.66 + ch / 2;
    const g = new THREE.ConeGeometry(r, ch, 10, 1);
    g.rotateY(seed * 1.7 + i * 0.9);
    g.translate(x, y, z);
    kit.add('fir', g);
  }
}

// ---------- hip roof ----------
// closed hip solid over the rectangle [x0,x1]x[z0,z1] with its eave at y; shingles on top, soffit underneath
// front/back: [xa, xb] span of the fascia + gutter on that edge (null = none); left/right: [za, zb]
function hipRoof(kit, x0, x1, z0, z1, y, k, { soffit = true, fascia = true, front = [x0, x1], back = [x0, x1], left = [z0, z1], right = [z0, z1] } = {}) {
  const w = x1 - x0, d = z1 - z0, alongX = w >= d, h = (alongX ? d : w) / 2, ry = y + h * k;
  const xc = (x0 + x1) / 2, zc = (z0 + z1) / 2;
  const A = V3(x0, y, z1), B = V3(x1, y, z1), C = V3(x1, y, z0), E = V3(x0, y, z0);
  const R1 = alongX ? V3(x0 + h, ry, zc) : V3(xc, ry, z1 - h), R2 = alongX ? V3(x1 - h, ry, zc) : V3(xc, ry, z0 + h);
  const tri = [];
  const quad = (p, q, r, s) => tri.push(p, q, r, p, r, s);
  if (alongX) { quad(A, B, R2, R1); quad(C, E, R1, R2); tri.push(B, C, R2, E, A, R1); }
  else { quad(B, C, R2, R1); quad(E, A, R1, R2); tri.push(A, B, R1, C, E, R2); }
  const g = new THREE.BufferGeometry().setFromPoints(tri);
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(tri.length * 2), 2));
  kit.add('roof', slopeUV(g));
  // hip and ridge caps
  const cap = (p, q) => kit.add('roof', beam(p.clone().setY(p.y + 0.04), q.clone().setY(q.y + 0.04), 0.16, 0.05, V3(0, 1, 0)));
  cap(R1, R2); cap(A, alongX ? R1 : R1); cap(B, alongX ? R2 : R1); cap(C, R2); cap(E, alongX ? R1 : R2);
  if (soffit) kit.add('trim', boxSpan(x0, x1, y - 0.04, y, z0, z1)); // doubles as the ceiling
  if (fascia) {
    if (front) kit.add('trim', boxSpan(front[0] - 0.03, front[1] + 0.03, y - 0.2, y + 0.02, z1 - 0.03, z1 + 0.03));
    if (back) kit.add('trim', boxSpan(back[0] - 0.03, back[1] + 0.03, y - 0.2, y + 0.02, z0 - 0.03, z0 + 0.03));
    if (left) kit.add('trim', boxSpan(x0 - 0.03, x0 + 0.03, y - 0.2, y + 0.02, left[0], left[1]));
    if (right) kit.add('trim', boxSpan(x1 - 0.03, x1 + 0.03, y - 0.2, y + 0.02, right[0], right[1]));
    // gutters
    if (front) kit.add('metal', boxSpan(front[0] - 0.1, front[1] + 0.1, y - 0.16, y - 0.04, z1 + 0.03, z1 + 0.13));
    if (back) kit.add('metal', boxSpan(back[0] - 0.1, back[1] + 0.1, y - 0.16, y - 0.04, z0 - 0.13, z0 - 0.03));
  }
  return { ry, R1, R2 };
}

// ---------- the house ----------
// One-storey 1940s bungalow on a finished basement: medium blue lap siding, cream trim, low grey hip roof,
// a small gabled entry stoop with a cedar door, a brick chimney beside the entry, a carport on the left,
// and a wood deck with a shade sail over a brick patio out back.
export const D = {
  floor: 1.0,               // main floor above grade (raised basement)
  xl: -6.6, xr: 6.6,        // main block side walls
  zf: 2.8, zb: -4.8,        // main block front / back walls
  wx0: 1.4, wz: 5.0,        // front wing: left wall x, front wall z (spans wx0..xr)
  eave: 3.62,               // wall top / soffit height
  k: 5 / 12,                // roof pitch
  ov: 0.55,                 // eave overhang
  T: 0.2,
};
// filled by buildBungalow: walk collision rectangles [x0, x1, z0, z1], glTF furniture spots, ceiling lights
export const BLOCKERS = [];
export const MODEL_SPOTS = [];
export const LIGHTS = [];
// QA (interpenetration check): every furniture or fixture item with its world-space geometry, wall solids, doorways, levels
export const ITEMS = [];   // { name, geos: [BufferGeometry], soft?, hung?, ceiling? }
export const STRUCT = []; // wall solids [x0, x1, y0, y1, z0, z1]
export const DOORS = [];  // doorway openings { x0, x1, z0, z1, axis }
export const LEVELS = {};
export const LOT = { x0: -11.6, x1: 9.6, z0: -15.4, z1: 13.0 };
export const PLINTH = { x0: -12.4, x1: 10.4, z0: -16.2, z1: 17.8, depth: 0.32 };

export function buildBungalow() {
  const kit = new Kit();
  const { floor, xl, xr, zf, zb, wx0, wz, eave, k, ov } = D;
  const H = (y) => floor + y;

  // ---- raised basement (painted concrete), with hopper windows ----
  kit.add('base', worldUV(boxSpan(xl, xr, 0, floor, zb, zf)));
  kit.add('base', worldUV(boxSpan(wx0, xr, 0, floor, zf - 0.1, wz)));
  const hopper = (x0, x1, z0, z1) => { kit.add('trim', boxSpan(x0, x1, 0.38, 0.8, z0, z1)); };
  const bw = (x, z, nx, nz) => { // basement window on a wall facing (nx, nz)
    const hw = 0.38;
    if (nz) { hopper(x - hw - 0.06, x + hw + 0.06, z, z + nz * 0.025); kit.add('glass', boxSpan(x - hw, x + hw, 0.44, 0.74, z + nz * 0.02, z + nz * 0.03)); }
    else { hopper(x, x + nx * 0.025, z - hw - 0.06, z + hw + 0.06); kit.add('glass', boxSpan(x + nx * 0.02, x + nx * 0.03, 0.44, 0.74, z - hw, z + hw)); }
  };
  for (const z of [-3.4, -0.6, 1.8]) bw(xl, z, -1, 0);
  for (const x of [-5.0, -2.4]) bw(x, zf, 0, 1);
  bw(3.8, wz, 0, 1);
  for (const z of [-3.2, 0.4, 3.6]) bw(xr, z, 1, 0);
  for (const x of [-4.6, 2.2]) bw(x, zb, 0, -1);
  // water table at the top of the base
  kit.layer = 'shell';
  kit.add('trim', boxSpan(xl - 0.03, wx0, floor, floor + 0.12, zf - 0.01, zf + 0.03));
  kit.add('trim', boxSpan(wx0 - 0.03, xr + 0.03, floor, floor + 0.12, wz - 0.01, wz + 0.03));
  kit.add('trim', boxSpan(xl - 0.03, xr + 0.03, floor, floor + 0.12, zb - 0.03, zb + 0.01));
  kit.add('trim', boxSpan(xl - 0.03, xl + 0.01, floor, floor + 0.12, zb, zf));
  kit.add('trim', boxSpan(xr - 0.01, xr + 0.03, floor, floor + 0.12, zb, wz));

  // ---- walls ----
  const win = (u, w = 1.0, h = 1.45, extra = {}) => ({ u, y: H(0.85), w, h, ...extra });
  kit.lining = 'plaster';
  // front, left of the entry: two double-hung windows and a wide pair
  wall(kit, [xl, zf], [wx0, zf], floor, eave, [
    win(-5.2 - xl, 1.0), win(-2.8 - xl, 1.0), // living window sits just past the mantel, as in the fireplace photo
    { u: 0.15 - xl, y: floor, w: 0.92, h: 2.05, type: 'door', halfGlass: true },
  ]);
  // wing: left face (in the entry corner), front face, right wall
  wall(kit, [wx0, zf], [wx0, wz], floor, eave, [win(1.2, 0.8, 1.2)]);
  wall(kit, [wx0, wz], [xr, wz], floor, eave, [win(2.7, 2.1, 1.5, { units: 2 })]);
  wall(kit, [xr, wz], [xr, zb], floor, eave, [win(1.3), win(4.4, 0.75, 0.9, { y: H(1.3) }), win(7.6, 1.6, 1.4, { units: 2 })]);
  // back: kitchen pair, door to the deck, bedroom window
  wall(kit, [xr, zb], [xl, zb], floor, eave, [
    win(xr - 4.6, 1.6, 1.1, { units: 2, y: H(1.15) }),
    { u: xr - 2.6, y: floor, w: 0.9, h: 2.05, type: 'door', frame: 'trim', panel: 'trim' },
    win(xr - 0.2, 1.0), win(xr + 3.6, 1.6, 1.4, { units: 2 }),
  ]);
  // left side (faces the drive): four windows of mixed sizes, like the reference design
  wall(kit, [xl, zb], [xl, zf], floor, eave, [win(1.0, 1.0), win(2.9, 1.0), win(5.2, 1.0, 1.55), win(6.7, 0.75, 1.2)]);
  // corner boards
  for (const [x, z, sx, sz] of [[xl, zf, -1, 1], [xl, zb, -1, -1], [xr, zb, 1, -1], [xr, wz, 1, 1], [wx0, wz, -1, 1]]) {
    kit.add('trim', boxSpan(x - sx * 0.02 + (sx < 0 ? -0.07 : 0), x + (sx > 0 ? 0.09 : 0.02), floor + 0.12, eave, z - 0.02, z + 0.02 * sz + (sz > 0 ? 0.03 : -0.03)));
    kit.add('trim', boxSpan(x - 0.03, x + 0.03, floor + 0.12, eave, z - (sz > 0 ? 0.02 : 0.09), z + (sz > 0 ? 0.09 : 0.02)));
  }
  // frieze under the soffit
  kit.add('trim', boxSpan(xl, wx0, eave - 0.16, eave, zf, zf + 0.025));
  kit.add('trim', boxSpan(wx0, xr, eave - 0.16, eave, wz, wz + 0.025));
  kit.add('trim', boxSpan(xl, xr, eave - 0.16, eave, zb - 0.025, zb));
  kit.add('trim', boxSpan(xl - 0.025, xl, eave - 0.16, eave, zb, zf));
  kit.add('trim', boxSpan(xr, xr + 0.025, eave - 0.16, eave, zb, wz));

  kit.lining = null;
  // ---- roofs: main hip + front wing hip ----
  kit.layer = 'roof';
  // the wing roof runs back into the main one: no fascia or gutter where the two overlap (it would hang inside the rooms)
  const main = hipRoof(kit, xl - ov, xr + ov, zb - ov, zf + ov, eave, k, { front: [xl - ov, wx0 - ov] });
  hipRoof(kit, wx0 - ov, xr + ov, zf - 4.2, wz + ov, eave + 0.005, k, { soffit: false, back: null, left: [zf + ov, wz + ov], right: [zf + ov, wz + ov] });
  kit.add('trim', boxSpan(wx0 - ov, xr + ov, eave - 0.04, eave, zf + ov, wz + ov)); // wing ceiling beyond the main one
  // attic vent (small gable) on the left slope, as in the reference design
  const vx = -4.6, vz = -0.4, vy = eave + (vx - (xl - ov)) * k * 0.98;
  kit.add('siding', prism2D([[-0.55, 0], [0.55, 0], [0, 0.42]], 0.05).rotateY(-Math.PI / 2).translate(vx - 0.35, vy, vz));
  kit.add('roof', slab(V3(vx - 0.35, vy + 0.0, vz - 0.65), V3(0.9, 0.18, 0), V3(0, 0.46, 0.65), 0.06));
  kit.add('roof', slab(V3(vx - 0.35, vy + 0.0, vz + 0.65), V3(0, 0.46, -0.65), V3(0.9, 0.18, 0), 0.06));
  kit.add('metal', new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6).translate(-2.0, main.ry - 0.2, -1.4));

  // ---- entry stoop with a small gable canopy ----
  kit.layer = 'site';
  const sx0 = -0.85, sx1 = wx0, sz1 = zf + 1.35, sh = floor - 0.03;
  kit.add('concrete', worldUV(boxSpan(sx0, sx1, 0, sh, zf, sz1)));
  for (let i = 0; i < 3; i++) kit.add('concrete', worldUV(boxSpan(sx0 + 0.15, sx1 - 0.25, 0, sh - 0.24 * (i + 1), sz1, sz1 + 0.3 * (i + 1))));
  // cedar rail on the open side
  kit.add('cedar', boxSpan(sx1 - 0.08, sx1, sh, sh + 0.9, zf + 0.1, sz1 - 0.05));
  for (let z = zf + 0.2; z < sz1; z += 0.13) kit.add('cedar', boxSpan(sx1 - 0.1, sx1 - 0.06, sh, sh + 0.86, z, z + 0.05));
  kit.add('cedar', boxSpan(sx0 - 0.05, sx0 + 0.08, sh, eave - 0.6, sz1 - 0.12, sz1));
  // gable canopy: ridge runs out from the wall
  kit.layer = 'roof';
  const cx = (sx0 + sx1) / 2, chw = (sx1 - sx0) / 2 + 0.25, cy = eave - 0.55, cA = cy + chw * 0.7, cz1 = sz1 + 0.25;
  kit.add('roof', slab(V3(cx - chw, cy, zf), V3(0, 0, cz1 - zf), V3(chw, cA - cy, 0), 0.08));
  kit.add('roof', slab(V3(cx + chw, cy, cz1), V3(0, 0, zf - cz1), V3(-chw, cA - cy, 0), 0.08));
  kit.add('cedar', prism2D([[cx - chw + 0.1, cy], [cx + chw - 0.1, cy], [cx, cA - 0.05]], 0.06).translate(0, 0, cz1 - 0.12));
  kit.add('cedar', boxSpan(cx - chw, cx + chw, cy - 0.16, cy, cz1 - 0.16, cz1 - 0.04));

  // ---- brick chimney beside the entry ----
  kit.layer = 'shell';
  const chx0 = -1.75, chx1 = -0.95, chz0 = zf, chz1 = zf + 0.62;
  kit.add('brick', worldUV(boxSpan(chx0, chx1, 0, eave + 0.2, chz0, chz1)));
  kit.add('brick', worldUV(boxSpan(chx0 + 0.08, chx1 - 0.08, eave + 0.2, main.ry - 0.1, chz0 - 0.4, chz1 - 0.12)));
  kit.add('concrete', worldUV(boxSpan(chx0 + 0.04, chx1 - 0.04, main.ry - 0.1, main.ry, chz0 - 0.44, chz1 - 0.08)));
  // stone and wood accent: low stone planter left of the steps with a cedar cap
  kit.layer = 'site';
  kit.add('stone', worldUV(boxSpan(-2.6, -1.85, 0, 0.55, zf + 0.7, zf + 2.3)));
  kit.add('cedar', boxSpan(-2.65, -1.8, 0.55, 0.62, zf + 0.65, zf + 2.35));
  kit.add('soil', boxSpan(-2.5, -1.95, 0.5, 0.56, zf + 0.8, zf + 2.2));

  // ---- carport on the left: flat roof on posts, concrete pad ----
  const cpx0 = -10.3, cpx1 = xl, cpz0 = -3.6, cpz1 = 3.8, cph = 2.75;
  kit.add('concrete', worldUV(boxSpan(cpx0, cpx1, -0.02, 0.05, cpz0, cpz1)));
  for (const z of [cpz0 + 0.2, (cpz0 + cpz1) / 2, cpz1 - 0.2]) kit.add('trim', boxSpan(cpx0 + 0.15, cpx0 + 0.3, 0.05, cph, z - 0.075, z + 0.075));
  kit.layer = 'roof';
  kit.add('trim', boxSpan(cpx0 + 0.05, cpx1, cph, cph + 0.22, cpz0 - 0.1, cpz1 + 0.1));
  kit.add('roof', worldUV(boxSpan(cpx0 - 0.15, cpx1 + 0.05, cph + 0.22, cph + 0.3, cpz0 - 0.25, cpz1 + 0.25)));
  kit.add('metal', boxSpan(cpx0 - 0.25, cpx0 - 0.15, cph + 0.1, cph + 0.28, cpz0 - 0.25, cpz1 + 0.25));

  kit.layer = 'site';
  // ---- back deck around a big tree, shade sail, brick patio ----
  const dx0 = -1.6, dx1 = 5.6, dz0 = zb, dz1 = zb - 3.8, dh = 0.55;
  kit.add('deck', worldUV(boxSpan(dx0, dx1, dh - 0.06, dh, dz1, dz0)));
  kit.add('cedar', boxSpan(dx0, dx1, 0.12, dh - 0.06, dz1, dz1 + 0.06));
  kit.add('cedar', boxSpan(dx0, dx0 + 0.06, 0.12, dh - 0.06, dz1, dz0));
  kit.add('cedar', boxSpan(dx1 - 0.06, dx1, 0.12, dh - 0.06, dz1, dz0));
  kit.add('concrete', worldUV(boxSpan(2.0, 3.2, dh, floor - 0.03, zb - 0.6, zb)));   // step at the back door (x = 2.6)
  // the tree comes up through the deck
  const tx = 1.0, tz = zb - 2.4;
  kit.add('trunk', new THREE.CylinderGeometry(0.34, 0.5, 9.5, 12).translate(tx, 4.75, tz));
  for (let i = 0; i < 6; i++) {
    const t = i / 5, r = 2.6 - t * 1.7, y = 6.2 + t * 6.0, gg = new THREE.ConeGeometry(r, 2.4, 11, 1);
    gg.rotateY(i * 0.8); gg.translate(tx, y, tz); kit.add('fir', gg);
  }
  // shade sail: house eave corner, tree, a post off the deck corner
  const P1 = V3(dx1 - 0.3, eave - 0.15, zb - 0.6), P2 = V3(tx + 0.1, 3.4, tz + 0.2), P3 = V3(dx1 + 0.4, 2.55, dz1 - 0.3);
  const sail = new THREE.BufferGeometry().setFromPoints([P1, P2, P3]);
  sail.computeVertexNormals(); sail.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(6), 2));
  kit.add('sail', sail);
  kit.add('metal', new THREE.CylinderGeometry(0.05, 0.06, 2.6, 8).translate(P3.x, 1.3, P3.z));
  // a table and two chairs
  kit.add('trim', new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16).translate(-0.4, dh + 0.72, zb - 1.4));
  kit.add('metal', new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6).translate(-0.4, dh + 0.36, zb - 1.4));
  for (const [x, z] of [[-1.0, zb - 1.0], [0.25, zb - 1.9]]) { kit.add('greens', boxSpan(x - 0.22, x + 0.22, dh + 0.42, dh + 0.46, z - 0.22, z + 0.22)); kit.add('greens', boxSpan(x - 0.22, x + 0.22, dh + 0.46, dh + 0.95, z - 0.24, z - 0.2)); }
  kit.add('paver', worldUV(boxSpan(-3.2, 7.4, -0.02, 0.035, dz1 - 3.6, dz1)));

  // ---- site ----
  const { x0, x1, z0 } = LOT;
  const P = PLINTH;
  kit.add('plinth', boxSpan(P.x0, P.x1, -P.depth, -0.02, P.z0, P.z1));
  kit.add('lawn', worldUV(boxSpan(P.x0 + 0.05, P.x1 - 0.05, -0.02, 0.0, P.z0 + 0.05, 14.9)));
  kit.add('concrete', worldUV(boxSpan(P.x0 + 0.05, P.x1 - 0.05, -0.02, 0.025, 13.4, 14.9)));     // sidewalk
  kit.add('lawn', worldUV(boxSpan(P.x0 + 0.05, P.x1 - 0.05, -0.02, 0.0, 14.9, 16.0)));          // planting strip
  kit.add('concrete', worldUV(boxSpan(P.x0 + 0.05, P.x1 - 0.05, -0.02, 0.06, 16.0, 16.15)));     // curb
  kit.add('asphalt', worldUV(boxSpan(P.x0 + 0.05, P.x1 - 0.05, -0.08, -0.06, 16.15, P.z1 - 0.05)));
  kit.add('plinth', boxSpan(P.x0 + 0.05, P.x1 - 0.05, -0.2, -0.08, 16.15, P.z1 - 0.05));
  // driveway to the carport, and the concrete apron in front of the entry
  kit.add('concrete', worldUV(boxSpan(cpx0, cpx1 - 0.6, -0.02, 0.04, cpz1, 13.4)));
  kit.add('concrete', worldUV(boxSpan(cpx0, cpx1 - 0.6, -0.02, 0.03, 14.9, 16.0)));
  kit.add('concrete', worldUV(boxSpan(cpx1 - 0.6, wx0 + 0.2, -0.02, 0.035, zf, sz1 + 1.6)));
  kit.add('paver', worldUV(boxSpan(-0.2, 0.9, -0.02, 0.03, sz1 + 1.6, 13.4)));
  // back fence
  const fh = 1.7, fence = (ax, az, bx, bz) => kit.add('fence', worldUV(boxSpan(Math.min(ax, bx) - 0.03, Math.max(ax, bx) + 0.03, 0, fh, Math.min(az, bz) - 0.03, Math.max(az, bz) + 0.03)));
  fence(x0 + 0.05, z0 + 0.05, x1 - 0.05, z0 + 0.05);
  fence(x1 - 0.05, z0 + 0.05, x1 - 0.05, zb + 0.4);
  fence(x0 + 0.05, z0 + 0.05, x0 + 0.05, cpz0);
  for (let x = x0 + 2.4; x < x1; x += 2.4) kit.add('fence', boxSpan(x - 0.05, x + 0.05, 0, fh + 0.08, z0 + 0.02, z0 + 0.12));
  // planting: hydrangeas along the front and the carport side, shrubs by the wing, garden beds out back
  const shrub = (x, z, r, seed, key = 'hedge') => { const g = blob(r, seed); g.scale(1, 0.8, 1).translate(x, r * 0.7, z); kit.add(key, g); };
  for (let i = 0; i < 6; i++) shrub(-6.2 + i * 0.75, zf + 0.6 + (i % 2) * 0.15, 0.42 + (i % 3) * 0.05, i * 2.3);
  for (let i = 0; i < 4; i++) shrub(wx0 + 0.6 + i * 1.3, wz + 0.65, 0.45, i * 4.1 + 9);
  for (let i = 0; i < 5; i++) shrub(xr + 0.7, wz - 0.8 - i * 1.6, 0.5 + (i % 2) * 0.08, i * 3.7 + 20);
  for (let i = 0; i < 6; i++) shrub(-9.8 + i * 1.4, z0 + 1.0, 0.55, i * 1.9 + 40);
  kit.add('soil', boxSpan(6.6, 9.2, 0, 0.12, -13.4, -10.8));
  for (let i = 0; i < 6; i++) { const g = new THREE.IcosahedronGeometry(0.22, 0); g.scale(1, 0.7, 1).translate(6.9 + (i % 3) * 0.9, 0.22, -13.0 + Math.floor(i / 3) * 1.4); kit.add('greens', g); }
  // trees: street tree front left, a maple front right, one in the back corner
  deciduous(kit, -3.2, 15.45, 6.4, 2.0, 11);
  deciduous(kit, 8.2, -9.0, 6.0, 2.0, 7);
  deciduous(kit, -8.6, -12.6, 7.2, 2.6, 23);
  fir(kit, 8.2, -14.0, 11.0, 2);

  buildInterior(kit);
  return kit.merged();
}

// ---------- the main floor, laid out from the reference design ----------
// Front row: bedroom | living room (fireplace on the front wall, entry door) | wing bedroom with the window bank.
// Middle: hall, full bath with the tiled shower, half bath off the kitchen.
// Back row: bedroom | dining room | kitchen with the peninsula and the breakfast nook, door to the deck.
// The finished basement (fourth bedroom, laundry) is not modelled.
// floor: room interior in plan (x, z), inset from exterior walls so a pill inside stays on that floor.
// yard: outer face of an exterior wall. A pill that cannot fit parks fully outside one of these.
export const ROOMS = [
  { key: 'street', label: 'Front walk', x: 0.35, z: 11.5, look: [0.1, -1], outside: true },
  { key: 'living', label: 'Living room', x: 0.95, z: -0.6, look: [-0.75, 1], cx: -1.4, cz: 0.9,
    floor: [[-4.4, -1.3], [2.3, -1.3], [2.3, 2.42], [-4.4, 2.42]],
    yard: [[[-4.0, 2.95], [1.4, 2.95]]] },
  { key: 'dining', label: 'Dining room', x: 1.3, z: -1.5, look: [-1, -0.45], cx: -0.5, cz: -2.9,
    floor: [[-3.0, -4.45], [2.0, -4.45], [2.0, -0.7], [-3.0, -0.7]],
    yard: [[[-2.6, -4.95], [1.6, -4.95]]] },
  { key: 'kitchen', label: 'Kitchen', x: 0.95, z: -1.9, look: [1, -0.22], cx: 4.6, cz: -2.9,
    floor: [[1.3, -4.45], [6.22, -4.45], [6.22, -0.7], [1.3, -0.7]],
    yard: [[[1.6, -4.95], [6.75, -4.95]], [[6.75, -4.8], [6.75, -1.0]]] },
  { key: 'bed1', label: 'Bedroom with the window bank', short: 'Window-bank bedroom', x: 2.2, z: 1.75, look: [0.55, 1], cx: 4.0, cz: 3.2,
    floor: [[1.55, 0.85], [6.2, 0.85], [6.2, 4.52], [1.55, 4.52]],
    yard: [[[6.75, 1.2], [6.75, 5.15]], [[1.4, 5.15], [6.75, 5.15]]] },
  { key: 'bed2', label: 'Front bedroom', x: -4.35, z: -0.45, look: [-1, 0.35], cx: -5.3, cz: 0.9,
    floor: [[-6.22, -1.3], [-3.6, -1.3], [-3.6, 2.42], [-6.22, 2.42]],
    yard: [[[-6.75, -1.0], [-6.75, 2.95]], [[-6.6, 2.95], [-4.0, 2.95]]] },
  { key: 'bed3', label: 'Back bedroom', x: -3.3, z: -1.45, look: [-0.35, -1], cx: -4.6, cz: -2.9,
    floor: [[-6.22, -4.45], [-2.2, -4.45], [-2.2, -0.7], [-6.22, -0.7]],
    yard: [[[-6.6, -4.95], [-2.6, -4.95]], [[-6.75, -4.8], [-6.75, -1.0]]] },
  { key: 'bath', label: 'Bathroom', x: 2.95, z: 0.1, look: [1, 0.15], cx: 3.6, cz: 0.1,
    floor: [[2.3, -1.25], [4.9, -1.25], [4.9, 1.45], [2.3, 1.45]],
    yard: [] },
  { key: 'half', label: 'Half bath', cx: 5.6, cz: 0.1,
    floor: [[4.2, -1.25], [6.2, -1.25], [6.2, 1.45], [4.2, 1.45]],
    yard: [[[6.75, -1.0], [6.75, 1.2]]] },
  { key: 'deck', label: 'Back deck', x: 4.6, z: -10.9, look: [-0.42, 1], outside: true },
];

function buildInterior(kit) {
  const { floor, xl, xr, zf, zb, wx0, wz, eave } = D;
  const F = floor + 0.02, C = eave - 0.04, T = D.T + 0.012, t = 0.12;
  Object.assign(LEVELS, { F, C });
  const PI = Math.PI;
  BLOCKERS.length = 0; MODEL_SPOTS.length = 0; LIGHTS.length = 0; ITEMS.length = 0; STRUCT.length = 0; DOORS.length = 0;
  const block = (x0, x1, z0, z1) => BLOCKERS.push([Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)]);
  // exterior walls (inner side of each wall line), with the two doorways left open
  block(xl, -0.31, zf - D.T, zf); block(0.61, wx0, zf - D.T, zf);
  block(wx0, wx0 + D.T, zf, wz); block(wx0, xr, wz - D.T, wz); block(xr - D.T, xr, zb, wz);
  block(xl, 2.15, zb, zb + D.T); block(3.05, xr, zb, zb + D.T); block(xl, xl + D.T, zb, zf);
  // QA solids include the 12 mm plaster lining on the room side (grown on both faces of the thin axis; outside is empty)
  { const n = BLOCKERS.length, L = 0.012; for (const b of BLOCKERS.slice(n - 8)) { const thinX = b[1] - b[0] < b[3] - b[2]; STRUCT.push(thinX ? [b[0] - L, b[1] + L, F, C, b[2], b[3]] : [b[0], b[1], F, C, b[2] - L, b[3] + L]); } }
  DOORS.push({ x0: -0.31, x1: 0.61, z0: zf - D.T, z1: zf, axis: 'x' }, { x0: 2.15, x1: 3.05, z0: zb, z1: zb + D.T, axis: 'x' });
  // the ceiling: painted plaster, part of the roof layer so cutaway and x-ray open the rooms up
  kit.layer = 'roof';
  kit.add('ceiling', boxSpan(xl + 0.1, xr - 0.1, C - 0.01, C, zb + 0.1, zf - 0.1));
  kit.add('ceiling', boxSpan(wx0 + 0.1, xr - 0.1, C - 0.01, C, zf - 0.1, wz - 0.1));
  kit.layer = 'interior';
  // floors: oak throughout, tile in the two baths
  kit.add('oak', boxSpan(xl + 0.1, xr - 0.1, floor, F, zb + 0.1, zf - 0.1));
  kit.add('oak', boxSpan(wx0 + 0.1, xr - 0.1, floor, F, zf - 0.1, wz - 0.1));
  kit.add('tile', boxSpan(2.66, 4.54, F, F + 0.006, -0.94, 1.14));
  kit.add('tile', boxSpan(4.66, xr - T, F, F + 0.006, -0.94, 1.14));
  // partitions with door gaps: gaps = [[centre, width, height?]]
  const iw = (a0, a1, at, axis, gaps = []) => {
    const seg = (b0, b1, y0, y1) => {
      if (b1 - b0 < 0.01) return;
      kit.add('plaster', axis === 'x' ? boxSpan(b0, b1, y0, y1, at - t / 2, at + t / 2) : boxSpan(at - t / 2, at + t / 2, y0, y1, b0, b1));
      STRUCT.push(axis === 'x' ? [b0, b1, y0, y1, at - t / 2, at + t / 2] : [at - t / 2, at + t / 2, y0, y1, b0, b1]);
      if (y0 <= F + 0.01) { if (axis === 'x') block(b0, b1, at - t / 2, at + t / 2); else block(at - t / 2, at + t / 2, b0, b1); }
    };
    let c = a0;
    for (const [m, w, h = 2.05] of gaps.slice().sort((p, q) => p[0] - q[0])) {
      DOORS.push(axis === 'x' ? { x0: m - w / 2, x1: m + w / 2, z0: at - t / 2, z1: at + t / 2, axis } : { x0: at - t / 2, x1: at + t / 2, z0: m - w / 2, z1: m + w / 2, axis });
      seg(c, m - w / 2, F, C);
      seg(m - w / 2, m + w / 2, F + h, C);
      const o = (u0, u1, y0, y1) => kit.add('trim', axis === 'x' ? rbSpan(u0, u1, y0, y1, at - t / 2 - 0.015, at + t / 2 + 0.015, 0.006) : rbSpan(at - t / 2 - 0.015, at + t / 2 + 0.015, y0, y1, u0, u1, 0.006));
      // casings stand 3 mm proud of the jamb and header faces so the coplanar faces never fight
      o(m - w / 2 - 0.08, m - w / 2 + 0.003, F, F + h + 0.08); o(m + w / 2 - 0.003, m + w / 2 + 0.08, F, F + h + 0.08); o(m - w / 2 - 0.08, m + w / 2 + 0.08, F + h - 0.003, F + h + 0.08);
      c = m + w / 2;
    }
    seg(c, a1, F, C);
  };
  iw(xl + T, xr - T, -1.0, 'x', [[-3.3, 0.85], [-0.6, 2.6, 2.2], [2.0, 0.9], [5.6, 0.75]]);
  iw(-1.0, zf - T, -4.0, 'z', [[-0.4, 0.85]]);
  iw(zb + T, -1.0, -2.6, 'z');
  iw(zb + T, -1.0, 1.6, 'z', [[-4.1, 0.8]]); // kitchen to dining: a plain door at the north end; the west wall carries the range run (photo)
  iw(1.2, zf, wx0, 'z');
  iw(wx0, xr - T, 1.2, 'x', [[2.0, 0.85]]);
  iw(-1.0, 1.2, 2.6, 'z', [[0.1, 0.75]]);
  iw(-1.0, 1.2, 4.6, 'z');
  // crown along the outer walls, where they meet the ceiling
  const cr = 0.13, cd = 0.07;
  const crown = (x0, x1, z0, z1) => kit.add('trim', rbSpan(x0, x1, C - cr, C, z0, z1, 0.012));
  crown(xl + T, wx0 + t / 2, zf - T - cd, zf - T); crown(xl + T, xr - T, zb + T, zb + T + cd); crown(xl + T, xl + T + cd, zb + T, zf - T);
  crown(xr - T - cd, xr - T, zb + T, wz - T); crown(wx0 + T, xr - T, wz - T - cd, wz - T); crown(wx0 + T, wx0 + T + cd, zf - T, wz - T);
  // baseboards along the outer walls
  const base = (x0, x1, z0, z1) => kit.add('trim', rbSpan(x0, x1, F, F + 0.11, z0, z1, 0.006));
  base(xl + T, xr - T, zb + T, zb + T + 0.018); base(xl + T, wx0, zf - T - 0.018, zf - T);
  base(xl + T, xl + T + 0.018, zb + T, zf - T); base(xr - T - 0.018, xr - T, zb + T, wz - T); base(wx0 + T, xr - T, wz - T - 0.018, wz - T);

  // ---- furniture kit: rounded parts placed in a local frame (cx, cz, rot), y from the floor ----
  const piece = (cx, cz, rot, y = F) => {
    let item = { name: `piece@${cx.toFixed(2)},${cz.toFixed(2)}`, geos: [], keys: new Set() };
    ITEMS.push(item);
    const put = (key, g) => { g.rotateY(rot).translate(cx, y, cz); kit.add(key, g); item.geos.push(g); item.keys.add(key); };
    const P = {
      // QA: start a separate item inside this piece (a lamp on a nightstand), so its contact is checked on its own
      sub: (name) => { item = { name: `${name}@${cx.toFixed(2)},${cz.toFixed(2)}`, geos: [], keys: new Set() }; ITEMS.push(item); return P; },
      box: (key, x0, x1, y0, y1, z0, z1, r = 0.012, seg = 2) => put(key, rbSpan(x0, x1, y0, y1, z0, z1, r, seg)),
      soft: (key, x0, x1, y0, y1, z0, z1, k = 0.4, axis = 'y', r) => {
        const w = x1 - x0, h = y1 - y0, d = z1 - z0;
        put(key, puff(RB(w, h, d, r ?? Math.min(w, h, d) * 0.45, 4), w, h, d, k, axis).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
      },
      cyl: (key, x, z, r0, r1, y0, y1, seg = 14) => put(key, new THREE.CylinderGeometry(r1, r0, y1 - y0, seg).translate(x, (y0 + y1) / 2, z)),
      lathe: (key, x, z, pts, seg = 24) => put(key, new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg).translate(x, 0, z)),
      geo: (key, g) => put(key, g),
      block: (x0, x1, z0, z1) => {
        const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => V3(x, 0, z).applyAxisAngle(V3(0, 1, 0), rot));
        block(Math.min(...pts.map((p) => p.x)) + cx, Math.max(...pts.map((p) => p.x)) + cx, Math.min(...pts.map((p) => p.z)) + cz, Math.max(...pts.map((p) => p.z)) + cz);
      },
      model: (key, x, z, r, size, extra = {}) => {
        const p = V3(x, 0, z).applyAxisAngle(V3(0, 1, 0), rot);
        MODEL_SPOTS.push({ key, x: cx + p.x, y, z: cz + p.z, rot: rot + r, size, ...extra, piece: item });
      },
    };
    return P;
  };
  // QA items for built-ins (counters, uppers, appliances, vanity): every kit part added inside fn joins one item
  const grab = (name, fn) => {
    const it = { name, geos: [], keys: new Set() }; ITEMS.push(it);
    kit.add = (k, g) => { it.geos.push(g); it.keys.add(k); return Kit.prototype.add.call(kit, k, g); };
    try { fn(); } finally { delete kit.add; }
  };
  const rug = (x0, x1, z0, z1, key = 'rug') => { const g = rbSpan(x0, x1, F, F + 0.012, z0, z1, 0.004); kit.add(key, g); ITEMS.push({ name: `rug@${((x0 + x1) / 2).toFixed(2)},${((z0 + z1) / 2).toFixed(2)}`, geos: [g], keys: new Set([key]), soft: true }); };
  const pillow = (P, key, x, y, z, w, h, d, tilt = 0, yaw = 0) => {
    const g = puff(RB(w, h, d, Math.min(w, h, d) * 0.48, 4), w, h, d, 0.62, 'z');
    g.rotateX(tilt).rotateY(yaw).translate(x, y, z); P.geo(key, g);
  };
  // sectional sofa with a chaise: rounded frame, soft seat and back cushions, throw pillows
  const sofa = (cx, cz, rot, len, chaise = 0, [SK, CK] = ['sofa', 'cushion']) => {
    const P = piece(cx, cz, rot), h = len / 2, arm = 0.2, D0 = -0.48, D1 = 0.48;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.cyl('walnut', sx * (h - 0.08), sz * 0.38, 0.022, 0.03, 0, 0.1, 10);
    P.box(SK, -h, h, 0.1, 0.42, D0, D1, 0.06, 3);
    P.box(SK, -h, h, 0.38, 0.84, D0, D0 + 0.2, 0.08, 3);
    for (const sx of [-1, 1]) P.soft(SK, sx > 0 ? h - arm : -h, sx > 0 ? h : -h + arm, 0.1, 0.64, D0, D1, 0.12, 'x', 0.09);
    const n = Math.max(1, Math.round((len - 2 * arm) / 0.75)), cw = (len - 2 * arm) / n;
    for (let i = 0; i < n; i++) {
      const x0 = -h + arm + i * cw;
      P.soft(CK, x0 + 0.01, x0 + cw - 0.01, 0.4, 0.58, D0 + 0.2, D1 + 0.02, 0.35);
      const g = puff(RB(cw - 0.02, 0.48, 0.2, 0.09, 4), cw - 0.02, 0.48, 0.2, 0.55, 'z');
      g.rotateX(-0.16).translate(x0 + cw / 2, 0.8, D0 + 0.27); P.geo(CK, g);
    }
    if (chaise) { // chaise end: one long seat cushion running forward
      const x0 = chaise > 0 ? h - 0.86 : -h, x1 = chaise > 0 ? h : -h + 0.86;
      P.box(SK, x0, x1, 0.1, 0.4, D1 - 0.04, D1 + 0.78, 0.06, 3);
      P.soft(CK, x0 + (chaise > 0 ? 0.01 : arm), x1 - (chaise > 0 ? arm : 0.01), 0.38, 0.56, D1 - 0.02, D1 + 0.76, 0.35);
      P.soft(SK, chaise > 0 ? h - arm : -h, chaise > 0 ? h : -h + arm, 0.1, 0.62, D1 - 0.04, D1 + 0.78, 0.12, 'x', 0.09);
      for (const sz of [-1, 1]) P.cyl('walnut', chaise * (h - 0.08), D1 + 0.39 + sz * 0.3, 0.022, 0.03, 0, 0.1, 10);
      P.block(Math.min(x0, x1), Math.max(x0, x1), D1, D1 + 0.78);
    }
    pillow(P, 'pillowA', -h + arm + 0.26, 0.76, D0 + 0.45, 0.42, 0.4, 0.14, -0.32, 0.25);
    pillow(P, 'pillowB', -h + arm + 0.72, 0.76, D0 + 0.47, 0.42, 0.4, 0.15, -0.3, -0.05);
    pillow(P, 'pillowA', h - arm - 0.28, 0.76, D0 + 0.45, 0.42, 0.4, 0.14, -0.32, -0.25);
    P.block(-h, h, D0, D1);
    return P;
  };
  const chair = (cx, cz, rot) => { // spindle-back dining chair, as in the reference design
    const P = piece(cx, cz, rot);
    P.box('walnut', -0.22, 0.22, 0.43, 0.475, -0.21, 0.23, 0.018);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.cyl('walnut', sx * 0.18, sz * 0.18, 0.02, 0.016, 0, 0.44, 10);
    for (const sx of [-1, 1]) P.cyl('walnut', sx * 0.18, -0.19, 0.02, 0.017, 0.44, 0.98, 10);
    P.box('walnut', -0.21, 0.21, 0.86, 0.97, -0.215, -0.175, 0.018);
    for (const sx of [-0.09, 0, 0.09]) P.cyl('walnut', sx, -0.195, 0.009, 0.009, 0.47, 0.87, 8);
    P.block(-0.23, 0.23, -0.23, 0.24);
  };
  const table = (cx, cz, rot, w, d, h = 0.76, key = 'walnut') => {
    const P = piece(cx, cz, rot);
    P.box(key, -w / 2, w / 2, h - 0.04, h, -d / 2, d / 2, 0.016);
    P.box(key, -w / 2 + 0.06, w / 2 - 0.06, h - 0.13, h - 0.04, -d / 2 + 0.06, d / 2 - 0.06, 0.008);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.lathe(key, sx * (w / 2 - 0.09), sz * (d / 2 - 0.09), [[0, 0], [0.024, 0], [0.026, 0.06], [0.02, 0.12], [0.03, 0.42], [0.022, 0.55], [0.03, h - 0.13], [0, h - 0.13]], 12);
    P.block(-w / 2, w / 2, -d / 2, d / 2);
    return P;
  };
  // bed: headboard at local -z. frame: 'walnut' (padded wood) or 'blackMetal' (metal rails)
  const bed = (cx, cz, rot, w, spread, frame = 'walnut', accent = 'pillowB', y = F) => {
    const P = piece(cx, cz, rot, y), h = w / 2, L = 2.05;
    P.box(frame === 'blackMetal' || frame === 'none' ? 'walnut' : frame, -h, h, frame === 'none' ? 0 : 0.14, 0.32, -L / 2, L / 2, 0.03); // no frame: a divan base on the floor
    P.box('bedding', -h + 0.03, h - 0.03, 0.3, 0.54, -L / 2 + 0.03, L / 2 - 0.03, 0.07, 3);
    P.soft(spread, -h - 0.05, h + 0.05, 0.27, 0.62, -L / 2 + 0.55, L / 2 + 0.05, 0.22, 'y', 0.09);
    P.soft('bedding', -h - 0.04, h + 0.04, 0.5, 0.63, -L / 2 + 0.5, -L / 2 + 0.78, 0.4, 'y', 0.06); // folded-back sheet
    pillow(P, 'bedding', -h / 2, 0.66, -L / 2 + 0.3, w / 2 - 0.06, 0.4, 0.16, -1.0);
    pillow(P, 'bedding', h / 2, 0.66, -L / 2 + 0.3, w / 2 - 0.06, 0.4, 0.16, -1.0);
    pillow(P, accent, 0, 0.72, -L / 2 + 0.48, 0.42, 0.34, 0.13, -0.5);
    if (frame === 'blackMetal') {
      for (const sx of [-1, 1]) { P.cyl('blackMetal', sx * h, -L / 2 - 0.02, 0.016, 0.016, 0, 1.08); P.cyl('blackMetal', sx * h, L / 2 + 0.03, 0.016, 0.016, 0, 0.6); }
      P.box('blackMetal', -h - 0.02, h + 0.02, 0.98, 1.06, -L / 2 - 0.04, -L / 2, 0.012);
      P.box('blackMetal', -h - 0.02, h + 0.02, 0.5, 0.56, L / 2 + 0.01, L / 2 + 0.05, 0.012);
    } else if (frame !== 'none') {
      P.soft(frame, -h - 0.04, h + 0.04, 0.3, 1.12, -L / 2 - 0.08, -L / 2, 0.15, 'z', 0.035);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.cyl('walnut', sx * (h - 0.06), sz * (L / 2 - 0.06), 0.025, 0.03, 0, 0.15, 10);
    }
    P.block(-h - 0.05, h + 0.05, -L / 2 - 0.08, L / 2 + 0.06);
    return P;
  };
  const lamp = (P, x, z, y0) => { // table lamp: ceramic base, linen shade (lit)
    P.sub('lamp');
    P.lathe('porcelain', x, z, [[0, y0], [0.06, y0], [0.075, y0 + 0.08], [0.05, y0 + 0.2], [0.012, y0 + 0.24], [0, y0 + 0.24]], 18);
    P.lathe('lampshade', x, z, [[0.13, y0 + 0.2], [0.09, y0 + 0.42]], 24);
  };
  const nightstand = (cx, cz, rot) => {
    const P = piece(cx, cz, rot);
    P.box('walnut', -0.24, 0.24, 0.0, 0.6, -0.2, 0.2, 0.02);
    P.box('walnut', -0.21, 0.21, 0.36, 0.52, 0.19, 0.215, 0.01);
    P.cyl('brass', 0, 0.228, 0.012, 0.012, 0.43, 0.45, 10);
    lamp(P, 0.04, -0.02, 0.6);
    P.block(-0.24, 0.24, -0.2, 0.2);
  };
  const dresser = (cx, cz, rot, w = 1.1, h = 0.8, key = 'walnut') => {
    const P = piece(cx, cz, rot);
    P.box(key, -w / 2, w / 2, 0.06, h, -0.24, 0.24, 0.02);
    P.box(key, -w / 2 + 0.04, w / 2 - 0.04, 0, 0.065, -0.2, 0.2, 0.008); // recessed plinth: the case stands on the floor
    const rows = 3, rh = (h - 0.12) / rows;
    for (let i = 0; i < rows; i++) {
      P.box(key, -w / 2 + 0.03, w / 2 - 0.03, 0.08 + i * rh, 0.06 + (i + 1) * rh, 0.24, 0.26, 0.008);
      for (const sx of [-1, 1]) P.cyl('brass', sx * w / 4, 0.272, 0.012, 0.012, 0.07 + (i + 0.5) * rh - 0.01, 0.07 + (i + 0.5) * rh + 0.01, 10);
    }
    P.block(-w / 2, w / 2, -0.24, 0.26);
    return P;
  };
  const toilet = (cx, cz, rot) => { // bowl at local +z, tank at -z
    const P = piece(cx, cz, rot);
    P.lathe('porcelain', 0, 0.1, [[0, 0], [0.12, 0], [0.13, 0.1], [0.17, 0.3], [0.19, 0.4], [0.16, 0.405], [0, 0.39]], 24);
    P.box('porcelain', -0.19, 0.19, 0.4, 0.43, -0.12, 0.33, 0.04, 3);
    P.box('porcelain', -0.21, 0.21, 0.42, 0.8, -0.32, -0.14, 0.03, 3);
    P.cyl('chrome', -0.14, -0.13, 0.01, 0.01, 0.72, 0.74, 8);
    P.block(-0.21, 0.21, -0.32, 0.35);
  };
  const curtains = (x0, x1, zFace, inward, y1) => { // sheer panels either side of a window, gently pleated
    for (const [a, b] of [[x0 - 0.18, x0 + 0.32], [x1 - 0.32, x1 + 0.18]]) {
      const g = new THREE.PlaneGeometry(b - a, y1 - F - 0.03, 18, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / (b - a)) * PI * 9) * 0.025);
      g.computeVertexNormals();
      g.translate((a + b) / 2, (y1 + F + 0.03) / 2, 0).translate(0, 0, zFace + inward * 0.09);
      kit.add('sheer', g);
    }
    kit.add('chrome', new THREE.CylinderGeometry(0.012, 0.012, x1 - x0 + 0.6, 8).rotateZ(PI / 2).translate((x0 + x1) / 2, y1 + 0.02, zFace + inward * 0.09));
  };
  const curtainsX = (z0, z1, xFace, inward, y1) => { // same, on a wall that runs along z
    for (const [a, b] of [[z0 - 0.18, z0 + 0.32], [z1 - 0.32, z1 + 0.18]]) {
      const g = new THREE.PlaneGeometry(b - a, y1 - F - 0.03, 18, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / (b - a)) * PI * 9) * 0.025);
      g.computeVertexNormals();
      g.rotateY(PI / 2).translate(xFace + inward * 0.09, (y1 + F + 0.03) / 2, (a + b) / 2);
      kit.add('sheer', g);
    }
    kit.add('chrome', new THREE.CylinderGeometry(0.012, 0.012, z1 - z0 + 0.6, 8).rotateX(PI / 2).translate(xFace + inward * 0.09, y1 + 0.02, (z0 + z1) / 2));
  };
  const frameArt = (x, y, z, w, h, along, key = 'art', face = 1) => { // picture on a wall; along = 'x' or 'z'; face = +1/-1 toward the room
    const g1 = rbSpan(-w / 2, w / 2, -h / 2, h / 2, -0.015, 0.015, 0.006), g2 = rbSpan(-w / 2 + 0.05, w / 2 - 0.05, -h / 2 + 0.05, h / 2 - 0.05, 0.012, 0.02, 0.002);
    for (const [k, g] of [['blackMetal', g1], [key, g2]]) { if (face < 0) g.rotateY(PI); if (along === 'z') g.rotateY(PI / 2); kit.add(k, g.translate(x, y, z)); }
  };
  const dome = (x, z, key, k) => { // flush ceiling fixture, and the light it gives
    const gd = new THREE.SphereGeometry(0.19, 20, 8, 0, PI * 2, PI / 2, PI / 2).scale(1, 0.45, 1).translate(x, C - 0.005, z);
    kit.add('lamp', gd); ITEMS.push({ name: `ceiling-light ${key}`, geos: [gd], keys: new Set(['lamp']), ceiling: true });
    kit.add('brass', new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10).translate(x, C - 0.095, z));
    LIGHTS.push({ key, x, y: C - 0.25, z, k });
  };

  // ---- living room: white mantel around a brick firebox with a brass screen, TV above; sectional, recliner, ottoman ----
  // sizes measured off the reference design (55-inch TV as the scale): shelf 1.45 m, legs 1.25 m, opening 0.99 x 0.83 m
  const fz = zf - T, mc = -1.35, X = (d) => mc + d;
  kit.add('trim', rbSpan(X(-0.625), X(-0.45), F, F + 1.03, fz - 0.2, fz, 0.012));
  kit.add('trim', rbSpan(X(0.45), X(0.625), F, F + 1.03, fz - 0.2, fz, 0.012));
  kit.add('trim', rbSpan(X(-0.625), X(0.625), F + 0.83, F + 1.03, fz - 0.18, fz, 0.012));
  kit.add('trim', rbSpan(X(-0.725), X(0.725), F + 1.03, F + 1.09, fz - 0.28, fz, 0.016));
  // brick surround flush with the mantel legs, a 0.18 m deep firebox lined in smoked brick, grate and logs,
  // four-leaf bi-fold doors: polished brass frame and mullions over dark smoked glass (reference design)
  const fd = fz - 0.2, ox = 0.36, oy0 = 0.05, oy1 = 0.58; // opening: brick shows on both sides and above the doors
  for (const [x0, x1, y0, y1] of [[-0.45, -ox, 0, 0.83], [ox, 0.45, 0, 0.83], [-ox, ox, oy1, 0.83], [-ox, ox, 0, oy0]]) kit.add('brick', worldUV(boxSpan(X(x0), X(x1), F + y0, F + y1, fd, fz)));
  kit.add('brickDark', worldUV(boxSpan(X(-ox), X(ox), F + oy0, F + oy1, fz - 0.03, fz - 0.01)));
  for (const s of [-1, 1]) kit.add('brickDark', worldUV(boxSpan(X(s * ox - s * 0.012), X(s * ox), F + oy0, F + oy1, fd + 0.01, fz - 0.03)));
  kit.add('brickDark', worldUV(boxSpan(X(-ox), X(ox), F + oy1 - 0.012, F + oy1, fd + 0.01, fz - 0.03)));
  kit.add('firebox', boxSpan(X(-ox), X(ox), F + oy0, F + oy0 + 0.004, fd + 0.01, fz - 0.03));
  for (const dx of [-0.22, -0.11, 0, 0.11, 0.22]) kit.add('blackMetal', boxSpan(X(dx - 0.008), X(dx + 0.008), F + oy0, F + oy0 + 0.05, fz - 0.15, fz - 0.05));
  kit.add('blackMetal', boxSpan(X(-0.25), X(0.25), F + oy0 + 0.04, F + oy0 + 0.055, fz - 0.15, fz - 0.135));
  for (const [dx, dz, r] of [[-0.02, -0.11, 0.042], [0.03, -0.07, 0.038]]) kit.add('walnut', new THREE.CylinderGeometry(r, r * 1.05, 0.42, 12).rotateZ(Math.PI / 2).rotateY(0.08).translate(X(dx), F + oy0 + 0.055 + r, fz + dz));
  const gz0 = fd - 0.012, gz1 = fd - 0.004, bx = ox + 0.03, by0 = oy0 - 0.02, by1 = oy1 + 0.03;
  kit.add('smoke', boxSpan(X(-ox), X(ox), F + oy0, F + oy1, gz0 + 0.002, gz1 - 0.002));
  // brass: outer frame, bottom vent rail, three mullions (four bi-fold leaves), two pull handles
  for (const [x0, x1, y0, y1] of [[-bx, bx, oy1, by1], [-bx, bx, by0, oy0 + 0.035], [-bx, -ox + 0.012, by0, by1], [ox - 0.012, bx, by0, by1], [-0.01, 0.01, oy0, oy1], [-ox / 2 - 0.01, -ox / 2 + 0.01, oy0, oy1], [ox / 2 - 0.01, ox / 2 + 0.01, oy0, oy1]]) kit.add('brass', rbSpan(X(x0), X(x1), F + y0, F + y1, gz0 - 0.016, gz0, 0.004));
  for (const dx of [-0.1, 0.1]) kit.add('brass', new THREE.CylinderGeometry(0.007, 0.007, 0.14, 10).translate(X(dx), F + (oy0 + oy1) / 2, gz0 - 0.03));


  // hearth: glazed red quarry tile, 20 cm squares with dark grout (reference design)
  kit.add('quarry', rbSpan(X(-0.64), X(0.64), F, F + 0.025, fz - 0.45, fz - 0.19, 0.004));
  for (let k = 1; k < 6; k++) kit.add('firebox', boxSpan(X(-0.64 + k * 1.28 / 6 - 0.003), X(-0.64 + k * 1.28 / 6 + 0.003), F + 0.025, F + 0.027, fz - 0.45, fz - 0.19));
  kit.add('firebox', boxSpan(X(-0.64), X(0.64), F + 0.025, F + 0.027, fz - 0.323, fz - 0.317));
  block(X(-0.725), X(0.725), fz - 0.45, fz);
  kit.add('screen', rbSpan(X(-0.63), X(0.55), F + 1.23, F + 1.93, fz - 0.05, fz - 0.01, 0.01));
  kit.add('blackMetal', rbSpan(X(-0.19), X(0.11), F + 1.43, F + 1.73, fz - 0.012, fz - 0.002, 0.004));
  // sectional at the west end facing the room, chaise to the north (reference design)
  rug(-3.0, -0.74, -0.1, 2.4); // stops short of the plant block
  sofa(-2.75, 1.21, Math.PI / 2, 2.3, 1); // 0.95 m clear to the bedroom wall: the walk to both bedroom doors (HF13)
  { const P = piece(0.75, 0.6, -PI / 2); P.model('recliner', 0, 0, 0, 0.82); P.block(-0.42, 0.42, -0.42, 0.42); }
  { const P = piece(-1.15, 0.45, Math.PI / 2); P.model('coffee', 0, 0, 0, 0.8, { height: 0.44 }); P.block(-0.4, 0.4, -0.25, 0.25); } // by the sofa's south end: out of the fireplace view (living-05), clear of the bedroom walk
  { const P = piece(0.98, 1.55, 0); P.model('ottoman', 0, 0, 0, 0.62); P.block(-0.3, 0.3, -0.3, 0.3); }
  { const P = piece(-3.62, 1.4, 0); P.model('plantSmall', 0, 0, 0, 0.42); } // beside the sofa arm, out of the walk
  { const P = piece(-3.65, 2.22, 0); P.model('plantLarge', 0, 0, 0, 0.62); P.block(-0.25, 0.25, -0.25, 0.25); }
  curtains(-3.3, -2.42, fz, -1, F + 2.42);
  // white 25 mm blinds inside the living window (reference design), slats tilted open
  { const bz = zf - 0.16, y0 = floor + 0.85, y1 = floor + 0.85 + 1.45;
    kit.add('sash', boxSpan(-3.29, -2.31, y1 - 0.04, y1, bz - 0.025, bz + 0.025));
    for (let yy = y1 - 0.06; yy > y0 + 0.03; yy -= 0.024) kit.add('sash', box(0.96, 0.003, 0.025, 0, 0, 0).rotateX(0.6).translate(-2.8, yy, bz));
    kit.add('sash', boxSpan(-3.29, -2.31, y0 + 0.01, y0 + 0.025, bz - 0.014, bz + 0.014));
    for (const x of [-3.1, -2.5]) kit.add('sash', boxSpan(x - 0.002, x + 0.002, y0 + 0.02, y1 - 0.04, bz - 0.016, bz - 0.012)); }
  // left of the hearth: the big plant on a concrete block (reference design); mantel vases with dried stems; doormat
  { const P = piece(-0.57, 2.3, 0, F + 0.19); P.box('concrete', -0.14, 0.14, -0.19, 0, -0.09, 0.09, 0.01); P.model('plantLarge', 0, 0, 0, 0.5); }
  for (const s of [-1, 1]) {
    const vx = X(s * 0.6), vy = F + 1.09;
    kit.add('porcelain', new THREE.CylinderGeometry(0.03, 0.038, 0.16, 16).translate(vx, vy + 0.08, fz - 0.12));
    for (let k = 0; k < 5; k++) { const a = (k - 2) * 0.12, L = 0.28 + (k % 2) * 0.08; kit.add('walnut', new THREE.CylinderGeometry(0.0025, 0.0025, L, 4).translate(0, L / 2, 0).rotateZ(a).translate(vx, vy + 0.14, fz - 0.12)); kit.add('honey', new THREE.SphereGeometry(0.012, 6, 4).translate(vx - Math.sin(a) * L, vy + 0.14 + Math.cos(a) * L, fz - 0.12)); }
  }
  rug(-0.27, 0.57, 1.9, 2.5, 'mat');
  frameArt(-3.95 + 0.075, F + 1.5, 0.6, 0.5, 0.62, 'z');
  dome(-1.4, 0.7, 'living');
  // front bedroom: black metal bed, white bedding, a coral pillow
  bed(-5.125, 1.27, -PI / 2, 1.4, 'bedding', 'blackMetal'); // head 1 cm off the wall
  nightstand(-4.32, 0.26, -PI / 2); // clear of the doorway to the living room
  dresser(-5.55, 2.345, PI, 1.1, 0.82); // back against the front wall, clear of the bed
  rug(-5.9, -4.3, 0.53, 1.8, 'rug'); // stops short of the nightstand
  curtains(-5.7, -4.7, fz, -1, F + 2.42);
  frameArt(-4.0 - 0.075, F + 1.6, 1.0, 0.7, 0.5, 'z', 'art2', -1);
  dome(-5.2, 0.7, 'bed2');
  // back bedroom: teal bedspread, nightstands with lamps either side, as in the reference design
  bed(-3.72, -3.0, -PI / 2, 1.52, 'teal', 'none', 'pillowB', F + 0.012); // no headboard, as in the reference design; the divan stands on the rug
  { const P = piece(-2.95, -4.0, 0); P.model('nightstand', 0, 0, 0, 0.46); lamp(P, 0, 0, 0.567); P.block(-0.25, 0.25, -0.22, 0.22); }
  { const P = piece(-2.95, -2.0, 0); P.model('nightstand', 0, 0, 0, 0.46); lamp(P, 0, 0, 0.567); P.block(-0.25, 0.25, -0.22, 0.22); }
  // the two bedside lamps glow: a small warm point light inside each shade
  LIGHTS.push({ key: 'bed3', kind: 'lamp', x: -2.95, y: F + 0.9, z: -4.0 }, { key: 'bed3', kind: 'lamp', x: -2.95, y: F + 0.9, z: -2.0 });
  dresser(-5.6, zb + T + 0.27, 0, 1.0);
  rug(-5.6, -3.4, -4.1, -1.8);
  frameArt(-2.6 - 0.075, F + 1.42, -3.0, 0.6, 0.46, 'z', 'art3', -1); // size and height off the reference design
  dome(-4.4, -2.8, 'bed3');
  // dining room: walnut table for six, spindle chairs, a honey-pine armoire, sheer curtains
  table(-0.5, -2.9, 0, 1.8, 0.95);
  for (const x of [-1.05, 0.05]) { chair(x, -3.6, 0); chair(x, -2.2, PI); }
  chair(-1.62, -2.9, PI / 2); chair(0.62, -2.9, -PI / 2);
  rug(-1.86, 1.0, -4.2, -1.6); // clear of the armoire
  { const P = piece(-2.6 + 0.06 + 0.32, -3.9, PI / 2);
    P.box('honey', -0.48, 0.48, 0.05, 1.95, -0.29, 0.29, 0.02);
    P.box('honey', -0.45, 0.45, 0, 0.06, -0.26, 0.26, 0.01); // plinth: the armoire stands on the floor
    P.box('honey', -0.5, 0.5, 1.93, 2.0, -0.31, 0.31, 0.02);
    for (const [y0, y1] of [[0.1, 0.62], [0.68, 1.88]]) for (const sx of [-1, 1]) P.box('honey', sx > 0 ? 0.01 : -0.45, sx > 0 ? 0.45 : -0.01, y0, y1, 0.29, 0.31, 0.008);
    for (const sx of [-1, 1]) P.cyl('brass', sx * 0.05, 0.322, 0.012, 0.012, 1.18, 1.2, 10);
    P.block(-0.5, 0.5, -0.31, 0.33); }
  curtains(-0.3, 0.7, zb + T, 1, F + 2.42);
  frameArt(-2.6 + 0.075, F + 1.55, -2.35, 0.32, 0.26, 'z', 'art'); frameArt(-2.6 + 0.075, F + 1.55, -1.85, 0.32, 0.26, 'z', 'art2');
  dome(-0.5, -2.9, 'dining');
  // kitchen: cream shaker cabinets, yellow counters with the rounded peninsula end, stainless fridge, the breakfast nook
  const kb = zb + T;
  // shaker door (ported from the Booking Desk kitchen r4 fronts()): 4 mm reveal, flat centre panel, raised stiles and
  // rails, chrome bar pull. axis 'z': door plane z = f spanning x a..b; axis 'x': plane x = f spanning z a..b; s = front sign.
  const shaker = (axis, s, f, a, b, y0, y1, pu, py) => {
    const fr = Math.min(0.07, (b - a) * 0.16);
    const slab = (u0, u1, v0, v1, d0, d1) => axis === 'z' ? rbSpan(u0, u1, v0, v1, f + s * d0, f + s * d1, 0.004) : rbSpan(f + s * d0, f + s * d1, v0, v1, u0, u1, 0.004);
    kit.add('cabinet', slab(a, b, y0, y1, 0, 0.016));
    kit.add('cabinet', slab(a, a + fr, y0, y1, 0.016, 0.027)); kit.add('cabinet', slab(b - fr, b, y0, y1, 0.016, 0.027));
    kit.add('cabinet', slab(a + fr, b - fr, y1 - fr, y1, 0.016, 0.027)); kit.add('cabinet', slab(a + fr, b - fr, y0, y0 + fr, 0.016, 0.027));
    const g = new THREE.CylinderGeometry(0.006, 0.006, 0.11, 8);
    kit.add('chrome', axis === 'z' ? g.translate(pu, py, f + s * 0.045) : g.translate(f + s * 0.045, py, pu));
    for (const dy of [-0.045, 0.045]) kit.add('chrome', axis === 'z' ? boxSpan(pu - 0.004, pu + 0.004, py + dy - 0.004, py + dy + 0.004, f + s * 0.027, f + s * 0.045) : boxSpan(f + s * 0.027, f + s * 0.045, py + dy - 0.004, py + dy + 0.004, pu - 0.004, pu + 0.004));
  };
  // a row of shaker doors across a cabinet face, pulls on the meeting edges (low on uppers, high on bases)
  const doors = (axis, s, f, u0, u1, y0, y1, w = 0.45) => {
    const n = Math.max(1, Math.round((u1 - u0) / w)), dw = (u1 - u0) / n, upper = y0 > F + 1;
    for (let i = 0; i < n; i++) {
      const a = u0 + i * dw + 0.002, b = a + dw - 0.004;
      shaker(axis, s, f, a, b, y0, y1, i % 2 ? a + 0.04 : b - 0.04, upper ? y0 + 0.1 : y1 - 0.1);
    }
  };
  const run = (x0, x1, z0, z1, front, ohAt) => { // front: '+z' | '-z' | '+x' | '-x'
    kit.add('cabinet', rbSpan(x0, x1, F + 0.09, F + 0.88, z0, z1, 0.008));
    kit.add('firebox', boxSpan(x0 + 0.05, x1 - 0.05, F, F + 0.09, z0 + 0.05, z1 - 0.05));
    // 2 cm overhang on the front and open ends, none at the back (it would run into the wall)
    const oh = ohAt || { '+z': [0.02, 0.02, 0, 0.02], '-z': [0.02, 0.02, 0.02, 0], '+x': [0, 0.02, 0.02, 0.02], '-x': [0.02, 0, 0.02, 0.02] }[front];
    kit.add('counter', rbSpan(x0 - oh[0], x1 + oh[1], F + 0.88, F + 0.92, z0 - oh[2], z1 + oh[3], 0.012));
    block(x0, x1, z0, z1);
    const ax = front[1], s = front[0] === '+' ? 1 : -1, f = ax === 'z' ? (s > 0 ? z1 : z0) : (s > 0 ? x1 : x0);
    const along = ax === 'z' ? [x0, x1] : [z0, z1];
    doors(ax, s, f, along[0], along[1], F + 0.1, F + 0.66, 0.5);
    // drawer row: slab fronts with a horizontal bar pull
    const n = Math.max(1, Math.round((along[1] - along[0]) / 0.5)), dw = (along[1] - along[0]) / n;
    for (let i = 0; i < n; i++) {
      const a = along[0] + i * dw + 0.003, b = a + dw - 0.006, m = (a + b) / 2, y = F + 0.77;
      if (ax === 'z') { kit.add('cabinet', rbSpan(a, b, F + 0.68, F + 0.86, f, f + s * 0.02, 0.005)); kit.add('chrome', new THREE.CylinderGeometry(0.006, 0.006, 0.12, 8).rotateZ(PI / 2).translate(m, y, f + s * 0.04)); }
      else { kit.add('cabinet', rbSpan(f, f + s * 0.02, F + 0.68, F + 0.86, a, b, 0.005)); kit.add('chrome', new THREE.CylinderGeometry(0.006, 0.006, 0.12, 8).rotateX(PI / 2).translate(f + s * 0.04, y, m)); }
    }
  };
  grab('counter-L@4.4,-3.9', () => {
  run(3.3, xr - T, kb, kb + 0.62, '+z', [0.02, 0, 0, 0.02]); // no overhang into the east wall
  // sink: brushed steel basin, chrome gooseneck tap
  kit.add('steel', boxSpan(4.25, 4.95, F + 0.905, F + 0.925, kb + 0.12, kb + 0.5));
  kit.add('firebox', boxSpan(4.3, 4.9, F + 0.9, F + 0.926, kb + 0.16, kb + 0.46));
  kit.add('chrome', new THREE.CylinderGeometry(0.014, 0.018, 0.3, 10).translate(4.6, F + 1.07, kb + 0.08));
  kit.add('chrome', new THREE.TorusGeometry(0.09, 0.012, 8, 16, PI).rotateY(PI / 2).translate(4.6, F + 1.22, kb + 0.17));
  // peninsula off the north run, yellow laminate with a round end towards the back door (photo 07 left foreground)
  run(3.4, 4.4, kb + 0.62, kb + 1.24, '+z', [0, 0.02, 0, 0.02]); // round end clear of the back-door swing (HF13)
  kit.add('counter', new THREE.CylinderGeometry(0.33, 0.33, 0.04, 40, 1, false, PI, PI).translate(3.4, F + 0.9, kb + 0.93));
  kit.add('cabinet', new THREE.CylinderGeometry(0.29, 0.29, 0.79, 32, 1, false, PI, PI).translate(3.4, F + 0.485, kb + 0.93));
  });
  grab('counter-wall@4.3,-1.4', () => {
  run(3.42, 5.1, -1.0 - t / 2 - 0.62, -1.0 - t / 2, '-z');
  });
  const ub = -1.0 - t / 2 - 0.34; // front of the south uppers
  grab('uppers@4.3,-1.2', () => {
  kit.add('cabinet', rbSpan(3.42, 5.1, F + 1.45, F + 2.2, ub, -1.0 - t / 2, 0.008));
  doors('z', -1, ub, 3.42, 5.1, F + 1.46, F + 2.19);
  });
  grab('uppers@6.0,-4.4', () => {
  kit.add('cabinet', rbSpan(5.5, xr - T, F + 1.45, F + 2.2, kb, kb + 0.34, 0.008));
  doors('z', 1, kb + 0.34, 5.5, xr - T, F + 1.46, F + 2.19);
  });
  // refrigerator (ported from the Booking Desk kitchen r4): brushed stainless bottom-freezer, one full-width door over
  // a freezer drawer, tall bar handle on the open edge, a bar across the drawer; door faces -z (photo 07)
  grab('fridge@3.0,-1.5', () => {
  const x0 = 2.72, x1 = 3.4, zf = -1.0 - t / 2 - 0.72, h = 1.78, w = x1 - x0;
  kit.add('fridge', rbSpan(x0, x1, F, F + h, zf, -1.0 - t / 2 - 0.02, 0.02, 3));
  kit.add('blackMetal', boxSpan(x0 + 0.005, x1 - 0.005, F + h * 0.31 - 0.005, F + h * 0.31 + 0.005, zf - 0.004, zf + 0.004)); // door / drawer gap
  kit.add('blackMetal', boxSpan(x0 + 0.004, x0 + 0.012, F + h * 0.31, F + h - 0.01, zf - 0.004, zf + 0.004)); // hinge-side gap
  const hx = x1 - 0.07;
  kit.add('fridge', rbSpan(hx - 0.011, hx + 0.011, F + h * 0.37, F + h * 0.79, zf - 0.062, zf - 0.038, 0.008));
  for (const yy of [h * 0.4, h * 0.76]) kit.add('fridge', rbSpan(hx - 0.008, hx + 0.008, F + yy - 0.008, F + yy + 0.008, zf - 0.04, zf, 0.004));
  kit.add('fridge', rbSpan(x0 + w * 0.19, x1 - w * 0.19, F + h * 0.27 - 0.011, F + h * 0.27 + 0.011, zf - 0.062, zf - 0.038, 0.008));
  for (const xx of [x0 + w * 0.21, x1 - w * 0.21]) kit.add('fridge', rbSpan(xx - 0.008, xx + 0.008, F + h * 0.27 - 0.008, F + h * 0.27 + 0.008, zf - 0.04, zf, 0.004));
  kit.add('porcelain', boxSpan(3.0, 3.21, F + h * 0.7, F + h * 0.86, zf - 0.004, zf - 0.001)); // a paper note, as in the photo
  });
  block(2.7, 3.42, -1.0 - t / 2 - 0.72, -1.0 - t / 2);
  // west wall (photo, right side): base run with the range, uppers above
  grab('counter-west@1.9,-3.0', () => {
    run(1.66, 2.16, -3.3, -2.55, '+x', [0, 0.02, 0.02, 0.02]);
    kit.add('ceramic', boxSpan(2.183, 2.196, F + 0.12, F + 0.78, -3.17, -2.68)); // oven door glass
    kit.add('chrome', boxSpan(2.2, 2.22, F + 0.7, F + 0.715, -3.13, -2.72));
    kit.add('porcelain', rbSpan(1.68, 2.16, F + 0.92, F + 0.935, -3.2, -2.65, 0.01)); // white enamel range top with coil burners (photo)
    kit.add('blackPlastic', boxSpan(1.68, 1.76, F + 0.935, F + 1.05, -3.2, -2.65)); // control back panel
    for (const [x, z] of [[1.9, -3.05], [2.06, -3.05], [1.9, -2.8], [2.06, -2.8]]) kit.add('blackMetal', new THREE.TorusGeometry(0.07, 0.008, 6, 24).rotateX(PI / 2).translate(x, F + 0.94, z));
  });
  grab('uppers@1.8,-3.0', () => {
    kit.add('cabinet', rbSpan(1.66, 2.0, F + 1.45, F + 2.2, -3.3, -1.2, 0.008)); // runs on to the door casing, as in the photo
    doors('x', 1, 2.0, -3.3, -1.2, F + 1.46, F + 2.19);
  });
  // over the fridge: flush with the south uppers (same front and top), two shaker doors, so it reads as part of the run
  grab('uppers@3.0,-1.3', () => {
    kit.add('cabinet', rbSpan(2.7, 3.42, F + 1.86, F + 2.2, ub, -1.0 - t / 2, 0.008));
    doors('z', -1, ub, 2.7, 3.42, F + 1.87, F + 2.19, 0.36);
  });
  // yellow tile backsplash between counters and uppers on the three run walls
  kit.add('counter', boxSpan(3.42, 5.1, F + 0.92, F + 1.45, -1.0 - t / 2 - 0.01, -1.0 - t / 2));
  kit.add('counter', boxSpan(3.3, xr - T, F + 0.92, F + 1.45, kb, kb + 0.01));
  kit.add('counter', boxSpan(1.6 + t / 2, 1.6 + t / 2 + 0.01, F + 0.92, F + 1.45, -3.3, -2.55));
  grab('cooktop@5.8,-4.3', () => {
  kit.add('ceramic', rbSpan(5.42, 6.18, F + 0.92, F + 0.935, kb + 0.06, kb + 0.58, 0.01));
  for (const [x, z] of [[5.6, kb + 0.18], [6.0, kb + 0.18], [5.6, kb + 0.45], [6.0, kb + 0.45]]) kit.add('steel', new THREE.TorusGeometry(0.08, 0.004, 4, 24).rotateX(PI / 2).translate(x, F + 0.937, z));
  });
  // countertop appliances on the south run (photo 07, Booking Desk r4 'appl'): black microwave by the fridge, red toaster
  // oven, a wire dish rack with plates; fronts face -z
  const ct = F + 0.92;
  grab('microwave@3.8,-1.4', () => {
    kit.add('blackPlastic', rbSpan(3.52, 4.02, ct, ct + 0.29, -1.58, -1.2, 0.015));
    kit.add('screen', rbSpan(3.66, 4.0, ct + 0.04, ct + 0.255, -1.586, -1.58, 0.004));
    kit.add('chrome', rbSpan(3.635, 3.647, ct + 0.05, ct + 0.25, -1.59, -1.58, 0.004));
    for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) kit.add('steel', boxSpan(3.54 + q * 0.026, 3.558 + q * 0.026, ct + 0.19 - r * 0.03, ct + 0.202 - r * 0.03, -1.584, -1.58));
  });
  grab('toaster@4.35,-1.4', () => {
    kit.add('toasterRed', rbSpan(4.13, 4.55, ct + 0.02, ct + 0.25, -1.52, -1.2, 0.02));
    for (const fx of [4.17, 4.51]) for (const fz of [-1.48, -1.24]) kit.add('blackPlastic', new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8).translate(fx, ct + 0.01, fz));
    kit.add('screen', rbSpan(4.24, 4.52, ct + 0.06, ct + 0.2, -1.526, -1.52, 0.004));
    kit.add('chrome', new THREE.CylinderGeometry(0.006, 0.006, 0.24, 8).rotateZ(PI / 2).translate(4.38, ct + 0.22, -1.545));
    for (let i = 0; i < 3; i++) kit.add('blackPlastic', new THREE.CylinderGeometry(0.016, 0.016, 0.014, 14).rotateX(PI / 2).translate(4.18, ct + 0.19 - i * 0.055, -1.527));
  });
  grab('dishrack@4.85,-1.4', () => {
    kit.add('chrome', rbSpan(4.64, 5.06, ct, ct + 0.02, -1.55, -1.2, 0.006));
    for (const zz of [-1.53, -1.22]) for (const yy of [ct + 0.06, ct + 0.12]) kit.add('chrome', new THREE.CylinderGeometry(0.004, 0.004, 0.42, 6).rotateZ(PI / 2).translate(4.85, yy, zz));
    for (const xx of [4.66, 5.04]) for (const zz of [-1.53, -1.22]) kit.add('chrome', new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6).translate(xx, ct + 0.07, zz));
    for (let i = 0; i < 6; i++) kit.add('porcelain', new THREE.CylinderGeometry(0.11, 0.11, 0.012, 28).rotateZ(PI / 2).translate(4.71 + i * 0.06, ct + 0.13, -1.37));
  });
  table(5.85, -3.22, PI / 2, 1.0, 0.75); chair(5.18, -2.97, PI / 2); chair(5.18, -3.47, PI / 2); // both chairs on the west side: 0.9 m walk to the half bath (HF13)
  { const P = piece(4.0, kb + 0.3, 0, F + 0.92); P.model('plantSmall', 0, 0, 0, 0.22); }
  dome(4.6, -2.7, 'kitchen', 70); dome(2.75, -2.75, 'kitchen', 60); LIGHTS.push({ key: 'kitchen', kind: 'fill', x: 2.4, y: F + 2.2, z: -2.6, k: 18, r: 6 }); // two ceiling fixtures: the photo is a bright, sunny kitchen
  // full bath: tiled walk-in shower behind a glass panel, wood vanity with a white top, mirror, toilet
  kit.add('tile', boxSpan(3.55, 4.54, F, C - 0.3, 1.14 - 0.06, 1.14));
  kit.add('tile', boxSpan(4.48, 4.54, F, C - 0.3, 0.2, 1.14));
  kit.add('tile', boxSpan(3.55, 4.54, F, F + 0.08, 0.2, 1.14));
  kit.add('glass', boxSpan(3.55, 3.57, F + 0.08, F + 1.95, 0.2, 1.1));
  kit.add('chrome', boxSpan(3.545, 3.575, F + 0.08, F + 1.95, 0.18, 0.2));
  kit.add('chrome', new THREE.CylinderGeometry(0.06, 0.06, 0.01, 18).translate(4.1, F + 1.95, 0.95));
  block(3.55, 3.6, 0.2, 1.14); block(3.55, 4.54, 1.0, 1.14);
  grab('vanity@3.15,-0.66', () => {
  kit.add('honey', rbSpan(2.75, 3.55, F, F + 0.82, -0.94, -0.4, 0.012)); // stands on the tile
  kit.add('porcelain', rbSpan(2.73, 3.57, F + 0.82, F + 0.86, -0.95, -0.38, 0.012));
  kit.add('chrome', new THREE.CylinderGeometry(0.012, 0.015, 0.18, 10).translate(3.15, F + 0.95, -0.88));
  });
  grab('mirror@3.15,-0.93', () => {
  kit.add('mirror', rbSpan(2.85, 3.45, F + 1.1, F + 1.8, -0.94, -0.925, 0.01));
  });
  block(2.73, 3.57, -0.95, -0.38);
  toilet(4.2, -0.45, -PI / 2);
  dome(3.5, 0.1, 'bath');
  // half bath
  toilet(6.05, 0.75, PI);
  kit.add('porcelain', rbSpan(4.75, 5.15, F + 0.6, F + 0.85, 0.5, 1.0, 0.04, 3));
  kit.add('chrome', new THREE.CylinderGeometry(0.01, 0.012, 0.14, 10).translate(4.8, F + 0.92, 0.75));
  block(4.75, 5.15, 0.5, 1.0);
  // wing bedroom: bank of windows, an exposed beam across the ceiling, white bedding with a blue throw
  { const P = bed(4.4, 1.2 + t / 2 + 1.11, 0, 1.6, 'bedding', 'walnut', 'pillowA'); P.soft('teal', -0.86, 0.86, 0.6, 0.66, 0.55, 1.0, 0.3, 'y', 0.025); }
  nightstand(3.3, 1.55, 0); nightstand(5.5, 1.55, 0);
  kit.add('cedar', rbSpan(wx0 + t / 2, xr - T, C - 0.22, C, 3.0, 3.18, 0.012));
  dresser(1.866, 3.4, PI / 2, 1.2, 1.1, 'honey'); // back 2 mm off the plaster of the wing wall (room face x 1.622)
  sofa(2.75, 4.06, PI, 1.2, 0, ['sofaGrey', 'cushionGrey']); // grey loveseat on the front wall: the sight line from the kitchen (photo 07)
  rug(3.2, 5.6, 2.6, 4.6);
  curtains(3.0, 5.2, wz - T, -1, F + 2.42);
  { const P = piece(6.05, 4.5, 0); P.model('plantLarge', 0, 0, 0, 0.6); P.block(-0.22, 0.22, -0.22, 0.22); }
  dome(4.0, 3.6, 'bed1');
}

// rounded box helpers for the interior (furniture, trim, cabinets)
function RB(w, h, d, r = 0.02, seg = 2) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.max(0.002, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)));
}
function rbSpan(x0, x1, y0, y1, z0, z1, r = 0.012, seg = 2) {
  return RB(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), r, seg).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}
// soft goods: squash one axis toward the edges so cushions, pillows and duvets crown in the middle
function puff(g, w, h, d, k = 0.4, axis = 'y') {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const [a, b] = axis === 'y' ? [x / (w / 2), z / (d / 2)] : axis === 'z' ? [x / (w / 2), y / (h / 2)] : [y / (h / 2), z / (d / 2)];
    const f = Math.max(0, (1 - Math.pow(Math.min(1, Math.abs(a)), 3)) * (1 - Math.pow(Math.min(1, Math.abs(b)), 3)));
    const s = 1 - k + k * Math.sqrt(f);
    p.setXYZ(i, axis === 'x' ? x * s : x, axis === 'y' ? y * s : y, axis === 'z' ? z * s : z);
  }
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const m = mergeVertices(g);
  m.computeVertexNormals();
  return m;
}

// standing height of the floor under (x, z), for the walk-through
export function groundAt(x, z) {
  const { floor, xl, xr, zf, zb, wx0, wz } = D;
  if ((x > xl && x < xr && z > zb && z < zf) || (x > wx0 && x < xr && z >= zf && z < wz)) return floor + 0.02;
  if (x > -0.85 && x < wx0 && z >= zf && z < zf + 1.35) return floor - 0.03;
  if (x > -0.85 && x < wx0 && z >= zf + 1.35 && z < zf + 2.25) return (floor - 0.03) * (1 - (z - zf - 1.35) / 0.9);
  if (x > -1.6 && x < 5.6 && z > zb - 3.8 && z <= zb) return 0.55;
  return 0;
}


// contact-shadow footprints [x0, x1, z0, z1] for the AO decals
export const FOOTPRINTS = [
  [D.xl - 0.5, D.xr + 0.5, D.zb - 0.5, D.zf + 0.6],
  [D.wx0 - 0.4, D.xr + 0.5, D.zf, D.wz + 0.6],
  [-1.9, 5.9, D.zb - 4.1, D.zb],
];

// colours sampled from the reference design (siding, trim, cedar door, roof)
export const BUNGALOW_COLORS = { siding: '#6b93b5', trim: '#f1ead6', sash: '#efe7d2', door: '#a9703f', roof: '#8a8c88' };

// camera framing for the bungalow model
export const BUNGALOW_FRAME = {
  yaw: 0.5, pitch: 0.36,
  look: [-1.2, 1.9, 1.4], rH: 12.4, rV: 7.9,
  lookNarrow: [-0.6, 2.2, 0.6], rHn: 11.0, rVn: 7.6,
  sunTarget: [-0.8, 0, -2], shadow: 24,
};

/**
 * Simple massing for listings that have no detailed model: a gable house sized from the
 * square footage (two storeys above 2,200 sq ft), on a plinth with a lawn, walk, drive and trees.
 */
export function buildMassing(squareFeet = 1600) {
  const kit = new Kit();
  const area = Math.max(700, squareFeet || 1600) * 0.0929;
  const stories = area > 2200 * 0.0929 ? 2 : 1;
  const plan = area / stories;
  const w = Math.min(17, Math.max(8, Math.sqrt(plan * 1.5)));
  const d = Math.min(12, Math.max(6.5, plan / w));
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const fl = 0.45, sh = 2.8, top = fl + stories * sh, pk = 6 / 12, ov = 0.45;
  const apex = top + (d / 2) * pk;
  kit.add('concrete', worldUV(boxSpan(x0 + 0.02, x1 - 0.02, 0, fl, z0 + 0.02, z1 - 0.02)));
  // window rows: evenly spaced along each wall, per storey
  const row = (L, every, skip = []) => {
    const n = Math.max(1, Math.floor(L / every));
    const out = [];
    for (let i = 0; i < n; i++) {
      const u = (L / n) * (i + 0.5);
      if (!skip.some(([a, b]) => u > a && u < b)) out.push(u);
    }
    return out;
  };
  const front = [], back = [], left = [], right = [];
  const door = w * 0.36;
  front.push({ u: door, y: fl, w: 0.95, h: 2.08, type: 'door' });
  for (let s = 0; s < stories; s++) {
    const y = fl + s * sh + 0.8;
    for (const u of row(w, 2.7, s === 0 ? [[door - 1.0, door + 1.0]] : [])) front.push({ u, y, w: 1.15, h: 1.35, units: 1 });
    for (const u of row(w, 3.2)) back.push({ u, y, w: 1.15, h: 1.35 });
    for (const u of row(d, 3.6)) { left.push({ u, y, w: 1.0, h: 1.35 }); right.push({ u, y, w: 1.0, h: 1.35 }); }
  }
  kit.layer = 'shell';
  wall(kit, [x0, z1], [x1, z1], fl, top, front);
  wall(kit, [x1, z0], [x0, z0], fl, top, back);
  wall(kit, [x1, z1], [x1, z0], fl, [[0, top], [d / 2, apex], [d, top]], right);
  wall(kit, [x0, z0], [x0, z1], fl, [[0, top], [d / 2, apex], [d, top]], left);
  for (const [x, z] of [[x0, z1], [x1, z1], [x1, z0], [x0, z0]]) kit.add('trim', boxSpan(x - 0.06, x + 0.06, fl, top, z - 0.06, z + 0.06));
  kit.layer = 'roof';
  const RL = w + ov * 2, run = d / 2 + ov;
  kit.add('roof', slab(V3(x1 + ov, top - ov * pk, z1 + ov), V3(-RL, 0, 0), V3(0, run * pk, -run), 0.15));
  kit.add('roof', slab(V3(x1 + ov, top - ov * pk, z0 - ov), V3(-RL, 0, 0), V3(0, run * pk, run), 0.15));
  kit.add('roof', worldUV(boxSpan(x0 - ov - 0.02, x1 + ov + 0.02, apex + 0.1, apex + 0.24, -0.16, 0.16)));
  for (const x of [x0 - ov - 0.02, x1 + ov + 0.02]) for (const s of [-1, 1]) {
    kit.add('trim', beam([x, apex + 0.06, 0], [x, top - ov * pk - 0.02, s * run], 0.26, 0.05, V3(1, 0, 0)));
  }
  kit.add('trim', boxSpan(x0 - ov, x1 + ov, top - ov * pk - 0.16, top - ov * pk + 0.06, z1 + ov - 0.04, z1 + ov + 0.02));
  kit.add('trim', boxSpan(x0 - ov, x1 + ov, top - ov * pk - 0.16, top - ov * pk + 0.06, z0 - ov - 0.02, z0 - ov + 0.04));
  kit.layer = 'site';
  // entry stoop + steps
  const dx = x0 + door;
  kit.add('concrete', worldUV(boxSpan(dx - 0.9, dx + 0.9, 0, fl - 0.02, z1, z1 + 1.3)));
  kit.add('concrete', worldUV(boxSpan(dx - 0.9, dx + 0.9, 0, fl / 2, z1 + 1.3, z1 + 1.6)));
  // site
  const L = { x0: x0 - 7, x1: x1 + 7, z0: z0 - 12, z1: z1 + 8 };
  const P = { x0: L.x0 - 0.8, x1: L.x1 + 0.8, z0: L.z0 - 0.8, z1: L.z1 + 4.6 };
  const sw0 = L.z1 + 0.4, sw1 = sw0 + 1.5;
  kit.add('plinth', boxSpan(P.x0, P.x1, -0.32, -0.02, P.z0, P.z1));
  kit.add('lawn', worldUV(boxSpan(P.x0 + 0.05, P.x1 - 0.05, -0.02, 0, P.z0 + 0.05, sw1 + 1.1)));
  kit.add('concrete', worldUV(boxSpan(P.x0 + 0.05, P.x1 - 0.05, -0.02, 0.025, sw0, sw1)));
  kit.add('concrete', worldUV(boxSpan(P.x0 + 0.05, P.x1 - 0.05, -0.02, 0.06, sw1 + 1.1, sw1 + 1.25)));
  kit.add('asphalt', worldUV(boxSpan(P.x0 + 0.05, P.x1 - 0.05, -0.08, -0.06, sw1 + 1.25, P.z1 - 0.05)));
  kit.add('plinth', boxSpan(P.x0 + 0.05, P.x1 - 0.05, -0.2, -0.08, sw1 + 1.25, P.z1 - 0.05));
  kit.add('paver', worldUV(boxSpan(dx - 0.6, dx + 0.6, -0.02, 0.03, z1 + 1.6, sw0)));
  kit.add('concrete', worldUV(boxSpan(x1 + 1.2, x1 + 4.2, -0.02, 0.03, z0 + 1, sw1 + 1.1)));
  for (let x = x0 + 0.6; x < x1 - 0.4; x += 0.7) {
    if (Math.abs(x - dx) < 1.2) continue;
    const g = blob(0.38, x * 3.7);
    g.scale(1, 0.85, 0.9).translate(x, 0.32, z1 + 0.55);
    kit.add('hedge', g);
  }
  deciduous(kit, x0 - 3.6, z1 + 4.2, 7.0, 2.4, 17);
  deciduous(kit, x1 + 2.2, z0 - 6.5, 6.4, 2.2, 29);
  fir(kit, x0 - 3.2, z0 - 8.5, 9.0, 4);
  const footprints = [[x0 - 0.6, x1 + 0.6, z0 - 0.6, z1 + 1.6]];
  const r = Math.max(w * 0.5 + 6.5, 11.5);
  const frame = {
    yaw: 0.5, pitch: 0.32,
    look: [0, top * 0.55, 1.2], rH: r, rV: r * 0.62,
    lookNarrow: [0, top * 0.6, 0.6], rHn: r * 0.86, rVn: r * 0.58,
    sunTarget: [0, 0, 0], shadow: Math.max(18, (P.z1 - P.z0) * 0.62),
  };
  return { geos: kit.merged(), footprints, frame, colors: { siding: '#e9e4d8' } };
}
