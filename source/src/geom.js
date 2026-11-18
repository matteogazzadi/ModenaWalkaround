// ---------------------------------------------------------------------------
// Geometry builder: everything in the city is made of quads pushed into one big
// indexed mesh. A vertex is 17 floats:
//   position(3) normal(3) uv(2) tint(3) material+ao(2) params(4)
// uv is in metres on the surface, so the procedural materials in the shader keep
// the same scale everywhere. Normals only need to be right up to their sign: the
// shader turns every normal towards the viewer, so quad winding never matters.
// ---------------------------------------------------------------------------
const STRIDE = 17;

// materials (must match the M_* constants in the shader)
const M = {
  PLAST: 0, WIN: 1, SHOP: 2, STONE: 3, MARB: 4, BRICK: 5, TILE: 6, LEAD: 7, COB: 8, SLAB: 9,
  DARK: 10, WOOD: 11, ROSE: 12, CLOCK: 13, METAL: 14, LAMP: 15, PORF: 16, BIRD: 17, RELIEF: 18, GLASS: 19, FUR: 20, BLOB: 21,
};

class Mesh {
  constructor() { this.v = new Float32Array(STRIDE * 65536); this.i = new Uint32Array(98304); this.nv = 0; this.ni = 0; }
  grow() {
    if ((this.nv + 8) * STRIDE > this.v.length) { const n = new Float32Array(this.v.length * 2); n.set(this.v); this.v = n; }
    if (this.ni + 12 > this.i.length) { const n = new Uint32Array(this.i.length * 2); n.set(this.i); this.i = n; }
  }
  vert(x, y, z, nx, ny, nz, u, w, S) {
    const v = this.v, o = this.nv * STRIDE, c = S.c, p = S.p;
    v[o] = x; v[o + 1] = y; v[o + 2] = z; v[o + 3] = nx; v[o + 4] = ny; v[o + 5] = nz;
    v[o + 6] = u + (S.du || 0); v[o + 7] = w + (S.dv || 0);
    v[o + 8] = c[0]; v[o + 9] = c[1]; v[o + 10] = c[2]; v[o + 11] = S.m; v[o + 12] = S.ao ?? 1;
    v[o + 13] = p[0]; v[o + 14] = p[1]; v[o + 15] = p[2]; v[o + 16] = p[3];
    return this.nv++;
  }
  // a, b, c, d: corners [x,y,z] in order around the quad; t: their uvs [u0,v0,u1,v1,u2,v2,u3,v3]
  quad(a, b, c, d, t, S) {
    this.grow();
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = d[0] - a[0], wy = d[1] - a[1], wz = d[2] - a[2];
    if (ux * ux + uy * uy + uz * uz < 1e-10) { ux = c[0] - b[0]; uy = c[1] - b[1]; uz = c[2] - b[2]; }
    if (wx * wx + wy * wy + wz * wz < 1e-10) { wx = c[0] - d[0]; wy = c[1] - d[1]; wz = c[2] - d[2]; }
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const i0 = this.vert(a[0], a[1], a[2], nx, ny, nz, t[0], t[1], S);
    this.vert(b[0], b[1], b[2], nx, ny, nz, t[2], t[3], S);
    this.vert(c[0], c[1], c[2], nx, ny, nz, t[4], t[5], S);
    this.vert(d[0], d[1], d[2], nx, ny, nz, t[6], t[7], S);
    const I = this.i; let k = this.ni;
    I[k++] = i0; I[k++] = i0 + 1; I[k++] = i0 + 2; I[k++] = i0; I[k++] = i0 + 2; I[k++] = i0 + 3; this.ni = k;
  }
  tri(a, b, c, t, S) { this.quad(a, b, c, c, [t[0], t[1], t[2], t[3], t[4], t[5], t[4], t[5]], S); }
}

// surface style: material, tint, ambient occlusion, params (window spacing etc.)
const S_ = (m, c = [1, 1, 1], p = [0, 0, 0, 0], ao = 1) => ({ m, c, p, ao });

// --- frames ----------------------------------------------------------------
// A frame is a vertical wall plane: origin o, outward normal n (horizontal), u axis
// along the wall (to the right of someone looking at it), y up.
const frame = (ox, oz, nx, nz, oy = 0) => ({ o: [ox, oy, oz], n: [nx, nz], u: [nz, -nx] });
const P = (F, u, v, n) => [F.o[0] + u * F.u[0] + n * F.n[0], F.o[1] + v, F.o[2] + u * F.u[1] + n * F.n[1]];

let G; // current mesh
const rect = (F, u0, v0, u1, v1, n, S) => { if (u1 - u0 < 1e-4 || v1 - v0 < 1e-4) return; G.quad(P(F, u0, v0, n), P(F, u1, v0, n), P(F, u1, v1, n), P(F, u0, v1, n), [u0, v0, u1, v0, u1, v1, u0, v1], S); };
// horizontal quad at height v between depths n0..n1
const hrect = (F, u0, u1, n0, n1, v, S) => { if (u1 - u0 < 1e-4 || Math.abs(n1 - n0) < 1e-4) return; G.quad(P(F, u0, v, n0), P(F, u1, v, n0), P(F, u1, v, n1), P(F, u0, v, n1), [u0, n0, u1, n0, u1, n1, u0, n1], S); };
// vertical quad perpendicular to the wall at position u
const jrect = (F, u, v0, v1, n0, n1, S) => { if (v1 - v0 < 1e-4 || Math.abs(n1 - n0) < 1e-4) return; G.quad(P(F, u, v0, n0), P(F, u, v0, n1), P(F, u, v1, n1), P(F, u, v1, n0), [n0, v0, n1, v0, n1, v1, n0, v1], S); };

// box in frame coordinates. faces: bit 1 front(n1) 2 back(n0) 4 left 8 right 16 top 32 bottom
function fbox(F, u0, u1, v0, v1, n0, n1, S, faces = 31, Stop) {
  if (faces & 1) rect(F, u0, v0, u1, v1, n1, S);
  if (faces & 2) rect(F, u0, v0, u1, v1, n0, S);
  if (faces & 4) jrect(F, u0, v0, v1, n0, n1, S);
  if (faces & 8) jrect(F, u1, v0, v1, n0, n1, S);
  if (faces & 16) hrect(F, u0, u1, n0, n1, v1, Stop || S);
  if (faces & 32) hrect(F, u0, u1, n0, n1, v0, Stop || S);
}
// axis-aligned world box
const FS = frame(0, 0, 0, 1);
function box(x0, y0, z0, x1, y1, z1, S, faces = 31, Stop) { fbox(FS, x0, x1, y0, y1, z0, z1, S, faces, Stop); }

// --- walls with arched openings ----------------------------------------------
// A band of wall between heights v0..v1 and along u0..u1 at depth n, with arched
// openings {u (centre), w (width), b (sill), s (spring line)} cut d deep.
// back: style of the surface at the back of each opening (null = see-through).
function arches(F, u0, u1, v0, v1, n, ops, S, o = {}) {
  const d = o.d ?? 0.3, seg = o.seg ?? 8, Sj = o.jamb || S;
  let cu = u0;
  for (const p of ops) {
    const r = p.w / 2, a = p.u - r, b = p.u + r, s = Math.min(p.s, v1 - r);
    rect(F, cu, v0, a, v1, n, S);
    if (p.b > v0) rect(F, a, v0, b, p.b, n, S);
    let px = a, py = s;
    for (let k = 1; k <= seg; k++) {
      const t = Math.PI * (1 - k / seg), x = p.u + r * Math.cos(t), y = s + r * Math.sin(t);
      // spandrel above this arch segment
      if (v1 - Math.max(py, y) > -1e-4) G.quad(P(F, px, py, n), P(F, x, y, n), P(F, x, v1, n), P(F, px, v1, n), [px, py, x, y, x, v1, px, v1], S);
      if (d > 0) G.quad(P(F, px, py, n), P(F, x, y, n), P(F, x, y, n - d), P(F, px, py, n - d), [px, n, x, n, x, n - d, px, n - d], Sj);
      if (o.back) G.quad(P(F, px, py, n - d), P(F, x, y, n - d), P(F, x, s, n - d), P(F, px, s, n - d), [px, py, x, y, x, s, px, s], o.back);
      px = x; py = y;
    }
    if (d > 0) { jrect(F, a, p.b, s, n, n - d, Sj); jrect(F, b, p.b, s, n, n - d, Sj); if (p.b > v0 + 1e-3) hrect(F, a, b, n, n - d, p.b, Sj); }
    if (o.back) rect(F, a, p.b, b, s, n - d, o.back);
    cu = b;
  }
  rect(F, cu, v0, u1, v1, n, S);
}

// a row of openings, evenly spread over u0..u1
function arcRow(u0, u1, count, w, b, s) {
  const out = [], step = (u1 - u0) / count;
  for (let i = 0; i < count; i++) out.push({ u: u0 + step * (i + 0.5), w, b, s });
  return out;
}

// small "hanging arches" frieze (archetti pensili) under a cornice
function frieze(F, u0, u1, v, n, S, w = 0.6) {
  const cnt = Math.max(1, Math.round((u1 - u0) / (w * 1.35)));
  arches(F, u0, u1, v - 0.75, v, n, arcRow(u0, u1, cnt, w, v - 0.75, v - 0.45), S, { d: 0.14, seg: 5, back: S });
  fbox(F, u0, u1, v - 0.02, v + 0.32, n - 0.01, n + 0.28, S, 1 | 4 | 8 | 16 | 32);
}

// --- round things -------------------------------------------------------------
function cyl(x, z, y0, y1, r0, r1, seg, S, caps = false) {
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const L = 2 * Math.PI * Math.max(r0, 0.05);
    G.quad([x + c0 * r0, y0, z + s0 * r0], [x + c1 * r0, y0, z + s1 * r0], [x + c1 * r1, y1, z + s1 * r1], [x + c0 * r1, y1, z + s0 * r1],
      [(k / seg) * L, y0, ((k + 1) / seg) * L, y0, ((k + 1) / seg) * L, y1, (k / seg) * L, y1], S);
    // smooth normals for columns: overwrite the 4 vertex normals radially
    if (seg >= 8) {
      const v = G.v, b = (G.nv - 4) * STRIDE, sl = (r0 - r1) / Math.max(y1 - y0, 1e-3);
      const nn = [[c0, s0], [c1, s1], [c1, s1], [c0, s0]];
      for (let j = 0; j < 4; j++) { const l = Math.hypot(1, sl); v[b + j * STRIDE + 3] = nn[j][0] / l; v[b + j * STRIDE + 4] = sl / l; v[b + j * STRIDE + 5] = nn[j][1] / l; }
    }
    if (caps && r1 > 0) G.tri([x, y1, z], [x + c0 * r1, y1, z + s0 * r1], [x + c1 * r1, y1, z + s1 * r1], [0, 0, c0 * r1, s0 * r1, c1 * r1, s1 * r1], S);
  }
}
// a column with base and capital
function column(x, z, y0, y1, r, S, Scap) {
  box(x - r * 1.35, y0, z - r * 1.35, x + r * 1.35, y0 + r * 0.9, z + r * 1.35, Scap || S);
  cyl(x, z, y0 + r * 0.9, y1 - r * 1.2, r, r * 0.88, 10, S);
  cyl(x, z, y1 - r * 1.2, y1 - r * 0.45, r * 0.9, r * 1.5, 8, Scap || S);
  box(x - r * 1.6, y1 - r * 0.45, z - r * 1.6, x + r * 1.6, y1, z + r * 1.6, Scap || S);
}
// pyramid / cone with `sides` faces, rotated by rot
function pyramid(x, z, y0, y1, r, sides, rot, S) {
  for (let k = 0; k < sides; k++) {
    const a0 = rot + (k / sides) * Math.PI * 2, a1 = rot + ((k + 1) / sides) * Math.PI * 2;
    const p0 = [x + Math.cos(a0) * r, y0, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y0, z + Math.sin(a1) * r];
    const e = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), sl = Math.hypot(y1 - y0, r * Math.cos(Math.PI / sides));
    G.tri(p0, p1, [x, y1, z], [0, 0, e, 0, e / 2, sl], S);
  }
}
// regular prism (octagon drums, etc.) — returns the face frames for decoration
function prismFrames(x, z, r, sides, rot) {
  const out = [];
  for (let k = 0; k < sides; k++) {
    const a0 = rot + (k / sides) * Math.PI * 2, a1 = rot + ((k + 1) / sides) * Math.PI * 2, am = (a0 + a1) / 2;
    const ap = r * Math.cos(Math.PI / sides), half = r * Math.sin(Math.PI / sides);
    out.push({ F: frame(x + Math.cos(am) * ap, z + Math.sin(am) * ap, Math.cos(am), Math.sin(am)), half });
  }
  return out;
}

// --- roofs --------------------------------------------------------------------
// hip roof over an axis-aligned rectangle; eave height y, slope `pitch` (rise/run)
function hipRoof(x0, z0, x1, z1, y, pitch, ov, S) {
  x0 -= ov; z0 -= ov; x1 += ov; z1 += ov;
  const w = x1 - x0, d = z1 - z0, h = (Math.min(w, d) / 2) * pitch, yy = y - ov * pitch, top = yy + h;
  const sl = Math.hypot(h, Math.min(w, d) / 2);
  if (w >= d) {
    const r0 = x0 + d / 2, r1 = x1 - d / 2, zm = (z0 + z1) / 2;
    G.quad([x0, yy, z0], [x1, yy, z0], [r1, top, zm], [r0, top, zm], [0, 0, w, 0, w - d / 2, sl, d / 2, sl], S);
    G.quad([x1, yy, z1], [x0, yy, z1], [r0, top, zm], [r1, top, zm], [0, 0, w, 0, w - d / 2, sl, d / 2, sl], S);
    G.tri([x0, yy, z1], [x0, yy, z0], [r0, top, zm], [0, 0, d, 0, d / 2, sl], S);
    G.tri([x1, yy, z0], [x1, yy, z1], [r1, top, zm], [0, 0, d, 0, d / 2, sl], S);
  } else {
    const r0 = z0 + w / 2, r1 = z1 - w / 2, xm = (x0 + x1) / 2;
    G.quad([x0, yy, z1], [x0, yy, z0], [xm, top, r0], [xm, top, r1], [0, 0, d, 0, d - w / 2, sl, w / 2, sl], S);
    G.quad([x1, yy, z0], [x1, yy, z1], [xm, top, r1], [xm, top, r0], [0, 0, d, 0, d - w / 2, sl, w / 2, sl], S);
    G.tri([x0, yy, z0], [x1, yy, z0], [xm, top, r0], [0, 0, w, 0, w / 2, sl], S);
    G.tri([x1, yy, z1], [x0, yy, z1], [xm, top, r1], [0, 0, w, 0, w / 2, sl], S);
  }
  // underside of the eaves, slightly darker
  const Su = { ...S, m: M.WOOD, c: [0.42, 0.3, 0.22], ao: 0.6 };
  G.quad([x0, yy, z0], [x1, yy, z0], [x1 - ov, y, z0 + ov], [x0 + ov, y, z0 + ov], [0, 0, w, 0, w, ov, 0, ov], Su);
  G.quad([x1, yy, z1], [x0, yy, z1], [x0 + ov, y, z1 - ov], [x1 - ov, y, z1 - ov], [0, 0, w, 0, w, ov, 0, ov], Su);
  G.quad([x0, yy, z1], [x0, yy, z0], [x0 + ov, y, z0 + ov], [x0 + ov, y, z1 - ov], [0, 0, d, 0, d, ov, 0, ov], Su);
  G.quad([x1, yy, z0], [x1, yy, z1], [x1 - ov, y, z1 - ov], [x1 - ov, y, z0 + ov], [0, 0, d, 0, d, ov, 0, ov], Su);
  return top;
}
