// Procedural sprite atlas for the FX system. 4x4 cells of 256px, RGBA8, straight (non-premultiplied) alpha.
// Cell ids are exported as C. No external assets: everything is computed from noise + analytic shapes.
import * as THREE from 'three';

export const C = {GLOW:0, SMOKE_A:1, SMOKE_B:2, SMOKE_C:3, SPARK:4, RING:5, FLAME_A:6, FLAME_B:7, DEBRIS:8, FLARE:9,
  SCORCH:10, SPLAT_A:11, HEX:12, BLOB:13, PLUS:14, SPLAT_B:15};
export const CELLS = 4, CELL_PX = 256;

// ---- noise ----
function h2(x, y, s) { let n = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; }
const sm = t => t * t * (3 - 2 * t);
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x, y, s, oct = 5) { let v = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; } return v / n; }
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

const out = [1, 1, 1, 0];
const gens = {};

gens[C.GLOW] = (u, v) => {
  const r2 = u * u + v * v, r = Math.sqrt(r2);
  const a = (Math.exp(-r2 * 5.5) * 0.9 + 0.55 * Math.exp(-r2 * 45)) * sstep(1, 0.78, r);
  out[0] = out[1] = out[2] = 1; out[3] = clamp(a);
};
const smoke = seed => (u, v) => {
  const r = Math.sqrt(u * u + v * v);
  const wx = fbm(u * 1.1 + seed, v * 1.1 + 3, seed, 2) - 0.5, wy = fbm(u * 1.1 + 9, v * 1.1 + seed, seed + 5, 2) - 0.5;
  const n = fbm(u * 1.9 + wx * 0.7 + seed, v * 1.9 + wy * 0.7, seed + 11, 4);
  const n2 = fbm((u - 0.07) * 1.9 + wx * 0.7 + seed, (v - 0.07) * 1.9 + wy * 0.7, seed + 11, 4);
  const mask = sstep(1.0, 0.1, r + (n - 0.5) * 0.7);
  const shade = clamp(0.62 + (n2 - n) * 4.5 + (0.45 - r) * 0.25);
  const g = 0.4 + 0.6 * shade;
  out[0] = out[1] = out[2] = g; out[3] = clamp(Math.pow(mask, 1.25) * (0.55 + n * 0.7));
};
gens[C.SMOKE_A] = smoke(3); gens[C.SMOKE_B] = smoke(41); gens[C.SMOKE_C] = smoke(97);
gens[C.SPARK] = (u, v) => {
  const au = Math.abs(u);
  const taper = Math.pow(Math.max(0, 1 - au), 1.3);
  // head (u>0) is hotter than the tail
  const head = 0.65 + 0.35 * clamp(u * 1.5 + 0.5);
  const core = taper * Math.exp(-v * v * 380 * (1 + au * 2.5)) * head;
  const halo = 0.22 * Math.exp(-(u * u * 1.6 + v * v * 28));
  out[0] = out[1] = out[2] = 1; out[3] = clamp((core * 1.4 + halo) * sstep(1, 0.9, au));
};
gens[C.RING] = (u, v) => {
  const r = Math.sqrt(u * u + v * v), ang = Math.atan2(v, u);
  const nz = 0.75 + 0.25 * vnoise(ang * 3 + 20, r * 4, 7) + 0.1 * vnoise(ang * 11, 3, 9);
  const d = r - 0.74;
  const band = Math.exp(-d * d * (d < 0 ? 160 : 520));
  const inner = (r < 0.74 ? 0.35 * sstep(0.1, 0.74, r) * sstep(0.74, 0.62, r + 0.0) : 0) * 0.0;
  const trail = r < 0.74 ? 0.22 * Math.pow(sstep(0.3, 0.74, r), 2.6) : 0;
  out[0] = out[1] = out[2] = 1; out[3] = clamp((band * nz + trail) * sstep(0.98, 0.9, r));
};
const flame = seed => (u, v) => {
  const r = Math.sqrt(u * u + v * v);
  const wx = fbm(u * 2 + seed, v * 2, seed, 3) - 0.5;
  const n = fbm(u * 2.8 + wx * 1.4 + seed, v * 2.8 - wx * 0.8, seed + 3, 5);
  const m = sstep(1, 0.12, r + (n - 0.5) * 0.9);
  const heat = m * (0.55 + 0.9 * n * n);
  out[0] = out[1] = out[2] = clamp(0.55 + heat * 0.6); out[3] = clamp(heat * 1.15);
};
gens[C.FLAME_A] = flame(5); gens[C.FLAME_B] = flame(63);
gens[C.DEBRIS] = (u, v) => {
  const ang = Math.atan2(v, u), r = Math.sqrt(u * u + v * v);
  // jagged polygon
  const R = 0.5 + 0.3 * vnoise(ang * 1.7 + 50, 1, 3) + 0.1 * Math.sin(ang * 5 + 1.3) * vnoise(ang * 4, 2, 4);
  const inside = sstep(R + 0.03, R - 0.03, r);
  // faceted shading: light from upper-left
  const facet = Math.floor((ang + Math.PI) / (Math.PI * 2) * 9);
  const fl = 0.6 + 0.4 * h2(facet, 3, 8);
  const shade = clamp(fl * 0.8 + (-(u + v)) * 0.25 + fbm(u * 6, v * 6, 12, 3) * 0.3 + 0.15);
  out[0] = out[1] = out[2] = shade; out[3] = inside;
};
gens[C.FLARE] = (u, v) => {
  const r2 = u * u + v * v;
  const core = Math.exp(-r2 * 16) * 0.9 + 0.5 * Math.exp(-r2 * 120);
  const sx = Math.exp(-v * v * 1100) * Math.exp(-u * u * 3.2), sy = Math.exp(-u * u * 1100) * Math.exp(-v * v * 3.2);
  const du = (u + v) * 0.7071, dv = (u - v) * 0.7071;
  const dg = 0.35 * (Math.exp(-dv * dv * 1400) * Math.exp(-du * du * 7) + Math.exp(-du * du * 1400) * Math.exp(-dv * dv * 7));
  const r = Math.sqrt(r2);
  out[0] = out[1] = out[2] = 1; out[3] = clamp((core + 0.85 * (sx + sy) + dg) * sstep(1, 0.75, r));
};
gens[C.SCORCH] = (u, v) => {
  const r = Math.sqrt(u * u + v * v), ang = Math.atan2(v, u);
  const n = fbm(u * 3 + 11, v * 3, 21, 5);
  const ray = vnoise(ang * 5.5 + 3, 1.7, 5) * vnoise(ang * 13, 4, 6);
  const rad = r - ray * 0.28 * sstep(0.1, 0.6, r);
  const core = sstep(0.95, 0.22, rad + (n - 0.5) * 0.55);
  const ridge = 1 - Math.abs(fbm(u * 5 + 2, v * 5 + 8, 33, 4) * 2 - 1);   // cracks
  const heat = Math.pow(ridge, 5) * sstep(0.85, 0.15, r) * (0.4 + n);
  out[0] = clamp(heat); out[1] = clamp(sstep(0.7, 0.0, r)); out[2] = n; out[3] = clamp(core * (0.5 + 0.5 * n + 0.2));
};
const splat = seed => (u, v) => {
  const r = Math.sqrt(u * u + v * v), ang = Math.atan2(v, u);
  const wob = fbm(u * 2.5 + seed, v * 2.5, seed, 4) - 0.5;
  let d = r - (0.4 + wob * 0.3 + 0.08 * vnoise(ang * 3 + seed, 2, seed + 1));
  // radial arms
  const arm = Math.pow(vnoise(ang * 2.3 + seed * 3, 0.5, seed + 2), 2) * 0.4 * sstep(0.1, 0.5, r);
  d -= arm * sstep(0.95, 0.35, r) * 0.45;
  let m = sstep(0.03, -0.03, d);
  // droplets
  for (let i = 0; i < 11; i++) {
    const a = h2(i, 1, seed) * Math.PI * 2, rr = 0.5 + h2(i, 2, seed) * 0.42, s = 0.03 + h2(i, 3, seed) * 0.06;
    const dx = u - Math.cos(a) * rr, dy = v - Math.sin(a) * rr;
    m = Math.max(m, sstep(s, s * 0.6, Math.sqrt(dx * dx + dy * dy)) * 0);
    m = Math.max(m, 1 - sstep(s * 0.7, s, Math.sqrt(dx * dx + dy * dy)));
  }
  let thick = clamp(0.5 - d * 2.4) * (0.6 + 0.4 * fbm(u * 6, v * 6, seed + 9, 3));
  thick = Math.max(thick, m * 0.55);
  out[0] = clamp(thick); out[1] = clamp(thick); out[2] = clamp(thick); out[3] = clamp(m * sstep(1, 0.88, r));
};
gens[C.SPLAT_A] = splat(7); gens[C.SPLAT_B] = splat(71);
gens[C.HEX] = (u, v) => {
  const ax = Math.abs(u), ay = Math.abs(v);
  const d = Math.max(ay, ax * 0.866 + ay * 0.5) / 0.86;   // 1 at boundary
  const edge = Math.exp(-(d - 1) * (d - 1) * 900) + 0.35 * Math.exp(-(d - 1) * (d - 1) * 60);
  const fill = d < 1 ? (0.1 + 0.1 * d * d) * (0.6 + 0.4 * Math.sin(v * 70)) : 0;
  const d2 = Math.max(ay, ax * 0.866 + ay * 0.5) / 0.5;
  const inner = Math.exp(-(d2 - 1) * (d2 - 1) * 1500) * 0.55;
  out[0] = out[1] = out[2] = 1; out[3] = clamp(edge + fill + inner) * (d < 1.25 ? 1 : 0);
};
gens[C.BLOB] = (u, v) => {
  const r = Math.sqrt(u * u + v * v);
  const hx = u + 0.32, hy = v + 0.32, hl = Math.exp(-(hx * hx + hy * hy) * 14);
  out[0] = out[1] = out[2] = clamp(0.4 + 0.6 * (1 - r) + hl * 0.9); out[3] = sstep(0.95, 0.8, r);
};
gens[C.PLUS] = (u, v) => {
  const ax = Math.abs(u), ay = Math.abs(v);
  const arm = Math.min(Math.max(ax, ay * 0 + ax) , 1);
  const a = Math.max(sstep(0.3, 0.1, ay) * sstep(0.85, 0.6, ax), sstep(0.3, 0.1, ax) * sstep(0.85, 0.6, ay));
  const glow = 0.35 * Math.exp(-(u * u + v * v) * 5);
  out[0] = out[1] = out[2] = 1; out[3] = clamp(a * 0.95 + glow);
};

export function buildAtlas() {
  const W = CELLS * CELL_PX, data = new Uint8Array(W * W * 4);
  for (let c = 0; c < 16; c++) {
    const g = gens[c]; if (!g) continue;
    const cx = (c % CELLS) * CELL_PX, cy = Math.floor(c / CELLS) * CELL_PX;
    for (let y = 0; y < CELL_PX; y++) for (let x = 0; x < CELL_PX; x++) {
      const u = ((x + 0.5) / CELL_PX) * 2 - 1, v = ((y + 0.5) / CELL_PX) * 2 - 1;
      out[0] = out[1] = out[2] = 1; out[3] = 0; g(u, v);
      const i = ((cy + y) * W + cx + x) * 4;
      // hard zero near the cell border so mip bleeding never shows seams
      const edge = sstep(1, 0.96, Math.max(Math.abs(u), Math.abs(v)));
      data[i] = out[0] * 255; data[i + 1] = out[1] * 255; data[i + 2] = out[2] * 255; data[i + 3] = out[3] * edge * 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, W, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4; tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

// Debug: dump atlas to a canvas (used by the showcase script).
export function atlasToCanvas(tex) {
  const W = CELLS * CELL_PX, cv = document.createElement('canvas'); cv.width = cv.height = W;
  const g = cv.getContext('2d'), id = g.createImageData(W, W); id.data.set(tex.image.data); g.putImageData(id, 0, 0); return cv;
}
