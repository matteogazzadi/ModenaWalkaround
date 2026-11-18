// ---------------------------------------------------------------------------
// The city. Metres, x = east, z = south, y = up. The Duomo's west front is at
// x = -33, its apses at x = 28..33; Piazza Grande opens south of it, the
// Ghirlandina rises at its north-east corner.
// A free reconstruction: the landmarks are modelled with care, the blocks around
// them follow the real street pattern only roughly.
// ---------------------------------------------------------------------------
const COL = [];     // collision boxes [x0, z0, x1, z1]
const LAMPS = [];   // night lights [x, y, z]
const FOOT = [];    // footprints for the ambient-occlusion map [x0, z0, x1, z1, height]
const solid = (x0, z0, x1, z1) => COL.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);

let rnd = mulberry(7);
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (a) => a[(rnd() * a.length) | 0];

// plaster colours of the old town (sRGB)
const PLASTER = [
  [0.86, 0.66, 0.38], [0.78, 0.45, 0.3], [0.88, 0.62, 0.5], [0.9, 0.8, 0.62], [0.87, 0.58, 0.34],
  [0.7, 0.36, 0.26], [0.92, 0.78, 0.5], [0.83, 0.55, 0.42], [0.93, 0.85, 0.7], [0.8, 0.52, 0.32],
];

// ---- an ordinary town house ---------------------------------------------------
// side bit masks: 1 north (z0), 2 east (x1), 4 south (z1), 8 west (x0)
function sideFrame(s, x0, z0, x1, z1) {
  if (s === 1) return { F: frame(0, z0, 0, -1), a: -x1, b: -x0 };
  if (s === 2) return { F: frame(x1, 0, 1, 0), a: -z1, b: -z0 };
  if (s === 4) return { F: frame(0, z1, 0, 1), a: x0, b: x1 };
  return { F: frame(x0, 0, -1, 0), a: z0, b: z1 };
}

function house(x0, z0, x1, z1, o) {
  const floors = o.floors, flH = o.flH || 3.3, por = o.portico || 0, streets = o.streets;
  const gh = por ? 4.4 : 4.0, top = gh + floors * flH, H = top + 0.7, col = o.col || pick(PLASTER);
  const pd = 3.9, t = 0.6;
  const shutter = rnd(), cellW = 2.6 + rnd() * 0.9, winW = 1.0 + rnd() * 0.3, seed = rnd() * 100;
  FOOT.push([x0, z0, x1, z1, H]);
  // ground floor footprint, pulled back behind the portico
  let gx0 = x0, gz0 = z0, gx1 = x1, gz1 = z1;
  if (por & 1) gz0 += pd; if (por & 2) gx1 -= pd; if (por & 4) gz1 -= pd; if (por & 8) gx0 += pd;
  for (const s of [1, 2, 4, 8]) {
    const { F, a, b } = sideFrame(s, x0, z0, x1, z1), len = b - a;
    const onStreet = streets & s, isPor = por & s;
    const cnt = Math.max(1, Math.round(len / cellW)), cw = len / cnt;
    const Sw = { m: onStreet ? M.WIN : M.PLAST, c: col, p: [cw, winW, flH, seed + s + shutter * 0.5], du: -a };
    const Sp = { m: M.PLAST, c: col, p: [0, 0, 0, 0], du: -a };
    const Sg = { m: M.SHOP, c: col, p: [cw, 0, gh, seed + s], du: -a };
    // upper floors, attic band and cornice
    rect(F, a, gh, b, top, 0, Sw);
    rect(F, a, top, b, H, 0, Sp);
    if (onStreet) {
      fbox(F, a, b, H - 0.38, H - 0.05, 0, 0.32, { ...Sp, c: [col[0] * 1.08, col[1] * 1.08, col[2] * 1.08] }, 1 | 16 | 32 | 4 | 8);
      fbox(F, a, b, gh - 0.25, gh, 0, 0.1, { ...Sp, c: [col[0] * 1.06, col[1] * 1.06, col[2] * 1.06] }, 1 | 16 | 32 | 4 | 8);
    }
    if (isPor) {
      // portico: a row of arches carrying the upper floors
      const bays = Math.max(1, Math.round(len / 3.9)), bw = len / bays, w = bw - 0.75;
      const ops = arcRow(a, b, bays, w, 0, gh - 0.4 - w / 2);
      const Sa = { ...Sp, ao: 0.95 };
      arches(F, a, b, 0, gh, 0, ops, Sa, { d: t, seg: 8, jamb: { ...Sa, ao: 0.8 } });
      arches(F, a, b, 0, gh, -t, ops, { ...Sa, ao: 0.7 }, { d: 0, seg: 8 });
      hrect(F, a, b, -t, -pd, gh - 0.02, { m: M.PLAST, c: col, p: [0, 0, 0, 0], ao: 0.55 });
      hrect(F, a, b, 0, -pd, 0.03, { m: M.PORF, c: [1, 1, 1], p: [0, 0, 0, 0], ao: 0.7 });
      rect(F, a, 0, b, gh, -pd, { ...Sg, ao: 0.6 });
      for (const p of ops) {
        const u0 = p.u - p.w / 2, A = P(F, Math.max(a, u0 - 0.75), 0, 0), B = P(F, u0, 0, -t);
        solid(A[0], A[2], B[0], B[2]);
      }
      { const A = P(F, b - 0.38, 0, 0), B = P(F, b, 0, -t); solid(A[0], A[2], B[0], B[2]); }
      for (let i = 1; i < bays; i += 3) LAMPS.push(P(F, ops[i].u, gh - 0.7, -pd / 2));
    } else {
      const g = sideFrame(s, gx0, gz0, gx1, gz1);
      rect(g.F, g.a, 0, g.b, gh, 0, onStreet ? Sg : Sp);
      if (onStreet && len > 6) for (let u = a + 5 + rnd() * 3; u < b - 3; u += 16) {
        LAMPS.push(P(F, u, 4.6, 0.55));
        const q = P(F, u, 4.6, 0.45);
        box(q[0] - 0.13, q[1] - 0.35, q[2] - 0.13, q[0] + 0.13, q[1] + 0.05, q[2] + 0.13, { m: M.LAMP, c: [1, 0.8, 0.5], p: [0, 0, 0, 0] });
      }
    }
  }
  solid(gx0, gz0, gx1, gz1);
  hipRoof(x0, z0, x1, z1, H, 0.42, 0.55, { m: M.TILE, c: [1, 1, 1], p: [0, 0, 0, rnd()] });
  return H;
}

// ---- a city block cut into houses ---------------------------------------------
function block(x0, z0, x1, z1, por = 0, fl = [3, 5]) {
  const w = x1 - x0, d = z1 - z0, alongX = w >= d;
  const L = alongX ? w : d, D = alongX ? d : w;
  const rows = D > 54 ? 3 : D > 26 ? 2 : 1;
  for (let r = 0; r < rows; r++) {
    const r0 = (D * r) / rows, r1 = (D * (r + 1)) / rows;
    let s = 0;
    while (s < L - 0.1) {
      let e = s + 7 + rnd() * 8;
      if (L - e < 6) e = L;
      const [a0, b0, a1, b1] = alongX ? [x0 + s, z0 + r0, x0 + e, z0 + r1] : [x0 + r0, z0 + s, x0 + r1, z0 + e];
      let streets = 0;
      if (Math.abs(b0 - z0) < 0.01) streets |= 1; if (Math.abs(a1 - x1) < 0.01) streets |= 2;
      if (Math.abs(b1 - z1) < 0.01) streets |= 4; if (Math.abs(a0 - x0) < 0.01) streets |= 8;
      let p = por & streets;
      for (const bit of [4, 1, 8, 2]) if (p & bit) { p = bit; break; }
      house(a0, b0, a1, b1, { floors: fl[0] + ((rnd() * (fl[1] - fl[0] + 1)) | 0), streets, portico: p });
      s = e;
    }
  }
}

// cheap far-away town: boxes with roofs, no detail on the ground floor
function farBlock(x0, z0, x1, z1) {
  const H = 10 + rnd() * 9, col = pick(PLASTER), seed = rnd() * 100;
  for (const s of [1, 2, 4, 8]) {
    const { F, a, b } = sideFrame(s, x0, z0, x1, z1);
    rect(F, a, 0, b, H, 0, { m: M.WIN, c: col, p: [3, 1.1, 3.3, seed + s], du: -a });
  }
  hipRoof(x0, z0, x1, z1, H, 0.42, 0.5, { m: M.TILE, c: [1, 1, 1], p: [0, 0, 0, rnd()] });
}

// ---------------------------------------------------------------------------
// Shared styles of the monuments
const SD = S_(M.STONE, [1, 1, 1]);
const SDr = S_(M.STONE, [1, 1, 1], [0, 0, 0, 0], 0.72); // recessed stone, in the shade of an arch
const SDk = S_(M.DARK, [0.1, 0.09, 0.08], [0, 0, 0, 0], 0.5);
const SM = S_(M.MARB, [0.92, 0.88, 0.8]);
const SR = S_(M.MARB, [0.78, 0.45, 0.4]);   // red Verona marble
const SL = S_(M.LEAD, [1, 1, 1]);
const SW = S_(M.WOOD, [0.45, 0.28, 0.16], [0, 0, 0, 0], 0.7);

// little columns standing between twin openings
function midColumns(F, ops, n, r, S) {
  for (let i = 1; i < ops.length; i++) {
    const a = ops[i - 1], b = ops[i];
    if (b.u - b.w / 2 - (a.u + a.w / 2) > 0.3) continue;
    const u = (a.u + a.w / 2 + b.u - b.w / 2) / 2, p = P(F, u, 0, n);
    column(p[0], p[2], a.b, a.s, r, S);
  }
}
// groups of n openings of width w centred at each of `centres`
function groups(centres, n, w, gap, b, s) {
  const out = [];
  for (const c of centres) for (let i = 0; i < n; i++) out.push({ u: c + (i - (n - 1) / 2) * (w + gap), w, b, s });
  return out;
}
// half-disc filling the top of a recessed arch
function fan(F, cu, s, r, n, S, seg = 10) {
  for (let k = 0; k < seg; k++) {
    const t0 = Math.PI * (k / seg), t1 = Math.PI * ((k + 1) / seg);
    const x0 = cu + r * Math.cos(t0), y0 = s + r * Math.sin(t0), x1 = cu + r * Math.cos(t1), y1 = s + r * Math.sin(t1);
    G.tri(P(F, cu, s, n), P(F, x0, y0, n), P(F, x1, y1, n), [cu, s, x0, y0, x1, y1], S);
  }
}
// a crouching lion (base of the porch columns)
function lion(x, z, dx, dz, S) {
  const ax = Math.abs(dx) > 0.5;
  const L = 0.75, W = 0.32;
  if (ax) { box(x - L, 0, z - W, x + L, 0.75, z + W, S); box(x + dx * L - 0.3 + dx * 0.25, 0.4, z - 0.27, x + dx * L + 0.3 + dx * 0.25, 1.05, z + 0.27, S); }
  else { box(x - W, 0, z - L, x + W, 0.75, z + L, S); box(x - 0.27, 0.4, z + dz * L - 0.3 + dz * 0.25, x + 0.27, 1.05, z + dz * L + 0.3 + dz * 0.25, S); }
  box(x - 0.36, 0.75, z - 0.36, x + 0.36, 1.0, z + 0.36, S);
}
// sloped stone slab along a gable edge (from p to q in frame coords at depth n)
function slopeCornice(F, u0, v0, u1, v1, n, S) {
  const h = 0.35, o = 0.3;
  G.quad(P(F, u0, v0, n + o), P(F, u1, v1, n + o), P(F, u1, v1 + h, n + o), P(F, u0, v0 + h, n + o), [u0, v0, u1, v1, u1, v1 + h, u0, v0 + h], S);
  G.quad(P(F, u0, v0 + h, n), P(F, u1, v1 + h, n), P(F, u1, v1 + h, n + o), P(F, u0, v0 + h, n + o), [u0, 0, u1, 0, u1, o, u0, o], S);
  G.quad(P(F, u0, v0, n), P(F, u1, v1, n), P(F, u1, v1, n + o), P(F, u0, v0, n + o), [u0, 0, u1, 0, u1, o, u0, o], S);
}

// a projecting porch with columns on lions (protiro)
function porch(F, c, depth, colTop, halfW, Scol, Spor, upper) {
  const n = depth, r = 0.27;
  for (const sgn of [-1, 1]) {
    const p = P(F, c + sgn * (halfW - 0.55), 0, n - 0.45);
    lion(p[0], p[2], F.n[0], F.n[1], Spor);
    column(p[0], p[2], 1.0, colTop, r, Scol, Spor);
    const q0 = P(F, c + sgn * (halfW - 0.55) - 0.45, 0, n - 0.9), q1 = P(F, c + sgn * (halfW - 0.55) + 0.45, 0, n);
    solid(q0[0], q0[2], q1[0], q1[2]);
  }
  const top = colTop + 2.4, w = 2 * halfW - 1.6;
  arches(F, c - halfW, c + halfW, colTop, top, n, [{ u: c, w, b: colTop, s: colTop + 0.1 }], Spor, { d: 0.6, seg: 10 });
  arches(F, c - halfW, c + halfW, colTop, top, n - 0.6, [{ u: c, w, b: colTop, s: colTop + 0.1 }], Spor, { d: 0, seg: 10 });
  jrect(F, c - halfW, colTop, top, 0, n, Spor); jrect(F, c + halfW, colTop, top, 0, n, Spor);
  hrect(F, c - w / 2, c + w / 2, 0, n - 0.6, colTop + 0.1 + w / 2, { ...Spor, ao: 0.6 });
  let y = top;
  if (upper) {
    fbox(F, c - halfW - 0.1, c + halfW + 0.1, y, y + 0.35, 0, n + 0.1, Spor);
    y += 0.35;
    for (let i = 0; i < 4; i++) { const p = P(F, c - halfW + 0.45 + (i * (2 * halfW - 0.9)) / 3, 0, n - 0.3); column(p[0], p[2], y, y + 2.0, 0.12, SM); }
    rect(F, c - halfW, y, c + halfW, y + 2.0, 0.02, SDk);
    jrect(F, c - halfW, y, y + 2.0, 0, n, Spor); jrect(F, c + halfW, y, y + 2.0, 0, n, Spor);
    y += 2.0;
    fbox(F, c - halfW - 0.1, c + halfW + 0.1, y, y + 0.3, 0, n + 0.1, Spor);
    y += 0.3;
  }
  // little gable roof
  const hw = halfW + 0.35, rise = hw * 0.5, ny = n + 0.35;
  G.quad(P(F, c - hw, y, 0), P(F, c, y + rise, 0), P(F, c, y + rise, ny), P(F, c - hw, y, ny), [0, 0, hw, 0, hw, ny, 0, ny], SL);
  G.quad(P(F, c + hw, y, 0), P(F, c, y + rise, 0), P(F, c, y + rise, ny), P(F, c + hw, y, ny), [0, 0, hw, 0, hw, ny, 0, ny], SL);
  G.tri(P(F, c - halfW, y, n), P(F, c + halfW, y, n), P(F, c, y + rise - 0.25, n), [c - halfW, y, c + halfW, y, c, y + rise], Spor);
}

// ---------------------------------------------------------------------------
// The Duomo (cathedral of San Geminiano)
const X0 = -33, X1 = 28, ZA = 12.3, ZN = 5.4, HA = 14.2, HN0 = 17.2, HN = 20.4, RIDGE = 25.6;

function flank(F, u0, u1, doors) {
  const bays = 8, bw = (u1 - u0) / bays;
  fbox(F, u0 - 0.3, u1 + 0.3, 0, 0.7, -0.1, 0.3, SD, 1 | 16 | 4 | 8);
  for (let i = 0; i <= bays; i++) { const u = u0 + i * bw; fbox(F, u - 0.5, u + 0.5, 0.7, HA - 0.75, 0, 0.38, SD, 1 | 4 | 8); }
  for (let i = 0; i < bays; i++) {
    const a = u0 + i * bw + 0.5, b = u0 + (i + 1) * bw - 0.5, c = (a + b) / 2, r = (b - a) / 2 - 0.4, s = 10.4;
    // big blind arch
    arches(F, a, b, 0.7, HA - 0.75, 0, [{ u: c, w: 2 * r, b: 0.7, s }], SD, { d: 0.45, seg: 12 });
    fan(F, c, s, r, -0.45, SDr, 12);
    // gallery inside it
    const g = groups([c], 3, 0.95, 0.06, 8.15, 9.85);
    arches(F, c - r, c + r, 7.9, s, -0.45, g, SDr, { d: 0.9, seg: 6, back: SDk, jamb: SD });
    midColumns(F, g, -0.9, 0.09, SM);
    const door = doors[i];
    if (door) {
      const ops = [{ u: c, w: door.w, b: 0.7, s: door.s }];
      arches(F, c - r, c + r, 0.7, 7.9, -0.45, ops, SDr, { d: 1.1, seg: 10, back: SW, jamb: SD });
      // stepped jamb ring
      arches(F, c - door.w / 2 - 0.45, c + door.w / 2 + 0.45, door.s - 0.2, door.s + door.w / 2 + 0.45, -0.25, [{ u: c, w: door.w + 0.4, b: door.s - 0.2, s: door.s }], SD, { d: 0.2, seg: 10 });
      if (door.porch) porch(F, c, door.porch, door.colTop, door.w / 2 + 1.25, door.Scol || SR, door.Spor || SD, false);
      const q = P(F, c, 0, 0.6); LAMPS.push([q[0], 3.5, q[2]]);
    } else {
      arches(F, c - r, c + r, 0.7, 7.9, -0.45, [{ u: c, w: 0.75, b: 4.4, s: 6.6 }], SDr, { d: 0.55, seg: 6, back: SDk, jamb: SD });
    }
    // clerestory window of this bay is done by `clerestory`
  }
  frieze(F, u0 - 0.3, u1 + 0.3, HA, 0, SD);
}

function clerestory(F, u0, u1) {
  const bays = 8, bw = (u1 - u0) / bays, ops = [];
  for (let i = 0; i < bays; i++) ops.push({ u: u0 + (i + 0.5) * bw, w: 0.85, b: HN0 + 0.6, s: HN0 + 1.9 });
  arches(F, u0, u1, HN0 - 0.4, HN - 0.75, 0, ops, SD, { d: 0.6, seg: 6, back: SDk });
  for (let i = 0; i <= bays; i++) { const u = u0 + i * bw; fbox(F, u - 0.35, u + 0.35, HN0 - 0.4, HN - 0.75, 0, 0.25, SD, 1 | 4 | 8); }
  frieze(F, u0, u1, HN, 0, SD, 0.5);
}

function apse(cx, cz, r, seg, H, big) {
  const fr = prismFrames(cx, cz, r, seg * 2, -Math.PI / 2).slice(0, seg);
  for (const { F, half } of fr) {
    fbox(F, -half - 0.02, half + 0.02, 0, 0.7, -0.05, 0.25, SD, 1 | 16);
    const archTop = big ? 8.6 : H - 2.2, w = 2 * half - 0.32;
    arches(F, -half, half, 0.7, archTop, 0, [{ u: 0, w, b: 0.7, s: archTop - w / 2 - 0.15 }], SD, { d: 0.22, seg: 6, back: SD });
    if (big) {
      const g = [{ u: -0.29, w: 0.5, b: 9.4, s: 11.2 }, { u: 0.29, w: 0.5, b: 9.4, s: 11.2 }];
      arches(F, -half, half, archTop, H - 0.75, 0, g, SD, { d: 0.8, seg: 5, back: SDk });
      midColumns(F, g, -0.4, 0.07, SM);
    } else {
      arches(F, -half, half, archTop - 4.6, archTop - 0.01, -0.2, [{ u: 0, w: 0.4, b: archTop - 3.4, s: archTop - 2.3 }], SD, { d: 0.5, seg: 5, back: SDk });
      rect(F, -half, archTop, half, H - 0.75, 0, SD);
    }
    frieze(F, -half - 0.02, half + 0.02, H, 0, SD, 0.42);
    const p = P(F, half, 0, 0.12);
    cyl(p[0], p[2], 0.7, H - 0.8, 0.13, 0.13, 6, SD);
  }
  // half-cone roof
  const R = r + 0.45, top = H + 0.35 + r * 0.42;
  for (let k = 0; k < seg; k++) {
    const a0 = -Math.PI / 2 + (k / seg) * Math.PI, a1 = -Math.PI / 2 + ((k + 1) / seg) * Math.PI;
    G.tri([cx + Math.cos(a0) * R, H + 0.3, cz + Math.sin(a0) * R], [cx + Math.cos(a1) * R, H + 0.3, cz + Math.sin(a1) * R], [cx, top, cz], [0, 0, R * Math.PI / seg, 0, R * Math.PI / seg / 2, R], SL);
  }
  solid(cx, cz - r * 0.8, cx + r, cz + r * 0.8); solid(cx, cz - r, cx + r * 0.6, cz + r);
  return top;
}

function duomo() {
  // ---- flanks
  const FSo = frame(0, ZA, 0, 1), FNo = frame(0, -ZA, 0, -1);
  flank(FSo, X0, X1, {
    1: { w: 2.3, s: 4.3, porch: 2.6, colTop: 4.6, Scol: SM, Spor: SD },      // Porta dei Principi
    5: { w: 2.6, s: 4.7, porch: 3.4, colTop: 5.1, Scol: SR, Spor: SR },      // Porta Regia
  });
  flank(FNo, -X1, -X0, { 6: { w: 2.2, s: 4.2, porch: 2.4, colTop: 4.4, Scol: SM, Spor: SD } }); // Porta della Pescheria
  // external pulpit at the south-east corner
  { const x = 25.6, z = ZA + 0.9; box(x - 0.9, 4.2, z - 0.9, x + 0.9, 5.6, z + 0.9, SR); box(x - 0.5, 3.2, z - 0.5, x + 0.5, 4.2, z + 0.5, SD); pyramid(x, z, 6.6, 7.5, 1.1, 4, Math.PI / 4, SL); for (const dx of [-0.8, 0.8]) column(x + dx, z + 0.8, 5.6, 6.6, 0.07, SM); }

  // aisle roofs (lean-to) and nave
  for (const sg of [-1, 1]) {
    G.quad([X0 - 0.4, HA + 0.3, sg * (ZA + 0.45)], [X1 + 0.4, HA + 0.3, sg * (ZA + 0.45)], [X1 + 0.4, HN0, sg * ZN], [X0 - 0.4, HN0, sg * ZN], [0, 0, 61, 0, 61, 7.6, 0, 7.6], SL);
    clerestory(sg > 0 ? frame(0, ZN, 0, 1) : frame(0, -ZN, 0, -1), sg > 0 ? X0 : -X1, sg > 0 ? X1 : -X0);
    G.quad([X0 - 0.5, HN + 0.3, sg * (ZN + 0.5)], [X1 + 0.5, HN + 0.3, sg * (ZN + 0.5)], [X1 + 0.5, RIDGE - 0.2, 0], [X0 - 0.5, RIDGE - 0.2, 0], [0, 0, 62, 0, 62, 7.5, 0, 7.5], SL);
  }
  // crossing lantern (tiburio) above the presbytery
  { const cx = 17, s = 3.4; for (const fr of prismFrames(cx, 0, s, 8, Math.PI / 8)) { arches(fr.F, -fr.half, fr.half, RIDGE - 2.2, RIDGE + 2.6, 0, [{ u: 0, w: 0.6, b: RIDGE + 0.4, s: RIDGE + 1.6 }], SD, { d: 0.4, seg: 5, back: SDk }); frieze(fr.F, -fr.half, fr.half, RIDGE + 3.0, 0, SD, 0.4); } pyramid(cx, 0, RIDGE + 3.2, RIDGE + 6.2, s + 0.35, 8, Math.PI / 8, SL); }

  // ---- west front
  const FW = frame(X0, 0, -1, 0);
  fbox(FW, -ZA - 0.3, ZA + 0.3, 0, 0.7, -0.1, 0.3, SD, 1 | 16 | 4 | 8);
  // central section: portal, reliefs, gallery
  arches(FW, -ZN, ZN, 0.7, 8.0, 0, [{ u: 0, w: 3.9, b: 0.7, s: 5.8 }], SD, { d: 1.4, seg: 12, back: SW });
  arches(FW, -2.95, 2.95, 5.6, 8.0, 0.18, [{ u: 0, w: 4.5, b: 5.6, s: 5.8 }], SD, { d: 0.18, seg: 12 });
  for (const sg of [-1, 1]) fbox(FW, sg > 0 ? 2.6 : -ZN + 0.8, sg > 0 ? ZN - 0.8 : -2.6, 3.1, 4.3, 0, 0.1, S_(M.RELIEF, [0.95, 0.92, 0.85]), 1 | 4 | 8 | 16 | 32);
  const gc = groups([-3.15, 0, 3.15], 3, 0.82, 0.06, 8.45, 10.25);
  arches(FW, -ZN, ZN, 8.0, HA - 0.75, 0, gc, SD, { d: 0.9, seg: 6, back: SDk });
  midColumns(FW, gc, -0.45, 0.085, SM);
  // side sections
  for (const sg of [-1, 1]) {
    const a = sg > 0 ? ZN : -ZA, b = sg > 0 ? ZA : -ZN, c = (a + b) / 2;
    arches(FW, a, b, 0.7, 8.0, 0, [{ u: c, w: 2.1, b: 0.7, s: 4.1 }], SD, { d: 0.9, seg: 10, back: SW });
    const g = groups([c], 3, 0.8, 0.06, 8.45, 10.2);
    arches(FW, a, b, 8.0, HA - 0.75, 0, g, SD, { d: 0.9, seg: 6, back: SDk });
    frieze(FW, a, b, HA, 0, SD, 0.55);
    midColumns(FW, g, -0.45, 0.085, SM);
    G.tri(P(FW, a, HA, 0), P(FW, b, HA, 0), P(FW, sg > 0 ? a : b, HN0, 0), [a, HA, b, HA, sg > 0 ? a : b, HN0], SD);
    slopeCornice(FW, sg > 0 ? ZA + 0.4 : -ZA - 0.4, HA - 0.1, sg > 0 ? ZN : -ZN, HN0 + 0.1, 0, SD);
    fbox(FW, sg > 0 ? ZA - 1.1 : -ZA, sg > 0 ? ZA : -ZA + 1.1, 0.7, HA, 0, 0.55, SD, 1 | 4 | 8 | 16);
  }
  // upper central band with the rose window, then the gable
  rect(FW, -ZN, HA, ZN, HN, 0, SD);
  frieze(FW, -ZN, ZN, HA, 0.0, SD, 0.55);
  const RC = 17.35, RR = 2.35;
  { const c0 = P(FW, -RR - 0.1, RC - RR - 0.1, 0.05), c1 = P(FW, RR + 0.1, RC + RR + 0.1, 0.05); G.quad(c0, [c0[0], c0[1], c1[2]], c1, [c0[0], c1[1], c0[2]], [-1.04, -1.04, 1.04, -1.04, 1.04, 1.04, -1.04, 1.04], S_(M.ROSE, [0.95, 0.9, 0.8])); }
  for (let k = 0; k < 24; k++) {
    const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2;
    const ring = (rr, a, n) => P(FW, Math.cos(a) * rr, RC + Math.sin(a) * rr, n);
    G.quad(ring(RR, a0, 0.4), ring(RR, a1, 0.4), ring(RR + 0.45, a1, 0.4), ring(RR + 0.45, a0, 0.4), [0, 0, 0.6, 0, 0.6, 0.45, 0, 0.45], SM);
    G.quad(ring(RR, a0, 0.05), ring(RR, a1, 0.05), ring(RR, a1, 0.4), ring(RR, a0, 0.4), [0, 0, 0.6, 0, 0.6, 0.35, 0, 0.35], SM);
    G.quad(ring(RR + 0.45, a0, 0), ring(RR + 0.45, a1, 0), ring(RR + 0.45, a1, 0.4), ring(RR + 0.45, a0, 0.4), [0, 0, 0.6, 0, 0.6, 0.4, 0, 0.4], SM);
  }
  G.tri(P(FW, -ZN, HN, 0), P(FW, ZN, HN, 0), P(FW, 0, RIDGE + 0.4, 0), [-ZN, HN, ZN, HN, 0, RIDGE], SD);
  for (const sg of [-1, 1]) slopeCornice(FW, sg * (ZN + 0.5), HN - 0.1, 0, RIDGE + 0.5, 0, SD);
  pyramid(X0 - 0.3, 0, RIDGE + 0.8, RIDGE + 2.6, 0.35, 4, Math.PI / 4, SM);
  // pilasters and the two little towers on top of them
  for (const sg of [-1, 1]) {
    fbox(FW, sg * ZN - 0.8, sg * ZN + 0.8, 0.7, HN, 0, 0.9, SD, 1 | 4 | 8 | 16);
    const p = P(FW, sg * ZN, 0, 0.35);
    for (const fr of prismFrames(p[0], p[2], 0.95, 4, Math.PI / 4)) arches(fr.F, -fr.half, fr.half, HN, HN + 2.4, 0, [{ u: 0, w: 0.6, b: HN + 0.5, s: HN + 1.6 }], SD, { d: 0.25, seg: 5, back: SDk });
    pyramid(p[0], p[2], HN + 2.4, HN + 4.6, 0.95, 4, Math.PI / 4, SD);
  }
  // the porch with the lions in front of the main door
  porch(FW, 0, 3.5, 5.2, 2.9, SM, SD, true);
  { const p = P(FW, -6, 4.5, 0.5); LAMPS.push(p); const q = P(FW, 6, 4.5, 0.5); LAMPS.push(q); }

  // ---- east end: wall, gables, apses
  const FE = frame(X1, 0, 1, 0);
  rect(FE, -ZA, 0, ZA, HA, 0, SD);
  frieze(FE, -ZA, ZA, HA, 0, SD);
  for (const sg of [-1, 1]) G.tri(P(FE, sg * ZA, HA, 0), P(FE, sg * ZN, HA, 0), P(FE, sg * ZN, HN0, 0), [sg * ZA, HA, sg * ZN, HA, sg * ZN, HN0], SD);
  rect(FE, -ZN, HA, ZN, HN, 0, SD);
  arches(FE, -ZN, ZN, HN0 - 1, HN - 0.8, 0.01, [{ u: 0, w: 1.0, b: HN0, s: HN0 + 1.5 }], SD, { d: 0.5, seg: 6, back: SDk });
  G.tri(P(FE, -ZN, HN, 0), P(FE, ZN, HN, 0), P(FE, 0, RIDGE + 0.4, 0), [-ZN, HN, ZN, HN, 0, RIDGE], SD);
  for (const sg of [-1, 1]) slopeCornice(FE, sg * (ZN + 0.5), HN - 0.1, 0, RIDGE + 0.5, 0, SD);
  apse(X1, 0, 4.8, 9, HA - 0.6, true);
  apse(X1, -8.75, 2.9, 5, 9.8, false);
  apse(X1, 8.75, 2.9, 5, 9.8, false);
  solid(X0, -ZA, X1, ZA);
  FOOT.push([X0, -ZA, X1 + 4, ZA, 18]);
}

// ---------------------------------------------------------------------------
// The Ghirlandina tower
const TX = 24, TZ = -20.2, TH = 5.45;
function ghirlandina() {
  const faces = prismFrames(TX, TZ, TH * Math.SQRT2, 4, Math.PI / 4);
  const levels = [1.2, 11, 19.5, 27.5, 35.5, 43, 50];
  for (const { F, half } of faces) {
    fbox(F, -half - 0.25, half + 0.25, 0, 1.2, -0.1, 0.35, SD, 1 | 16 | 4 | 8);
    for (let i = 0; i < levels.length - 1; i++) {
      const v0 = levels[i], v1 = levels[i + 1] - 0.8, a = -half + 1.05, b = half - 1.05;
      fbox(F, -half - 0.36, a, v0, v1, 0, 0.36, SD, 1 | 4 | 8);
      fbox(F, b, half, v0, v1, 0, 0.36, SD, 1 | 4);
      let ops, o = { d: 0.35, seg: 8, back: SD };
      if (i === 0) ops = arcRow(a, b, 2, 3.7, v0, v1 - 2.5);
      else if (i === 1) ops = arcRow(a, b, 3, 2.45, v0, v1 - 1.6);
      else if (i === 2) { ops = groups([-2.15, 2.15], 2, 1.0, 0.08, v0 + 1.9, v1 - 1.3); o = { d: 1.4, seg: 8, back: SDk }; }
      else if (i === 3) { ops = groups([-2.2, 2.2], 3, 0.82, 0.07, v0 + 1.6, v1 - 1.1); o = { d: 1.4, seg: 6, back: SDk }; }
      else if (i === 4) { ops = groups([0], 4, 1.55, 0.08, v0 + 1.2, v1 - 1.5); o = { d: 1.6, seg: 8, back: SDk }; }
      else { ops = groups([-2.15, 2.15], 2, 1.0, 0.08, v0 + 1.5, v1 - 1.2); o = { d: 1.4, seg: 8, back: SDk }; }
      arches(F, a, b, v0, v1, 0, ops, SD, o);
      if (i >= 2) midColumns(F, ops, -0.6, i === 4 ? 0.12 : 0.09, SM);
      if (i < 2) for (const p of ops) arches(F, p.u - p.w / 2, p.u + p.w / 2, p.b + 2, p.s - 0.01, -0.35, [{ u: p.u, w: 0.4, b: p.s - 3.2, s: p.s - 1.2 }], SD, { d: 0.5, seg: 4, back: SDk });
      frieze(F, -half - 0.3, half, levels[i + 1], 0.0, SD, 0.55);
    }
  }
  // terrace, balustrade and corner pinnacles
  const top = 50.35;
  box(TX - TH - 0.45, 50, TZ - TH - 0.45, TX + TH + 0.45, top, TZ + TH + 0.45, SM);
  for (const { F, half } of prismFrames(TX, TZ, (TH + 0.3) * Math.SQRT2, 4, Math.PI / 4)) {
    for (let u = -half + 0.25; u < half; u += 0.42) { const p = P(F, u, 0, -0.1); box(p[0] - 0.07, top, p[2] - 0.07, p[0] + 0.07, top + 0.85, p[2] + 0.07, SM, 4 | 8 | 1 | 2); }
    fbox(F, -half, half, top + 0.85, top + 1.05, -0.25, 0.05, SM);
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = TX + sx * (TH - 0.8), z = TZ + sz * (TH - 0.8);
    for (const fr of prismFrames(x, z, 0.95, 4, Math.PI / 4)) arches(fr.F, -fr.half, fr.half, top, top + 3.6, 0, [{ u: 0, w: 0.55, b: top + 1.0, s: top + 2.5 }], SD, { d: 0.3, seg: 5, back: SDk });
    pyramid(x, z, top + 3.6, top + 7.2, 0.95, 4, Math.PI / 4, SD);
    cyl(x, z, top + 7.2, top + 7.7, 0.08, 0.02, 4, SM);
  }
  // octagonal drums
  const d1 = prismFrames(TX, TZ, 4.75, 8, Math.PI / 8);
  for (const { F, half } of d1) {
    const g = [{ u: -0.58, w: 1.05, b: top + 1.4, s: top + 5.6 }, { u: 0.58, w: 1.05, b: top + 1.4, s: top + 5.6 }];
    arches(F, -half, half, top, top + 7.7, 0, g, SD, { d: 1.0, seg: 6, back: SDk });
    midColumns(F, g, -0.5, 0.1, SM);
    fbox(F, -half - 0.05, half + 0.05, top + 7.7, top + 8.1, -0.05, 0.3, SM);
  }
  const y2 = top + 8.1;
  for (const { F, half } of prismFrames(TX, TZ, 5.05, 8, Math.PI / 8)) {
    for (let u = -half + 0.2; u < half; u += 0.4) { const p = P(F, u, 0, -0.1); box(p[0] - 0.06, y2, p[2] - 0.06, p[0] + 0.06, y2 + 0.8, p[2] + 0.06, SM, 15); }
    fbox(F, -half, half, y2 + 0.8, y2 + 0.98, -0.2, 0.04, SM);
  }
  const d2 = prismFrames(TX, TZ, 4.15, 8, Math.PI / 8);
  for (const { F, half } of d2) {
    arches(F, -half, half, y2, y2 + 4.6, 0, [{ u: 0, w: 1.0, b: y2 + 0.9, s: y2 + 3.0 }], SD, { d: 0.8, seg: 6, back: SDk });
    frieze(F, -half - 0.02, half + 0.02, y2 + 5.2, 0, SD, 0.4);
    rect(F, -half, y2 + 4.6, half, y2 + 4.45, 0, SD);
  }
  hrect(FS, TX - 4.2, TX + 4.2, TZ - 4.2, TZ + 4.2, y2 + 5.5, SD);
  // the spire
  pyramid(TX, TZ, y2 + 5.4, 84.6, 4.35, 8, Math.PI / 8, SD);
  cyl(TX, TZ, 84.4, 85.0, 0.3, 0.42, 8, S_(M.METAL, [0.75, 0.6, 0.35]));
  cyl(TX, TZ, 85.0, 85.4, 0.42, 0.15, 8, S_(M.METAL, [0.75, 0.6, 0.35]));
  cyl(TX, TZ, 85.4, 87.1, 0.05, 0.03, 4, S_(M.METAL, [0.4, 0.38, 0.35]));
  box(TX - 0.5, 86.3, TZ - 0.03, TX + 0.5, 86.6, TZ + 0.03, S_(M.METAL, [0.4, 0.38, 0.35]));
  solid(TX - TH, TZ - TH, TX + TH, TZ + TH);
  FOOT.push([TX - TH, TZ - TH, TX + TH, TZ + TH, 60]);
  // the two arches joining the tower to the cathedral
  for (const x of [TX - TH + 0.6, TX + TH - 1.6]) {
    const Fa = frame(x + 1.0, 0, 1, 0), Fb = frame(x, 0, -1, 0), z0 = TZ + TH, z1 = -ZA;
    arches(Fa, -z1, -z0, 0, 13.2, 0, [{ u: (-z1 - z0) / 2, w: z1 - z0, b: 0, s: 10.2 }], SD, { d: 1.0, seg: 8 });
    arches(Fb, z0, z1, 0, 13.2, 0, [{ u: (z0 + z1) / 2, w: z1 - z0, b: 0, s: 10.2 }], SD, { d: 0, seg: 8 });
    box(x, 13.2, z0, x + 1.0, 13.5, z1, SD, 16);
  }
}

// ---------------------------------------------------------------------------
// Palazzo Comunale with the clock tower, the Preda Ringadora and the Bonissima
function palazzo() {
  const col = [0.84, 0.56, 0.4];
  rnd = mulberry(91);
  house(40, 27.5, 66, 62, { floors: 3, flH: 4.0, streets: 8 | 4 | 2, portico: 8, col });
  house(47.5, 20, 66, 27.5, { floors: 3, flH: 4.0, streets: 1 | 2, portico: 1, col });
  // clock tower
  const x0 = 40, x1 = 47.5, z0 = 20, z1 = 27.5, H = 33, c = [0.86, 0.62, 0.44];
  const Sp = { m: M.PLAST, c, p: [0, 0, 0, 0] };
  for (const s of [1, 2, 4, 8]) {
    const { F, a, b } = sideFrame(s, x0, z0, x1, z1), m = (a + b) / 2;
    arches(F, a, b, 0, 21, 0, [{ u: m, w: 2.4, b: 0, s: 2.6 }], Sp, { d: 0.8, seg: 10, back: SW });
    rect(F, a, 21, b, H, 0, Sp);
    for (let v = 6; v < 21; v += 5) arches(F, m - 0.8, m + 0.8, v, v + 2.6, 0.01, [{ u: m, w: 0.9, b: v + 0.3, s: v + 1.7 }], Sp, { d: 0.25, seg: 6, back: SDk });
    fbox(F, a - 0.1, b + 0.1, 21, 21.35, 0, 0.25, { ...Sp, c: [0.92, 0.8, 0.66] });
    fbox(F, a - 0.15, b + 0.15, H - 0.4, H, 0, 0.4, { ...Sp, c: [0.92, 0.8, 0.66] });
    // clock face
    const S = { m: M.CLOCK, c: [1, 1, 1], p: [0, 0, 0, 0] }, cv = 26.5, R = 1.9;
    G.quad(P(F, m - R, cv - R, 0.06), P(F, m + R, cv - R, 0.06), P(F, m + R, cv + R, 0.06), P(F, m - R, cv + R, 0.06), [-1, -1, 1, -1, 1, 1, -1, 1], S);
    // open bell cell
    arches(F, a + 0.6, b - 0.6, H, H + 4, -0.6, [{ u: m, w: 3.4, b: H + 0.4, s: H + 2.0 }], Sp, { d: 0.6, seg: 8, back: SDk });
    fbox(F, a + 0.4, b - 0.4, H + 4, H + 4.4, -0.6, 0.0, { ...Sp, c: [0.92, 0.8, 0.66] });
  }
  box(x0 + 0.6, H, z0 + 0.6, x1 - 0.6, H + 0.01, z1 - 0.6, Sp, 16);
  for (const fr of prismFrames((x0 + x1) / 2, (z0 + z1) / 2, 2.3, 8, Math.PI / 8)) rect(fr.F, -fr.half, H + 4.4, fr.half, H + 5.8, 0, Sp);
  pyramid((x0 + x1) / 2, (z0 + z1) / 2, H + 5.8, H + 8.6, 2.6, 8, Math.PI / 8, S_(M.METAL, [0.45, 0.55, 0.5]));
  cyl((x0 + x1) / 2, (z0 + z1) / 2, H + 8.6, H + 10, 0.05, 0.02, 4, S_(M.METAL, [0.3, 0.3, 0.3]));
  hipRoof(x0 + 0.2, z0 + 0.2, x1 - 0.2, z1 - 0.2, H + 4.4, 0.0, 0.0, S_(M.TILE)); // flat cap under the octagon
  solid(x0, z0, x1, z1);
  FOOT.push([x0, z0, x1, z1, 30]);
  // Preda Ringadora: the long marble block in front of the portico
  box(36.2, 0, 37.9, 37.2, 0.72, 41.8, S_(M.MARB, [0.85, 0.62, 0.55]));
  solid(36.2, 37.9, 37.2, 41.8);
  // the Bonissima on her bracket at the corner of the palace
  { const x = 39.75, z = 27.8; box(x - 0.45, 4.3, z - 0.45, x + 0.45, 4.6, z + 0.45, SM); cyl(x, z, 4.6, 5.7, 0.32, 0.2, 8, SM); cyl(x, z, 5.7, 6.0, 0.2, 0.12, 6, SM); cyl(x, z, 6.0, 6.25, 0.14, 0.14, 6, SM); cyl(x, z, 6.25, 6.32, 0.14, 0.0, 6, SM); }
}

// street lamp on a pole
function lampPost(x, z, h = 4.2) {
  const S = S_(M.METAL, [0.12, 0.12, 0.12]);
  cyl(x, z, 0, 0.5, 0.14, 0.1, 6, S); cyl(x, z, 0.5, h, 0.06, 0.05, 6, S);
  box(x - 0.2, h, z - 0.2, x + 0.2, h + 0.55, z + 0.2, S_(M.LAMP, [1, 0.8, 0.5]));
  pyramid(x, z, h + 0.55, h + 0.85, 0.3, 4, Math.PI / 4, S);
  LAMPS.push([x, h + 0.3, z]); solid(x - 0.15, z - 0.15, x + 0.15, z + 0.15);
}

// ---------------------------------------------------------------------------
// Areas, labels and viewpoints
const ZONES = [
  ['Portico del Palazzo Comunale', 40, 27.5, 44, 62], ['Piazza Grande', -33, ZA, 40, 52], ['Sagrato del Duomo', -48, -20, -33, 20], ['Via Lanfranco', -48, -34, 35, -ZA],
  ['Piazza della Torre', 33, -34, 74, 20], ['Via Castellaro', 26, 52, 34, 74], ['Piazza XX Settembre', 34, 62, 74, 74],
  ['Via Emilia Centro', -160, 74, 160, 86], ['Corso Duomo', -56, -160, -48, 74],
];
const PAVED = [[-33, ZA, 40, 52], [-48, -20, -33, 20], [33, -34, 74, 20], [34, 52, 74, 74], [26, 52, 40, 62]];
const VIEWS = [
  { p: [-51.5, 1.7, 0], yaw: Math.PI / 2, pitch: 0.2, name: 'La facciata del Duomo' },
  { p: [8, 1.7, 47], yaw: 0.2, pitch: 0.16, name: 'Piazza Grande' },
  { p: [6, 1.7, -30], yaw: 2.08, pitch: 0.62, name: 'La Ghirlandina' },
  { p: [64, 1.7, 2], yaw: -1.42, pitch: 0.22, name: 'Le absidi da Piazza Torre' },
  { p: [-2, 1.7, 72.2], yaw: Math.PI / 2, pitch: 0.02, name: 'Sotto i portici di Via Emilia' },
  { p: [-70, 62, 105], yaw: 0.62, pitch: -0.3, name: 'Dall\'alto', fly: true },
];

function buildCity() {
  G = new Mesh();
  // ground: cobbles everywhere, stone slabs in the squares
  // (in tiles: one huge quad loses depth precision against the paving laid on top of it)
  for (let x = -420; x < 420; x += 20) for (let z = -420; z < 420; z += 20) {
    if (PAVED.some(([x0, z0, x1, z1]) => x >= x0 && x + 20 <= x1 && z >= z0 && z + 20 <= z1)) continue;
    hrect(FS, x, x + 20, z, z + 20, 0, S_(M.COB, [1, 1, 1]));
  }
  for (const [x0, z0, x1, z1] of PAVED) for (let x = x0; x < x1; x += 20) for (let z = z0; z < z1; z += 20) hrect(FS, x, Math.min(x + 20, x1), z, Math.min(z + 20, z1), 0.03, S_(M.SLAB, [1, 1, 1]));
  // a raised stone walkway around the cathedral
  box(X0 - 1.2, 0, -ZA - 1.2, X1 + 6, 0.08, ZA + 1.2, S_(M.SLAB, [1.05, 1.0, 0.95]), 16);

  duomo();
  ghirlandina();
  palazzo();
  rnd = mulberry(1234);

  // blocks around the monuments. B(x0,z0,x1,z1, portico sides)
  const B = (x0, z0, x1, z1, por = 0, fl) => block(x0, z0, x1, z1, por, fl);
  B(-48, 20, -33, 52, 8 | 2);              // between Corso Duomo and Piazza Grande
  B(-48, 52, 26, 63, 1, [3, 4]);           // south side of Piazza Grande, porticoes on the square...
  B(-48, 63, 26, 74, 4, [3, 5]);           // ...and on Via Emilia
  B(-48, -62, 10, -34, 4, [3, 4]);         // archbishop's palace block on Via Lanfranco
  B(18, -62, 66, -34, 4, [3, 5]);
  B(-150, -54, -56, 6, 2); B(-150, 14, -56, 74, 2 | 4);
  B(74, -54, 150, 6, 8); B(74, 14, 150, 74, 8 | 4);
  B(-48, -150, 10, -70); B(18, -150, 66, -70); B(-150, -150, -56, -62); B(74, -150, 150, -62);
  B(-150, 86, -56, 150, 1); B(-48, 86, 26, 150, 1); B(34, 86, 66, 150, 1); B(74, 86, 150, 150, 1);
  // far town, beyond the walkable area
  for (let x = -420; x < 420; x += 34) for (let z = -420; z < 420; z += 34) {
    if (x > -160 && x < 160 && z > -160 && z < 160) continue;
    const g = 6 + rnd() * 3; farBlock(x + g / 2, z + g / 2, x + 34 - g / 2, z + 34 - g / 2);
  }
  // street lamps in the squares
  for (const [x, z] of [[-10, 50], [15, 50], [-30, 30], [36, 15], [50, -28], [70, -10], [-36, -16], [-36, 16], [60, 12]]) lampPost(x, z);
  // invisible walls at the edge of the walkable area
  solid(-170, -170, 170, -160); solid(-170, 160, 170, 170); solid(-170, -170, -160, 170); solid(160, -170, 170, 170);
  return G;
}
