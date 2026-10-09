// Procedural canvas textures for the bungalow model. No downloads, no licences.
// Greyscale maps are tinted by material.color. UVs are in metres; repeat = 1 / tile size.
import * as THREE from 'three';

function rnd(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function tex(size, draw, { srgb = true, tile = 1 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / tile, 1 / tile);
  t.anisotropy = 8;
  return t;
}
function grain(g, n, amp, seed) {
  const r = rnd(seed);
  const img = g.getImageData(0, 0, n, n);
  for (let i = 0; i < img.data.length; i += 4) {
    const d = (r() - 0.5) * amp;
    img.data[i] += d; img.data[i + 1] += d; img.data[i + 2] += d;
  }
  g.putImageData(img, 0, 0);
}

export function buildTextures(maxAniso = 8) {
  const T = {};
  // narrow lap siding: 1 m tile, 8 courses (125 mm exposure), shadow line under each lap
  T.siding = tex(256, (g, n) => {
    const k = 8, h = n / k;
    for (let i = 0; i < k; i++) {
      const y = i * h;
      const gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.78, '#f2f2f2');
      gr.addColorStop(0.9, '#c9c9c9');
      gr.addColorStop(1, '#9d9d9d');
      g.fillStyle = gr;
      g.fillRect(0, y, n, h);
    }
    grain(g, n, 6, 3);
  }, { tile: 1 });
  // asphalt shingles: 1 m tile, 7 courses, staggered 3-tab, tone variation
  T.shingle = tex(256, (g, n) => {
    const k = 7, h = n / k, tabs = 3, r = rnd(41);
    g.fillStyle = '#202020'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < k; i++) {
      const off = (i % 2) * (n / tabs / 2);
      for (let j = -1; j <= tabs; j++) {
        const l = 150 + r() * 70;
        g.fillStyle = `rgb(${l},${l},${l})`;
        g.fillRect(j * (n / tabs) + off + 1, i * h, n / tabs - 2, h - 3);
      }
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, i * h + h - 3, n, 3);
    }
    grain(g, n, 38, 42);
  }, { tile: 1 });
  // red brick, running bond, 0.9 m tile
  T.brick = tex(256, (g, n) => {
    const rows = 13, h = n / rows, per = 4, r = rnd(53);
    g.fillStyle = '#cfc6ba'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < rows; i++) {
      const off = (i % 2) * (n / per / 2);
      for (let j = -1; j <= per; j++) {
        const l = r();
        g.fillStyle = `hsl(${10 + l * 9}, ${38 + l * 14}%, ${36 + l * 12}%)`;
        g.fillRect(j * (n / per) + off + 1.5, i * h + 1.5, n / per - 3, h - 3);
      }
    }
    grain(g, n, 14, 54);
  }, { tile: 0.9 });
  // dark fieldstone (basalt) wall, 1.2 m tile
  T.stone = tex(256, (g, n) => {
    const r = rnd(61);
    g.fillStyle = '#6d6a64'; g.fillRect(0, 0, n, n);
    for (let k = 0; k < 120; k++) {
      const x = r() * n, y = r() * n, w = 14 + r() * 26, h = 10 + r() * 16, l = 34 + r() * 26;
      for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) {
        g.fillStyle = `rgb(${l},${l - 1},${l - 4})`;
        g.beginPath(); g.ellipse(x + dx, y + dy, w / 2, h / 2, r() * 0.6 - 0.3, 0, 7); g.fill();
      }
    }
    grain(g, n, 18, 62);
  }, { tile: 1.2 });
  // brick pavers (walk), 0.6 m tile, running bond along the walk
  T.paver = tex(256, (g, n) => {
    const rows = 6, per = 3, h = n / rows, r = rnd(71);
    g.fillStyle = '#b7aa9c'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < rows; i++) {
      const off = (i % 2) * (n / per / 2);
      for (let j = -1; j <= per; j++) {
        const l = r();
        g.fillStyle = `hsl(${12 + l * 10}, ${30 + l * 12}%, ${50 + l * 10}%)`;
        g.fillRect(j * (n / per) + off + 2, i * h + 2, n / per - 4, h - 4);
      }
    }
    grain(g, n, 12, 72);
  }, { tile: 0.6 });
  // painted fir porch deck boards, 1 m tile, 11 boards
  T.deck = tex(256, (g, n) => {
    const k = 11, h = n / k, r = rnd(81);
    for (let i = 0; i < k; i++) {
      const l = 200 + r() * 20;
      g.fillStyle = `rgb(${l},${l},${l})`;
      g.fillRect(0, i * h, n, h);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, i * h + h - 2, n, 2);
    }
    grain(g, n, 8, 82);
  }, { tile: 1 });
  // beadboard porch ceiling, 0.5 m tile
  T.bead = tex(128, (g, n) => {
    const k = 6, w = n / k;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < k; i++) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(i * w, 0, 2, n); }
  }, { tile: 0.5 });
  // lawn: soft mottled noise, 3 m tile
  T.lawn = tex(256, (g, n) => {
    const r = rnd(91);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, n, n);
    for (let k = 0; k < 260; k++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '70,90,40' : '255,255,230'},${0.015 + r() * 0.03})`;
      g.beginPath(); g.arc(r() * n, r() * n, 4 + r() * 22, 0, 7); g.fill();
    }
    grain(g, n, 12, 92);
  }, { tile: 3 });
  // concrete, 2 m tile, with control joints
  T.concrete = tex(256, (g, n) => {
    const r = rnd(101);
    g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, n, n);
    for (let k = 0; k < 50; k++) { g.fillStyle = `rgba(120,115,105,${r() * 0.05})`; g.beginPath(); g.arc(r() * n, r() * n, 6 + r() * 30, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, 0, n, 2); g.fillRect(0, 0, 2, n);
    grain(g, n, 12, 102);
  }, { tile: 1.5 });
  // asphalt, 2 m tile
  T.asphalt = tex(256, (g, n) => { g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, n, n); grain(g, n, 40, 111); }, { tile: 2 });
  // fence boards, 1.2 m tile, 8 vertical boards
  T.fence = tex(128, (g, n) => {
    const k = 8, w = n / k, r = rnd(121);
    for (let i = 0; i < k; i++) {
      const l = 215 + r() * 30;
      g.fillStyle = `rgb(${l},${l},${l})`; g.fillRect(i * w, 0, w, n);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(i * w, 0, 1.5, n);
    }
    grain(g, n, 10, 122);
  }, { tile: 1.2 });
  for (const t of Object.values(T)) t.anisotropy = maxAniso;
  return T;
}

// soft contact shadow (AO) for the base of the house: radial-ish box falloff, alpha only
export function contactTexture() {
  const n = 128, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = Math.abs(x / (n - 1) - 0.5) * 2, v = Math.abs(y / (n - 1) - 0.5) * 2;
    const d = Math.max(u, v);
    const a = d < 0.72 ? 1 : Math.max(0, 1 - (d - 0.72) / 0.28);
    const i = (y * n + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
    img.data[i + 3] = Math.round(a * a * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  return t;
}
