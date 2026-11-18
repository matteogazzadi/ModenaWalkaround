// ---------------------------------------------------------------------------
// Animals: sparrows hopping on the paving, dogs out for a walk, cats in the
// porticoes and — just one, rare, somewhere — a seal.
// Each animal is a little skeleton of boxes. Every frame the boxes are posed and
// written into one preallocated dynamic mesh (no allocation per frame), plus a
// soft blob shadow under each animal drawn with multiplicative blending.
// ---------------------------------------------------------------------------
const Animals = (() => {
  const AM = new Mesh(), BM = new Mesh();
  let nBox = 0, nBlob = 0;
  const FACES = [0, 1, 0, -1, 1, 1, 1, -1, 2, 1, 2, -1];
  function newBox(col) {
    const S = S_(M.FUR, col), slot = nBox++;
    for (let f = 0; f < 6; f++) AM.quad([0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], S);
    return slot;
  }
  function newBlob() { const slot = nBlob++; BM.quad([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [-1, -1, 1, -1, 1, 1, -1, 1], S_(M.BLOB)); return slot; }
  // write a posed box: centre c, rotation m (3 columns: side, up, forward), half sizes h
  function writeBox(slot, c, m, h) {
    const v = AM.v; let o = slot * 24 * STRIDE;
    for (let f = 0; f < 6; f++) {
      const k = FACES[f * 2], sg = FACES[f * 2 + 1], a = (k + 1) % 3, b = (k + 2) % 3;
      const nx = m[k * 3] * sg, ny = m[k * 3 + 1] * sg, nz = m[k * 3 + 2] * sg;
      const bx = c[0] + nx * h[k], by = c[1] + ny * h[k], bz = c[2] + nz * h[k];
      for (let q = 0; q < 4; q++) {
        const ua = q === 1 || q === 2 ? h[a] : -h[a], ub = q >= 2 ? h[b] : -h[b];
        v[o] = bx + m[a * 3] * ua + m[b * 3] * ub; v[o + 1] = by + m[a * 3 + 1] * ua + m[b * 3 + 1] * ub; v[o + 2] = bz + m[a * 3 + 2] * ua + m[b * 3 + 2] * ub;
        v[o + 3] = nx; v[o + 4] = ny; v[o + 5] = nz; o += STRIDE;
      }
    }
  }
  function writeBlob(slot, x, y, z, r, yaw, len) {
    const v = BM.v, o = slot * 4 * STRIDE, c = Math.cos(yaw), s = Math.sin(yaw);
    const fx = s * len, fz = -c * len, sx = c * r, sz = s * r;
    for (let q = 0; q < 4; q++) { const a = q === 1 || q === 2 ? 1 : -1, b = q >= 2 ? 1 : -1, i = o + q * STRIDE; v[i] = x + sx * a + fx * b; v[i + 1] = y; v[i + 2] = z + sz * a + fz * b; }
  }

  // ---- skeletons: [parent, pivot, centre offset, half size, colour key] (side, up, forward)
  const DOG = [
    [-1, [0, .42, 0], [0, 0, 0], [.13, .12, .3], 'c'],            // 0 body
    [0, [0, .08, .27], [0, .07, .08], [.1, .1, .11], 'c'],         // 1 head
    [1, [0, 0, 0], [0, .03, .23], [.055, .05, .08], 'c'],          // 2 snout
    [1, [0, 0, 0], [0, .065, .31], [.026, .02, .012], 'n'],        // 3 nose
    [1, [-.08, .13, .04], [0, -.03, 0], [.025, .07, .045], 'd'],   // 4 ears
    [1, [.08, .13, .04], [0, -.03, 0], [.025, .07, .045], 'd'],
    [0, [-.08, -.06, .2], [0, -.17, 0], [.04, .17, .04], 'c'],     // 6 legs: FL FR HL HR
    [0, [.08, -.06, .2], [0, -.17, 0], [.04, .17, .04], 'c'],
    [0, [-.08, -.06, -.21], [0, -.17, 0], [.042, .17, .045], 'c'],
    [0, [.08, -.06, -.21], [0, -.17, 0], [.042, .17, .045], 'c'],
    [0, [0, .06, -.29], [0, 0, -.12], [.028, .028, .12], 'c'],     // 10 tail
    [1, [0, 0, 0], [-.05, .11, .11], [.016, .016, .008], 'n'],     // eyes
    [1, [0, 0, 0], [.05, .11, .11], [.016, .016, .008], 'n'],
  ];
  const CAT = [
    [-1, [0, .155, -.13], [0, .04, .14], [.075, .07, .17], 'c'],    // 0 body, pivot at the hips
    [0, [0, .07, .29], [0, .04, .04], [.07, .062, .062], 'c'],      // 1 head
    [1, [-.042, .1, .01], [0, .02, 0], [.022, .035, .012], 'c'],    // 2 ears
    [1, [.042, .1, .01], [0, .02, 0], [.022, .035, .012], 'c'],
    [0, [-.045, -.01, .25], [0, -.075, 0], [.022, .08, .022], 'c'], // 4 front legs
    [0, [.045, -.01, .25], [0, -.075, 0], [.022, .08, .022], 'c'],
    [0, [-.05, -.01, .03], [0, -.07, 0], [.026, .078, .03], 'c'],   // 6 hind legs
    [0, [.05, -.01, .03], [0, -.07, 0], [.026, .078, .03], 'c'],
    [0, [0, .07, -.02], [0, 0, -.14], [.017, .017, .14], 'd'],      // 8 tail
    [1, [0, 0, 0], [-.03, .055, .062], [.013, .012, .005], 'e'],    // eyes
    [1, [0, 0, 0], [.03, .055, .062], [.013, .012, .005], 'e'],
  ];
  const BIRD = [
    [-1, [0, .055, 0], [0, 0, 0], [.03, .028, .05], 'c'],           // 0 body
    [0, [0, .022, .042], [0, .016, .014], [.023, .022, .023], 'w'],  // 1 head
    [1, [0, 0, 0], [0, .012, .042], [.007, .006, .013], 'y'],       // 2 beak
    [0, [0, .012, -.045], [0, 0, -.032], [.017, .004, .034], 'd'],  // 3 tail
    [0, [-.026, .014, .004], [-.045, 0, 0], [.045, .004, .03], 'd'], // 4 wings
    [0, [.026, .014, .004], [.045, 0, 0], [.045, .004, .03], 'd'],
  ];
  const SEAL = [
    [-1, [0, .17, 0], [0, 0, -.1], [.19, .15, .3], 'c'],            // 0 rear body
    [0, [0, 0, .18], [0, .03, .2], [.2, .16, .22], 'c'],             // 1 front body
    [1, [0, .1, .35], [0, .06, .08], [.12, .11, .12], 'c'],          // 2 head
    [2, [0, 0, 0], [0, .03, .17], [.075, .06, .06], 'w'],           // 3 muzzle
    [2, [0, 0, 0], [0, .065, .235], [.026, .018, .008], 'n'],       // 4 nose
    [2, [0, 0, 0], [-.066, .11, .09], [.022, .024, .012], 'n'],     // 5 eyes
    [2, [0, 0, 0], [.066, .11, .09], [.022, .024, .012], 'n'],
    [1, [-.18, -.12, .12], [-.06, -.02, .04], [.07, .015, .11], 'd'], // 7 front flippers
    [1, [.18, -.12, .12], [.06, -.02, .04], [.07, .015, .11], 'd'],
    [0, [0, -.03, -.38], [0, -.03, -.13], [.11, .08, .15], 'c'],      // 9 tail end
    [9, [0, -.05, -.25], [-.07, 0, -.08], [.07, .015, .1], 'd'],     // 10 hind flippers
    [9, [0, -.05, -.25], [.07, 0, -.08], [.07, .015, .1], 'd'],
  ];

  const list = [];
  function make(def, cols, scale, extra) {
    const a = { def, x: 0, y: 0, z: 0, yaw: 0, parts: [], blob: newBlob(), ...extra };
    for (const [par, piv, off, half, ck] of def) {
      a.parts.push({ par, piv: piv.map((x) => x * scale), off: off.map((x) => x * scale), half: half.map((x) => x * scale), slot: newBox(cols[ck]), rx: 0, ry: 0, rz: 0, M: new Float32Array(9), P: new Float32Array(3) });
    }
    a.scale = scale; list.push(a); return a;
  }

  // pose → world boxes
  const C = new Float32Array(3), R = new Float32Array(9), T = new Float32Array(9), Z = new Float32Array(9), RM = new Float32Array(9);
  function mul3(o, a, b) { for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2]; }
  function rot(o, rx, ry, rz) { // Ry * Rx * Rz, column-major
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    T[0] = cy; T[1] = 0; T[2] = -sy; T[3] = sy * sx; T[4] = cx; T[5] = cy * sx; T[6] = sy * cx; T[7] = -sx; T[8] = cy * cx; // Ry*Rx
    Z[0] = cz; Z[1] = sz; Z[2] = 0; Z[3] = -sz; Z[4] = cz; Z[5] = 0; Z[6] = 0; Z[7] = 0; Z[8] = 1;
    mul3(o, T, Z);
  }
  function pose(a) {
    const c = Math.cos(a.yaw), s = Math.sin(a.yaw);
    RM[0] = c; RM[1] = 0; RM[2] = s; RM[3] = 0; RM[4] = 1; RM[5] = 0; RM[6] = s; RM[7] = 0; RM[8] = -c;
    for (const p of a.parts) {
      const PM = p.par < 0 ? RM : a.parts[p.par].M, PP = p.par < 0 ? null : a.parts[p.par].P;
      const bx = PP ? PP[0] : a.x, by = PP ? PP[1] : a.y, bz = PP ? PP[2] : a.z;
      p.P[0] = bx + PM[0] * p.piv[0] + PM[3] * p.piv[1] + PM[6] * p.piv[2];
      p.P[1] = by + PM[1] * p.piv[0] + PM[4] * p.piv[1] + PM[7] * p.piv[2];
      p.P[2] = bz + PM[2] * p.piv[0] + PM[5] * p.piv[1] + PM[8] * p.piv[2];
      rot(R, p.rx, p.ry, p.rz); mul3(p.M, PM, R);
      const m = p.M;
      C[0] = p.P[0] + m[0] * p.off[0] + m[3] * p.off[1] + m[6] * p.off[2];
      C[1] = p.P[1] + m[1] * p.off[0] + m[4] * p.off[1] + m[7] * p.off[2];
      C[2] = p.P[2] + m[2] * p.off[0] + m[5] * p.off[1] + m[8] * p.off[2];
      writeBox(p.slot, C, m, p.half);
    }
  }

  const groundY = (x, z) => (x > X0 - 1.2 && x < X1 + 6 && z > -ZA - 1.2 && z < ZA + 1.2 ? 0.08 : 0.03);
  const angTo = (a, b) => { let d = b - a; while (d > Math.PI) d -= 6.2832; while (d < -Math.PI) d += 6.2832; return d; };
  const yawOf = (dx, dz) => Math.atan2(dx, -dz);
  rnd = mulberry(4242);

  // ---- dogs walking their rounds
  const DOG_COLS = [
    { c: [0.55, 0.36, 0.2], d: [0.35, 0.22, 0.12] }, { c: [0.12, 0.1, 0.09], d: [0.08, 0.07, 0.06] }, { c: [0.92, 0.88, 0.8], d: [0.6, 0.45, 0.3] },
    { c: [0.82, 0.6, 0.3], d: [0.6, 0.4, 0.2] }, { c: [0.45, 0.45, 0.47], d: [0.25, 0.25, 0.27] }, { c: [0.85, 0.75, 0.55], d: [0.3, 0.2, 0.12] },
  ];
  const PATHS = [
    [[-25, 20], [30, 20], [32, 46], [-26, 46]], [[40, -26], [68, -28], [68, 12], [42, 12]], [[-100, 80], [100, 80]],
    [[-52, -80], [-52, 60]], [[-40, -29.5], [60, -29.5]], [[-44.5, -15], [-38, -15], [-38, 15], [-44.5, 15]],
  ];
  const dogs = PATHS.map((path, i) => {
    let L = 0; const seg = [];
    for (let k = 0; k < path.length; k++) { const a = path[k], b = path[(k + 1) % path.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push(l); L += l; }
    const col = DOG_COLS[i];
    return make(DOG, { ...col, n: [0.05, 0.04, 0.04] }, [0.85, 1.1, 0.75, 1.15, 0.95, 0.7][i], { path, seg, L, s: rnd() * L, sp: 1.1 + rnd() * 0.5, ph: 0, mode: 'walk', timer: 3 + rnd() * 8, wag: 0, barked: 0 });
  });
  function pathAt(d, s, out) {
    s = ((s % d.L) + d.L) % d.L;
    for (let k = 0; k < d.path.length; k++) {
      if (s <= d.seg[k]) { const a = d.path[k], b = d.path[(k + 1) % d.path.length], t = s / d.seg[k]; out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = yawOf(b[0] - a[0], b[1] - a[1]); return; }
      s -= d.seg[k];
    }
  }
  const PA = new Float32Array(3);
  function updateDog(d, dt, t, cam) {
    const pdx = cam.p[0] - d.x, pdz = cam.p[2] - d.z, pd = Math.hypot(pdx, pdz);
    d.timer -= dt;
    if (d.mode !== 'greet' && pd < 4.5 && cam.p[1] < 3 && d.barked <= 0) { d.mode = 'greet'; d.timer = 3 + rnd() * 2; d.barked = 25; if (rnd() < 0.7) audio.bark(1 - pd / 30); }
    d.barked -= dt;
    if (d.timer <= 0) {
      if (d.mode === 'walk') { d.mode = 'sniff'; d.timer = 1.5 + rnd() * 3; }
      else { d.mode = 'walk'; d.timer = 4 + rnd() * 10; }
    }
    const walking = d.mode === 'walk';
    if (walking) d.s += d.sp * dt;
    pathAt(d, d.s, PA);
    d.x = PA[0]; d.z = PA[1];
    const want = d.mode === 'greet' ? yawOf(pdx, pdz) : PA[2];
    d.yaw += angTo(d.yaw, want) * Math.min(1, dt * 4);
    d.y = groundY(d.x, d.z);
    d.ph += dt * (walking ? d.sp * 7.5 / d.scale : 0);
    const sw = walking ? Math.sin(d.ph) * 0.55 : 0, P = d.parts;
    P[6].rx = sw; P[9].rx = sw; P[7].rx = -sw; P[8].rx = -sw;
    P[0].rx = walking ? Math.sin(d.ph * 2) * 0.03 : 0;
    P[1].rx = d.mode === 'sniff' ? 0.75 : d.mode === 'greet' ? -0.25 : 0.05 + Math.sin(d.ph * 2) * 0.05;
    P[1].ry = d.mode === 'sniff' ? Math.sin(t * 2.3) * 0.4 : 0;
    const wagF = d.mode === 'greet' ? 16 : 7;
    P[10].rx = 0.75; P[10].ry = Math.sin(t * wagF + d.s) * (d.mode === 'greet' ? 0.7 : 0.35);
    P[4].rz = 0.15; P[5].rz = -0.15;
    pose(d);
    writeBlob(d.blob, d.x, d.y + 0.012, d.z, 0.2 * d.scale, d.yaw, 0.38 * d.scale);
  }

  // ---- cats
  const CAT_COLS = [
    { c: [0.85, 0.5, 0.22], d: [0.7, 0.35, 0.12] }, { c: [0.1, 0.09, 0.09], d: [0.06, 0.06, 0.06] }, { c: [0.55, 0.55, 0.57], d: [0.4, 0.4, 0.42] },
    { c: [0.93, 0.9, 0.86], d: [0.85, 0.5, 0.25] }, { c: [0.45, 0.35, 0.25], d: [0.25, 0.18, 0.12] }, { c: [0.88, 0.82, 0.74], d: [0.15, 0.12, 0.1] }, { c: [0.75, 0.5, 0.3], d: [0.2, 0.15, 0.1] },
  ];
  const CAT_SPOTS = [
    { x: 42, z: 35, yaw: -1.6, mode: 'sit' }, { x: -37.5, z: 7, yaw: -1.4, mode: 'sleep' }, { x: 13, z: 13.4, yaw: 3.1, mode: 'sit' },
    { x: -20, z: 72.3, yaw: 1.6, mode: 'patrol', bx: -6, bz: 72.3 }, { x: 50, z: -10, yaw: 2.5, mode: 'sleep' },
    { x: -10, z: -13.6, yaw: 0, mode: 'patrol', bx: 8, bz: -13.6 }, { x: 52, z: 65, yaw: 0.4, mode: 'sit' },
  ];
  const cats = CAT_SPOTS.map((sp, i) => {
    const c = make(CAT, { ...CAT_COLS[i], e: [0.55, 0.65, 0.15] }, 1, { ...sp, ax: sp.x, az: sp.z, ph: 0, timer: 5 + rnd() * 8, walking: false, dir: 1 });
    return c;
  });
  function updateCat(c, dt, t, cam) {
    const pdx = cam.p[0] - c.x, pdz = cam.p[2] - c.z, pd = Math.hypot(pdx, pdz), P = c.parts;
    c.timer -= dt;
    if (c.mode === 'patrol' && c.timer <= 0) { c.walking = !c.walking; c.timer = c.walking ? 999 : 5 + rnd() * 8; }
    if (c.walking) {
      const tx = c.dir > 0 ? c.bx : c.ax, tz = c.dir > 0 ? c.bz : c.az, dx = tx - c.x, dz = tz - c.z, l = Math.hypot(dx, dz);
      if (l < 0.1) { c.dir = -c.dir; c.walking = false; c.timer = 4 + rnd() * 8; }
      else { const sp = 0.55; c.x += (dx / l) * sp * dt; c.z += (dz / l) * sp * dt; c.yaw += angTo(c.yaw, yawOf(dx, dz)) * Math.min(1, dt * 5); c.ph += dt * 9; }
    }
    if (pd < 2.2 && cam.p[1] < 3 && !c.meowed) { c.meowed = 1; audio.meow(0.8); } else if (pd > 6) c.meowed = 0;
    const gy = groundY(c.x, c.z); c.y = gy;
    const look = pd < 5 ? Math.max(-1, Math.min(1, angTo(c.yaw, yawOf(pdx, pdz)))) : Math.sin(t * 0.3 + c.ax) * 0.4;
    for (const p of P) { p.rx = 0; p.ry = 0; p.rz = 0; }
    if (c.walking) {
      const sw = Math.sin(c.ph) * 0.5; P[4].rx = sw; P[7].rx = sw; P[5].rx = -sw; P[6].rx = -sw;
      P[8].rx = 0.9; P[8].ry = Math.sin(t * 2) * 0.2; P[1].ry = look * 0.3;
    } else if (c.mode === 'sleep' && pd > 2) {
      c.y -= 0.075; P[0].rz = 0.25; P[4].rx = 1.5; P[5].rx = 1.5; P[6].rx = -1.5; P[7].rx = -1.5;
      P[1].rx = 0.35; P[1].ry = 0.6; P[8].rx = -0.05; P[8].ry = 1.1 + Math.sin(t * 0.5) * 0.05;
      P[0].half[1] = 0.07 * (1 + Math.sin(t * 1.6) * 0.04); // breathing
    } else { // sitting up
      c.y -= 0.075; P[0].rx = -0.62; P[4].rx = 0.62; P[5].rx = 0.62; P[6].rx = 1.9; P[7].rx = 1.9;
      P[1].rx = 0.55; P[1].ry = look; P[8].rx = -0.62; P[8].ry = 0.9 + Math.sin(t * 1.3 + c.ax) * 0.35;
      P[2].rz = Math.sin(t * 3 + c.ax) > 0.97 ? 0.3 : 0; // ear twitch
    }
    pose(c);
    writeBlob(c.blob, c.x, gy + 0.012, c.z, 0.13, c.yaw, 0.2);
  }

  // ---- sparrows: small flocks that hop and peck, and fly off when you come close
  const NEST = [[5, 30], [25, 40], [-42, -5], [55, -15], [50, 68], [-30, 79], [-15, 22], [62, 5]];
  const birds = [];
  const BIRD_COL = { c: [0.45, 0.32, 0.2], w: [0.55, 0.45, 0.38], d: [0.3, 0.2, 0.12], y: [0.25, 0.22, 0.2] };
  for (let f = 0; f < 6; f++) for (let k = 0; k < 5; k++) {
    const b = make(BIRD, BIRD_COL, 1.25 + rnd() * 0.25, { nest: f, mode: 'ground', timer: rnd(), ph: rnd() * 6, hop: 0 });
    b.x = NEST[f][0] + (rnd() - 0.5) * 3; b.z = NEST[f][1] + (rnd() - 0.5) * 3; b.yaw = rnd() * 6.28; birds.push(b);
  }
  function scare(nest) {
    let to = nest; while (to === nest) to = (rnd() * NEST.length) | 0;
    for (const b of birds) if (b.nest === nest && b.mode === 'ground') {
      b.mode = 'fly'; b.fx = b.x; b.fz = b.z; b.tx = NEST[to][0] + (rnd() - 0.5) * 3; b.tz = NEST[to][1] + (rnd() - 0.5) * 3;
      b.ft = -rnd() * 0.3; b.fd = Math.hypot(b.tx - b.x, b.tz - b.z) / 9 + 0.8; b.nest = to;
    }
  }
  function updateBird(b, dt, t, cam) {
    const P = b.parts;
    if (b.mode === 'ground') {
      const pd = Math.hypot(cam.p[0] - b.x, cam.p[2] - b.z);
      if (pd < 4.5 && cam.p[1] < 6) { scare(b.nest); if (rnd() < 0.5) audio.chirp(0.6); }
      for (const d of dogs) if (Math.abs(d.x - b.x) < 1.6 && Math.abs(d.z - b.z) < 1.6) scare(b.nest);
    }
    const gy = groundY(b.x, b.z);
    if (b.mode === 'ground') {
      b.timer -= dt;
      if (b.hop > 0) { // mid-hop
        b.hop -= dt * 4; const k = Math.max(0, b.hop);
        b.x += Math.sin(b.yaw) * dt * 0.9; b.z -= Math.cos(b.yaw) * dt * 0.9;
        b.y = gy + Math.sin(k * Math.PI) * 0.06;
      } else b.y = gy;
      if (b.timer <= 0) {
        if (rnd() < 0.55) { b.hop = 1; b.yaw += (rnd() - 0.5) * 2; } else b.peck = 0.35;
        // stay near the nest
        const dx = NEST[b.nest][0] - b.x, dz = NEST[b.nest][1] - b.z; if (dx * dx + dz * dz > 6) b.yaw = yawOf(dx, dz);
        b.timer = 0.3 + rnd() * 1.2;
      }
      b.peck = Math.max(0, (b.peck || 0) - dt);
      P[0].rx = -0.2; P[1].rx = b.peck > 0 ? 0.9 : 0; P[3].rx = 0.25;
      P[4].rz = 1.45; P[5].rz = -1.45; P[4].ry = -0.15; P[5].ry = 0.15;
    } else {
      b.ft += dt; const k = Math.min(1, Math.max(0, b.ft / b.fd));
      b.x = b.fx + (b.tx - b.fx) * k; b.z = b.fz + (b.tz - b.fz) * k;
      b.y = groundY(b.x, b.z) + Math.sin(k * Math.PI) * Math.min(7, 1 + b.fd * 2);
      b.yaw += angTo(b.yaw, yawOf(b.tx - b.fx, b.tz - b.fz)) * Math.min(1, dt * 8);
      const fl = Math.sin(t * 38 + b.ph) * 0.9;
      P[4].rz = -fl; P[5].rz = fl; P[4].ry = 0; P[5].ry = 0; P[0].rx = 0; P[1].rx = 0; P[3].rx = 0;
      if (k >= 1) { b.mode = 'ground'; b.timer = 0.5; }
    }
    pose(b);
    writeBlob(b.blob, b.x, gy + 0.012, b.z, 0.045, b.yaw, 0.06);
  }

  // ---- the seal. Only one, in one of a few unlikely places, different every visit.
  const SEAL_SPOTS = [
    { x: 36.7, z: 39.6, y: 0.72, stay: true, yaw: 0, where: 'sulla Preda Ringadora' },
    { x: 55, z: 68, where: 'in Piazza XX Settembre' }, { x: -44, z: -27, where: 'in fondo a Via Lanfranco' },
    { x: 66, z: -27, where: 'in un angolo di Piazza della Torre' }, { x: 30, z: -31, where: 'dietro la Ghirlandina' },
    { x: -52, z: 64, where: 'in mezzo a Corso Duomo' },
  ];
  const ss = SEAL_SPOTS[(Math.random() * SEAL_SPOTS.length) | 0];
  const seal = make(SEAL, { c: [0.47, 0.46, 0.45], d: [0.3, 0.3, 0.32], w: [0.68, 0.66, 0.62], n: [0.03, 0.03, 0.03] }, 1.05, { ...ss, cx: ss.x, cz: ss.z, ang: Math.random() * 6.28, ph: 0, rest: 2, found: false, arf: 0 });
  seal.y = ss.y || 0;
  function updateSeal(s, dt, t, cam) {
    const pdx = cam.p[0] - s.x, pdz = cam.p[2] - s.z, pd = Math.hypot(pdx, pdz), P = s.parts;
    if (!s.found && pd < 9) { s.found = true; toast('Una foca ' + s.where + '!'); audio.arf(1); s.arf = 6; }
    s.arf -= dt;
    if (pd < 6 && s.arf <= 0 && Math.random() < dt * 0.5) { audio.arf(1 - pd / 30); s.arf = 5; s.call = 1.2; }
    s.call = Math.max(0, (s.call || 0) - dt);
    let moving = false;
    if (!s.stay) {
      s.rest -= dt;
      if (s.rest < 0 && pd > 2.5) {
        moving = true; s.ph += dt * 3.2;
        const push = 0.5 + 0.5 * Math.sin(s.ph);
        s.ang += dt * 0.12 * push; s.x = s.cx + Math.cos(s.ang) * 2.4; s.z = s.cz + Math.sin(s.ang) * 2.4;
        s.yaw = yawOf(-Math.sin(s.ang), Math.cos(s.ang));
        if (s.rest < -8) s.rest = 3 + Math.random() * 5;
      }
      s.y = groundY(s.x, s.z);
    }
    const look = pd < 8 ? Math.max(-0.9, Math.min(0.9, angTo(s.yaw, yawOf(pdx, pdz)))) : Math.sin(t * 0.4) * 0.5;
    P[1].rx = moving ? Math.sin(s.ph) * 0.18 - 0.08 : -0.12;
    P[2].rx = s.call > 0 ? -0.55 : (moving ? 0.1 : -0.15 + Math.sin(t * 0.7) * 0.08); P[2].ry = look * 0.7;
    P[7].rx = moving ? Math.sin(s.ph + 1) * 0.6 : 0.2; P[8].rx = P[7].rx; P[7].rz = 0.3; P[8].rz = -0.3;
    P[9].rx = moving ? -Math.sin(s.ph) * 0.2 : -0.08;
    P[10].ry = -0.35 + Math.sin(t * 1.5) * 0.15; P[11].ry = 0.35 - Math.sin(t * 1.5) * 0.15;
    const yy = s.y; s.y += moving ? Math.abs(Math.sin(s.ph)) * 0.05 : 0;
    pose(s); s.y = yy;
    writeBlob(s.blob, s.x, s.y + 0.012, s.z, 0.32, s.yaw, 0.6);
  }

  // blob shadows: unused slots stay degenerate at the origin
  for (let i = 0; i < BM.nv; i++) { BM.v[i * STRIDE + 4] = 1; }
  for (let i = 0; i < AM.nv; i++) { AM.v[i * STRIDE + 12] = 1; }

  // ---- people strolling through the centre, and a few standing chatting
  const PERSON = [
    [-1, [0, .95, 0], [0, 0, 0], [.16, .1, .1], 'p'],              // 0 hips
    [0, [0, .07, 0], [0, .3, 0], [.18, .3, .11], 's'],              // 1 torso
    [1, [0, .62, 0], [0, .13, .01], [.095, .12, .105], 'k'],        // 2 head
    [2, [0, 0, 0], [0, .22, -.01], [.1, .035, .11], 'h'],          // 3 hair
    [1, [-.235, .56, 0], [0, -.29, 0], [.05, .29, .06], 's'],       // 4 arms
    [1, [.235, .56, 0], [0, -.29, 0], [.05, .29, .06], 's'],
    [0, [-.085, -.04, 0], [0, -.45, 0], [.07, .45, .08], 'p'],      // 6 legs
    [0, [.085, -.04, 0], [0, -.45, 0], [.07, .45, .08], 'p'],
    [6, [0, -.9, 0], [0, -.02, .04], [.065, .035, .12], 'f'],       // 8 shoes
    [7, [0, -.9, 0], [0, -.02, .04], [.065, .035, .12], 'f'],
  ];
  const SHIRT = [[0.75, 0.2, 0.18], [0.15, 0.25, 0.45], [0.9, 0.88, 0.82], [0.3, 0.45, 0.3], [0.85, 0.65, 0.2], [0.35, 0.3, 0.32], [0.55, 0.15, 0.3], [0.2, 0.55, 0.65], [0.95, 0.75, 0.6], [0.12, 0.12, 0.14]];
  const PANTS = [[0.15, 0.18, 0.3], [0.2, 0.2, 0.22], [0.45, 0.38, 0.28], [0.1, 0.1, 0.12], [0.6, 0.55, 0.45], [0.3, 0.25, 0.35]];
  const SKIN = [[0.93, 0.76, 0.62], [0.82, 0.62, 0.48], [0.6, 0.42, 0.3], [0.95, 0.8, 0.7], [0.45, 0.3, 0.22]];
  const HAIR = [[0.1, 0.07, 0.05], [0.35, 0.22, 0.12], [0.75, 0.6, 0.35], [0.55, 0.55, 0.55], [0.2, 0.12, 0.08]];
  const WALKS = [
    [[-28, 22], [33, 22], [33, 45], [-28, 45]], [[-28, 45], [33, 45], [33, 22], [-28, 22]], [[-120, 77], [120, 77]], [[120, 83], [-120, 83]],
    [[-52, -90], [-52, 70]], [[-50, 70], [-50, -90]], [[-44, -31], [62, -31]], [[45, -24], [56, -24], [56, 15], [45, 15]],
    [[30, 55], [30, 90]], [[-44, -17], [-36, -17], [-36, 17], [-44, 17]], [[36, 66], [70, 70]], [[-8, 17.5], [24, 17.5]],
    [[70, 80], [-60, 80]], [[0, 26], [20, 44], [-10, 40]],
  ];
  const mkPerson = (extra) => make(PERSON, { s: pick(SHIRT), p: pick(PANTS), k: pick(SKIN), h: pick(HAIR), f: [0.12, 0.1, 0.09] }, 0.92 + rnd() * 0.16, extra);
  const people = WALKS.map((path) => {
    let L = 0; const seg = [];
    for (let k = 0; k < path.length; k++) { const a = path[k], b = path[(k + 1) % path.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push(l); L += l; }
    return mkPerson({ path, seg, L, s: rnd() * L, sp: 1.1 + rnd() * 0.4, ph: rnd() * 6, walk: true, timer: 10 + rnd() * 20 });
  });
  for (const [x, z, yaw] of [[2, 34, 0.4], [2.7, 34.6, 3.5], [24, 28, 2], [23.3, 28.6, -1.2], [-40, 3, 1.5], [55, -5, 0.8], [55.7, -4.4, -2.3], [-20, 77.2, 1.6]]) {
    people.push(mkPerson({ x, z, yaw, walk: false, ph: rnd() * 6 }));
  }
  function updatePerson(q, dt, t) {
    const P = q.parts;
    if (q.walk) {
      q.timer -= dt;
      if (q.timer < 0) { q.stop = q.stop ? 0 : 1; q.timer = q.stop ? 2 + rnd() * 4 : 15 + rnd() * 25; }
      const moving = !q.stop;
      if (moving) { q.s += q.sp * dt; q.ph += dt * q.sp * 5.2 / q.scale; }
      pathAt(q, q.s, PA); q.x = PA[0]; q.z = PA[1];
      q.yaw += angTo(q.yaw, PA[2]) * Math.min(1, dt * 5);
      const sw = moving ? Math.sin(q.ph) : 0;
      P[6].rx = sw * 0.45; P[7].rx = -sw * 0.45; P[4].rx = -sw * 0.35; P[5].rx = sw * 0.35;
      P[8].rx = Math.max(0, -sw) * 0.3; P[9].rx = Math.max(0, sw) * 0.3;
      q.y = groundY(q.x, q.z) + (moving ? Math.abs(Math.cos(q.ph)) * 0.03 - 0.03 : 0);
      P[2].ry = q.stop ? Math.sin(t * 0.8 + q.ph) * 0.6 : 0;
    } else { // chatting: shifting weight, gesturing
      q.y = groundY(q.x, q.z);
      P[1].rz = Math.sin(t * 0.7 + q.ph) * 0.03; P[2].rx = Math.sin(t * 1.3 + q.ph) * 0.08;
      P[4].rx = -0.3 - Math.max(0, Math.sin(t * 2.1 + q.ph)) * 0.6; P[4].rz = -0.1; P[5].rz = 0.08;
    }
    pose(q);
    writeBlob(q.blob, q.x, groundY(q.x, q.z) + 0.012, q.z, 0.3, q.yaw, 0.25);
  }

  function update(dt, t, cam) {
    for (const q of people) updatePerson(q, dt, t);
    for (const d of dogs) updateDog(d, dt, t, cam);
    for (const c of cats) updateCat(c, dt, t, cam);
    for (const b of birds) updateBird(b, dt, t, cam);
    updateSeal(seal, dt, t, cam);
  }
  return { AM, BM, update, get nBox() { return nBox; }, get nBlob() { return nBlob; }, seal, dogs, cats, birds };
})();
