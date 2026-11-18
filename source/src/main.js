// ---------------------------------------------------------------------------
// Renderer, camera, controls, time of day, pigeons, HUD.
// Plain WebGL2, no engine: one big static mesh, a sun shadow map that is only
// re-rendered when the sun moves, HDR + bloom + filmic tone mapping.
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const canvas = $('c'), body = document.body;
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
if (!gl) throw new Error('Questo browser non supporta WebGL2.');
const floatOK = !!gl.getExtension('EXT_color_buffer_float');
gl.getExtension('OES_texture_float_linear');

const setBar = (f) => { $('b').style.transform = `scaleX(${f})`; };
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---- quality --------------------------------------------------------------
const QUAL = { low: { sh: 2048, msaa: 0, dpr: 0.75 }, medium: { sh: 2048, msaa: 4, dpr: 1 }, high: { sh: 4096, msaa: 4, dpr: 1.5 } };
let qName = 'high';
try { qName = localStorage.getItem('mw-q') || (matchMedia('(pointer:coarse)').matches ? 'low' : (navigator.deviceMemory || 8) <= 4 ? 'medium' : 'high'); } catch (e) { }
if (!QUAL[qName]) qName = 'high';
const Q = QUAL[qName];

// ---- programs --------------------------------------------------------------
function prog(vs, fs) {
  const p = gl.createProgram();
  for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), nm = a.name.replace('[0]', ''); u[nm] = gl.getUniformLocation(p, a.name); }
  return { p, u };
}

setBar(0.05); await tick();
const PM = prog(VS_MAIN, FS_MAIN), PS = prog(VS_SHADOW, FS_SHADOW), PK = prog(VS_FS, FS_SKY);
const PD = prog(VS_FS, FS_DOWN), PU = prog(VS_FS, FS_UP), PC = prog(VS_FS, FS_COMP);
setBar(0.25); await tick();

// ---- the city mesh -----------------------------------------------------------
const city = buildCity();
setBar(0.6); await tick();
function vao(mesh, dynamic) {
  const va = gl.createVertexArray(); gl.bindVertexArray(va);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, dynamic ? mesh.v.byteLength : mesh.v.subarray(0, mesh.nv * STRIDE), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  const sizes = [3, 3, 2, 3, 2, 4]; let off = 0;
  sizes.forEach((s, i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, s, gl.FLOAT, false, STRIDE * 4, off * 4); off += s; });
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.i.subarray(0, mesh.ni), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { va, vb, ib, n: mesh.ni };
}
const CITY = vao(city);

// ---- pigeons: a dynamic mesh rebuilt in place every frame (no allocation) ----
const NB = 90, birds = [];
rnd = mulberry(5);
for (let i = 0; i < NB; i++) birds.push({ g: i % 3, ph: rnd() * 6.28, r: 14 + rnd() * 22, h: 30 + rnd() * 35, sp: 0.25 + rnd() * 0.15, fl: rnd() * 6.28, off: rnd() * 6.28, wob: rnd() });
const BM = new Mesh(); G = BM;
const SB = S_(M.BIRD, [0.3, 0.3, 0.32]);
for (let i = 0; i < NB; i++) { G.tri([0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0, 0, 0, 0], SB); G.tri([0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0, 0, 0, 0], SB); }
for (let i = 0; i < BM.nv; i++) { BM.v[i * STRIDE + 3] = 0; BM.v[i * STRIDE + 4] = 1; BM.v[i * STRIDE + 5] = 0; }
const BIRDS = vao(BM, true);
const CENTRES = [[TX, TZ], [10, 30], [55, 0]];
function updateBirds(t) {
  const v = BM.v;
  for (let i = 0; i < NB; i++) {
    const b = birds[i], c = CENTRES[b.g], a = b.ph + t * b.sp * (b.g === 1 ? -1 : 1);
    const x = c[0] + Math.cos(a) * b.r + Math.sin(t * 0.3 + b.off) * 3, z = c[1] + Math.sin(a) * b.r * 0.8, y = b.h + Math.sin(t * 0.5 + b.off) * 4;
    const dx = -Math.sin(a) * (b.g === 1 ? -1 : 1), dz = Math.cos(a) * 0.8 * (b.g === 1 ? -1 : 1), l = Math.hypot(dx, dz);
    const fx = dx / l, fz = dz / l, sx = -fz, sz = fx, flap = Math.sin(t * 14 + b.fl) * 0.35, span = 0.36;
    const pts = [
      [x + fx * 0.22, y, z + fz * 0.22], [x - fx * 0.18, y, z - fz * 0.18], [x + sx * span, y + flap, z + sz * span],
      [x + fx * 0.22, y, z + fz * 0.22], [x - fx * 0.18, y, z - fz * 0.18], [x - sx * span, y + flap, z - sz * span],
    ];
    for (let k = 0; k < 6; k++) {
      const p = pts[k], o = (i * 8 + (k < 3 ? 0 : 4) + (k % 3)) * STRIDE;
      v[o] = p[0]; v[o + 1] = p[1]; v[o + 2] = p[2];
      if (k % 3 === 2) { const o2 = o + STRIDE; v[o2] = p[0]; v[o2 + 1] = p[1]; v[o2 + 2] = p[2]; }
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, BIRDS.vb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, v, 0, NB * 8 * STRIDE);
}

// ---- ambient occlusion map from the building footprints ------------------------
function aoTexture() {
  const S = 512, k = S / 340, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const draw = (blur, fn) => { const t = document.createElement('canvas'); t.width = t.height = S; const x = t.getContext('2d'); x.filter = `blur(${blur}px)`; fn(x); return t; };
  const fp = (x, f) => { for (const b of FOOT) { f(b); x.fillRect((b[0] + 170) * k, (b[1] + 170) * k, (b[2] - b[0]) * k, (b[3] - b[1]) * k); } };
  // red: footprint coverage (short blur), green: building height (wide blur)
  const r = draw(4, (x) => { x.fillStyle = '#f00'; fp(x, () => { }); });
  const g = draw(14, (x) => { fp(x, (b) => { const v = Math.min(255, Math.round((b[4] / 90) * 255)); x.fillStyle = `rgb(0,${v},0)`; }); });
  c.globalCompositeOperation = 'lighter'; c.drawImage(r, 0, 0); c.drawImage(g, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
const AO = aoTexture();

// ---- collision grid ----------------------------------------------------------------
const CELL = 8, GRID = new Map();
for (const b of COL) for (let gx = Math.floor(b[0] / CELL); gx <= Math.floor(b[2] / CELL); gx++) for (let gz = Math.floor(b[1] / CELL); gz <= Math.floor(b[3] / CELL); gz++) {
  const key = gx * 1000 + gz; if (!GRID.has(key)) GRID.set(key, []); GRID.get(key).push(b);
}
function collide(p, r) {
  for (let it = 0; it < 3; it++) {
    const gx = Math.floor(p[0] / CELL), gz = Math.floor(p[2] / CELL);
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const L = GRID.get((gx + ox) * 1000 + gz + oz); if (!L) continue;
      for (const b of L) {
        const cx = Math.max(b[0], Math.min(p[0], b[2])), cz = Math.max(b[1], Math.min(p[2], b[3]));
        let dx = p[0] - cx, dz = p[2] - cz; const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); p[0] += (dx / d) * (r - d); p[2] += (dz / d) * (r - d); }
        else { // centre inside the box: push out along the shortest axis
          const e = [p[0] - b[0], b[2] - p[0], p[2] - b[1], b[3] - p[2]], m = Math.min(...e);
          if (m === e[0]) p[0] = b[0] - r; else if (m === e[1]) p[0] = b[2] + r; else if (m === e[2]) p[2] = b[1] - r; else p[2] = b[3] + r;
        }
      }
    }
  }
}
setBar(0.75); await tick();

// ---- render targets ------------------------------------------------------------------
const shTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, shTex);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, Q.sh, Q.sh);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
const shFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, shFB);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shTex, 0);

const FMT = floatOK ? gl.RGBA16F : gl.RGBA8, HDR_SCALE = floatOK ? 1 : 4;
function colorTex(w, h) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, 1, FMT, w, h);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  return { t, f, w, h };
}
let RT = null;
const msaa = Math.min(Q.msaa, gl.getParameter(gl.MAX_SAMPLES));
function targets(w, h) {
  if (RT) { for (const x of [RT.scene, ...RT.mips]) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); } gl.deleteRenderbuffer(RT.cr); gl.deleteRenderbuffer(RT.dr); gl.deleteFramebuffer(RT.ms); }
  const scene = colorTex(w, h), ms = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, ms);
  const cr = gl.createRenderbuffer(), dr = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, cr);
  if (msaa) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaa, FMT, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, FMT, w, h);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, cr);
  gl.bindRenderbuffer(gl.RENDERBUFFER, dr);
  if (msaa) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaa, gl.DEPTH_COMPONENT24, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, dr);
  const mips = []; let mw = w, mh = h;
  for (let i = 0; i < 6; i++) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); mips.push(colorTex(mw, mh)); }
  RT = { scene, ms, cr, dr, mips, w, h };
}

// ---- matrices -------------------------------------------------------------------
const mat = () => new Float32Array(16);
function mul(o, a, b) { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
function lookDir(o, e, f, up) {
  let sx = f[1] * up[2] - f[2] * up[1], sy = f[2] * up[0] - f[0] * up[2], sz = f[0] * up[1] - f[1] * up[0];
  const l = Math.hypot(sx, sy, sz); sx /= l; sy /= l; sz /= l;
  const ux = sy * f[2] - sz * f[1], uy = sz * f[0] - sx * f[2], uz = sx * f[1] - sy * f[0];
  o.set([sx, ux, -f[0], 0, sy, uy, -f[1], 0, sz, uz, -f[2], 0, -(sx * e[0] + sy * e[1] + sz * e[2]), -(ux * e[0] + uy * e[1] + uz * e[2]), f[0] * e[0] + f[1] * e[1] + f[2] * e[2], 1]);
  return o;
}
function persp(o, fov, asp, n, f) { const t = 1 / Math.tan(fov / 2); o.fill(0); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = (2 * f * n) / (n - f); return o; }
function ortho(o, l, r, b, t, n, f) { o.fill(0); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1; return o; }
function inv(o, m) {
  const a = m, b = [
    a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10],
    -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10],
    a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6],
    -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6],
    -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10],
    a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10],
    -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6],
    a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6],
    a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9],
    -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9],
    a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5],
    -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5],
    -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9],
    a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9],
    -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5],
    a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5]];
  const d = 1 / (a[0] * b[0] + a[1] * b[4] + a[2] * b[8] + a[3] * b[12]);
  for (let i = 0; i < 16; i++) o[i] = b[i] * d; return o;
}
const V_ = mat(), P_ = mat(), VP = mat(), IVP = mat(), LV = mat(), LP = mat(), LVP = mat();

// ---- time of day ---------------------------------------------------------------------
// hour 0..24. The sun rises in the east (+x), culminates in the south (+z).
const sky = { sun: [0, 1, 0], sunC: [1, 1, 1], sky: [0, 0, 0], hor: [0, 0, 0], gnd: [0, 0, 0], moon: [0, 0, 0], night: 0, expo: 1, fog: 0.004 };
const lerp = (a, b, t) => a + (b - a) * t, mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function setTime(h) {
  const ang = ((h - 6) / 12) * Math.PI, el = Math.sin(ang) * 0.95, az = ang;
  let s = [Math.cos(az), Math.max(el, -0.3), Math.sin(az) * 0.55 + 0.35]; const l = Math.hypot(...s); s = s.map((x) => x / l);
  const e = s[1], day = smooth(-0.08, 0.12, e), gold = 1 - smooth(0.05, 0.4, e);
  sky.night = 1 - smooth(-0.14, 0.02, e);
  const sunCol = mix3([1.0, 0.97, 0.9], [1.0, 0.58, 0.28], gold);
  const I = 3.7 * smooth(-0.04, 0.1, e);
  sky.sunC = sunCol.map((x) => x * I);
  sky.sky = mix3(mix3([0.006, 0.01, 0.025], [0.12, 0.24, 0.55], day), [0.2, 0.42, 0.9], smooth(0.1, 0.5, e)).map((x) => x * 1.1);
  sky.hor = mix3(mix3([0.012, 0.016, 0.03], [0.9, 0.6, 0.4], day), [0.62, 0.74, 0.9], smooth(0.12, 0.5, e));
  sky.gnd = mix3([0.008, 0.008, 0.01], [0.32, 0.26, 0.2], day);
  sky.fog = lerp(0.0022, 0.0012, smooth(0.0, 0.5, e));
  if (sky.night > 0) { // moonlight takes over
    const m = [-0.35, 0.62, -0.5], ml = Math.hypot(...m); sky.moon = m.map((x) => x / ml);
    if (e < -0.02) { sky.sun = sky.moon; sky.sunC = [0.06, 0.08, 0.13].map((x) => x * sky.night); return; }
  }
  sky.sun = s;
}
let hour = 17.6, hourSpeed = 0, shadowDirty = true;
setTime(hour);

// ---- camera and controls -----------------------------------------------------
const cam = { p: [...VIEWS[0].p], yaw: VIEWS[0].yaw, pitch: VIEWS[0].pitch, fly: false, bob: 0, vy: 0 };
const keys = {};
let mdx = 0, mdy = 0, menu = true, showStats = false, showMap = true;
function goto(i) {
  const v = VIEWS[i]; if (!v) return;
  cam.p = [...v.p]; cam.yaw = v.yaw; cam.pitch = v.pitch; cam.fly = !!v.fly; toast(v.name);
}
addEventListener('keydown', (e) => {
  if (e.repeat) return; keys[e.code] = 1;
  if (menu) return;
  if (e.code >= 'Digit1' && e.code <= 'Digit6') goto(+e.code[5] - 1);
  if (e.code === 'KeyF') { cam.fly = !cam.fly; toast(cam.fly ? 'Volo libero' : 'A piedi'); if (!cam.fly) cam.p[1] = Math.max(cam.p[1], 1.7); }
  if (e.code === 'KeyT') { hourSpeed = hourSpeed ? 0 : 0.5; toast(hourSpeed ? 'Il tempo scorre' : 'Tempo fermo'); }
  if (e.code === 'BracketRight' || e.code === 'Period') { hour = (hour + 0.5) % 24; shadowDirty = true; syncHour(); }
  if (e.code === 'BracketLeft' || e.code === 'Comma') { hour = (hour + 23.5) % 24; shadowDirty = true; syncHour(); }
  if (e.code === 'KeyN') showMap = !showMap;
  if (e.code === 'KeyH') showStats = !showStats;
  if (e.code === 'KeyM') audio.toggle();
  if (e.code === 'KeyB') audio.bells(6);
});
addEventListener('keyup', (e) => { keys[e.code] = 0; });
addEventListener('blur', () => { for (const k in keys) keys[k] = 0; });
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; } });
const capture = () => { audio.start(); const p = canvas.requestPointerLock && canvas.requestPointerLock(); if (p && p.catch) p.catch(() => 0); };
canvas.addEventListener('click', () => { if (!menu && document.pointerLockElement !== canvas) capture(); });

// touch: left half walks (virtual stick), right half looks around
const touchState = { mv: null, lk: null, mx: 0, mz: 0 };
function onTouch(e) {
  e.preventDefault(); audio.start();
  const rect = canvas.getBoundingClientRect(), rot = rect.width < rect.height && matchMedia('(orientation:portrait) and (pointer:coarse)').matches;
  const T = (t) => rot ? { x: t.clientY - rect.top, y: rect.right - t.clientX, id: t.identifier } : { x: t.clientX - rect.left, y: t.clientY - rect.top, id: t.identifier };
  const W = rot ? rect.height : rect.width;
  const seen = new Set();
  for (const raw of e.touches) {
    const t = T(raw); seen.add(t.id);
    if (touchState.mv && touchState.mv.id === t.id) { touchState.mx = Math.max(-1, Math.min(1, (t.x - touchState.mv.x) / 60)); touchState.mz = Math.max(-1, Math.min(1, (t.y - touchState.mv.y) / 60)); }
    else if (touchState.lk && touchState.lk.id === t.id) { mdx += (t.x - touchState.lk.x) * 2.2; mdy += (t.y - touchState.lk.y) * 2.2; touchState.lk.x = t.x; touchState.lk.y = t.y; }
    else if (t.x < W / 2 && !touchState.mv) touchState.mv = { ...t };
    else if (!touchState.lk) touchState.lk = { ...t };
  }
  if (touchState.mv && !seen.has(touchState.mv.id)) { touchState.mv = null; touchState.mx = touchState.mz = 0; }
  if (touchState.lk && !seen.has(touchState.lk.id)) touchState.lk = null;
}
for (const n of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) canvas.addEventListener(n, onTouch, { passive: false });

function updateCamera(dt) {
  const sens = 0.0022;
  cam.yaw += mdx * sens; cam.pitch = Math.max(-1.45, Math.min(1.45, cam.pitch - mdy * sens)); mdx = mdy = 0;
  const run = keys.ShiftLeft || keys.ShiftRight;
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touchState.mx;
  let mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - touchState.mz;
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  if (cam.fly) {
    const sp = run ? 40 : 12, cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch);
    cam.p[0] += (sy * cp * mz + cy * mx) * sp * dt;
    cam.p[2] += (-cy * cp * mz + sy * mx) * sp * dt;
    cam.p[1] += (spp * mz + ((keys.KeyE || keys.Space ? 1 : 0) - (keys.KeyQ || keys.KeyC ? 1 : 0))) * sp * dt;
    cam.p[1] = Math.max(1.0, Math.min(160, cam.p[1]));
    cam.p[0] = Math.max(-300, Math.min(300, cam.p[0])); cam.p[2] = Math.max(-300, Math.min(300, cam.p[2]));
    if (cam.p[1] < 25) collide(cam.p, 0.4);
  } else {
    const sp = run ? 6.5 : 2.6;
    cam.p[0] += (sy * mz + cy * mx) * sp * dt;
    cam.p[2] += (-cy * mz + sy * mx) * sp * dt;
    collide(cam.p, 0.35);
    // settle down to eye height when coming back from flying
    cam.p[1] = cam.p[1] > 1.7 ? Math.max(1.7, cam.p[1] - Math.max(2, (cam.p[1] - 1.7) * 3) * dt) : 1.7;
    const moving = Math.min(1, Math.hypot(mx, mz)) * (run ? 1.5 : 1);
    const prev = cam.bob; cam.bob += dt * moving * (run ? 11 : 8);
    if (moving > 0.1 && Math.floor(prev / Math.PI) !== Math.floor(cam.bob / Math.PI)) audio.step(run);
  }
}

// ---- HUD: place names, minimap ---------------------------------------------------
let toastT = 0, zoneName = '';
function toast(s) { $('t').textContent = s; $('t').classList.add('on'); toastT = 2.5; }
function zoneAt(x, z) { for (const [n, x0, z0, x1, z1] of ZONES) if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return n; return ''; }
const mapC = $('map'), mctx = mapC.getContext('2d');
const MS = 2.1; // pixels per metre at 1x
function drawMap() {
  const w = mapC.width, h = mapC.height, cx = w / 2, cz = h / 2, k = MS * (w / 260);
  mctx.clearRect(0, 0, w, h);
  mctx.save(); mctx.beginPath(); mctx.arc(cx, cz, w / 2 - 2, 0, 6.2832); mctx.clip();
  mctx.fillStyle = '#e9e1d2'; mctx.fillRect(0, 0, w, h);
  mctx.translate(cx, cz); mctx.rotate(-cam.yaw); mctx.translate(-cam.p[0] * k, -cam.p[2] * k);
  mctx.fillStyle = '#c9b8a0';
  for (const b of FOOT) mctx.fillRect(b[0] * k, b[1] * k, (b[2] - b[0]) * k, (b[3] - b[1]) * k);
  mctx.fillStyle = '#b5523b';
  mctx.fillRect(X0 * k, -ZA * k, (X1 - X0) * k, 2 * ZA * k); mctx.beginPath(); mctx.arc(X1 * k, 0, 4.8 * k, -1.57, 1.57); mctx.fill();
  mctx.fillRect((TX - TH) * k, (TZ - TH) * k, 2 * TH * k, 2 * TH * k);
  mctx.restore();
  mctx.fillStyle = '#7a2a1c'; mctx.beginPath(); mctx.moveTo(cx, cz - 9); mctx.lineTo(cx + 6, cz + 6); mctx.lineTo(cx, cz + 3); mctx.lineTo(cx - 6, cz + 6); mctx.closePath(); mctx.fill();
  // north marker
  const na = -cam.yaw; mctx.fillStyle = '#7a2a1c'; mctx.font = `800 ${w * 0.08}px system-ui`; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
  mctx.fillText('N', cx + Math.sin(na) * (w / 2 - 12), cz - Math.cos(na) * (w / 2 - 12));
}

// ---- frame -----------------------------------------------------------------------
let W = 0, H = 0, scale = 1, last = performance.now(), ftAvg = 16, tAcc = 0, fpsShow = 0, frames = 0, adaptT = 0;
const LBUF = new Float32Array(24 * 4), ldist = new Float32Array(LAMPS.length);
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, Q.dpr);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (w !== canvas.width || h !== canvas.height) { canvas.width = w; canvas.height = h; }
  const sw = Math.max(1, Math.round(w * scale)), sh = Math.max(1, Math.round(h * scale));
  if (!RT || RT.w !== sw || RT.h !== sh) targets(sw, sh);
  W = w; H = h;
}

function renderShadow() {
  const s = sky.sun, c = [0, 0, 20];
  const eye = [c[0] + s[0] * 300, c[1] + s[1] * 300, c[2] + s[2] * 300];
  const up = Math.abs(s[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
  lookDir(LV, eye, [-s[0], -s[1], -s[2]], up);
  ortho(LP, -150, 150, -150, 150, 50, 650);
  mul(LVP, LP, LV);
  gl.bindFramebuffer(gl.FRAMEBUFFER, shFB); gl.viewport(0, 0, Q.sh, Q.sh);
  gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
  gl.useProgram(PS.p); gl.uniformMatrix4fv(PS.u.uVP, false, LVP);
  gl.bindVertexArray(CITY.va); gl.drawElements(gl.TRIANGLES, CITY.n, gl.UNSIGNED_INT, 0);
  gl.disable(gl.POLYGON_OFFSET_FILL);
}

function fs(p, tex, target, px) { gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null); gl.viewport(0, 0, target ? target.w : W, target ? target.h : H); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(p.u.uT, 0); if (px && p.u.uPx) gl.uniform2f(p.u.uPx, px[0], px[1]); gl.drawArrays(gl.TRIANGLES, 0, 3); }

function loop(now) {
  requestAnimationFrame(loop);
  if (window.__pause) { if (!window.__once) return; window.__once = 0; }
  const dt = Math.min(0.05, (now - last) / 1000); last = now; tAcc += dt;
  ftAvg = ftAvg * 0.95 + dt * 1000 * 0.05; frames++;
  if (!menu) updateCamera(dt); else { cam.yaw += dt * 0.03; }
  if (hourSpeed) { hour = (hour + dt * hourSpeed) % 24; syncHour(); }
  if (Math.abs(hour - sky._h) > 0.02 || shadowDirty) { setTime(hour); sky._h = hour; shadowDirty = true; }
  // adaptive resolution: aim for ~60 fps
  adaptT += dt;
  if (adaptT > 1.5) { adaptT = 0; if (ftAvg > 22 && scale > 0.55) scale = Math.max(0.55, scale - 0.1); else if (ftAvg < 13 && scale < 1) scale = Math.min(1, scale + 0.1); }
  resize();
  if (shadowDirty) { renderShadow(); shadowDirty = false; }

  // camera matrices
  const cp = Math.cos(cam.pitch), f = [Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp];
  const eye = [cam.p[0], cam.p[1] + (cam.fly ? 0 : Math.abs(Math.sin(cam.bob)) * 0.045), cam.p[2]];
  lookDir(V_, eye, f, [0, 1, 0]); persp(P_, 1.2, RT.w / RT.h, 0.3, 1400); mul(VP, P_, V_); inv(IVP, VP);

  // nearest street lamps
  let nl = 0;
  if (sky.night > 0.01) {
    for (let i = 0; i < LAMPS.length; i++) { const L = LAMPS[i]; ldist[i] = (L[0] - eye[0]) ** 2 + (L[2] - eye[2]) ** 2 + (L[1] - eye[1]) ** 2; }
    let lastD = -1;
    for (; nl < 24; nl++) {
      let bi = -1, bd = 1e12;
      for (let i = 0; i < LAMPS.length; i++) if (ldist[i] > lastD && ldist[i] < bd) { bd = ldist[i]; bi = i; }
      if (bi < 0 || bd > 160 * 160) break;
      lastD = bd; const L = LAMPS[bi]; LBUF[nl * 4] = L[0]; LBUF[nl * 4 + 1] = L[1]; LBUF[nl * 4 + 2] = L[2]; LBUF[nl * 4 + 3] = 1.6 * sky.night;
    }
  }
  updateBirds(tAcc);

  // scene
  gl.bindFramebuffer(gl.FRAMEBUFFER, RT.ms); gl.viewport(0, 0, RT.w, RT.h);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE);
  const expo = (1 + sky.night * 0.9) * (1 / HDR_SCALE);
  const d = new Date(), hh = (d.getHours() % 12) + d.getMinutes() / 60, mm = d.getMinutes() + d.getSeconds() / 60;
  gl.useProgram(PM.p); const u = PM.u;
  gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniform3fv(u.uCam, eye);
  gl.uniform3fv(u.uSun, sky.sun); gl.uniform3fv(u.uSunC, sky.sunC); gl.uniform3fv(u.uSky, sky.sky); gl.uniform3fv(u.uHor, sky.hor); gl.uniform3fv(u.uGnd, sky.gnd);
  gl.uniform1f(u.uTime, tAcc); gl.uniform1f(u.uNight, sky.night); gl.uniform1f(u.uFog, sky.fog); gl.uniform1f(u.uExpo, expo);
  gl.uniform2f(u.uClock, (hh / 12) * 6.2832, (mm / 60) * 6.2832);
  gl.uniformMatrix4fv(u.uShM, false, LVP); gl.uniform2f(u.uShT, 1 / Q.sh, 1 / Q.sh);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shTex); gl.uniform1i(u.uSh, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, AO); gl.uniform1i(u.uAO, 1);
  gl.uniform4fv(u.uL, LBUF); gl.uniform1i(u.uNL, nl);
  gl.bindVertexArray(CITY.va); gl.drawElements(gl.TRIANGLES, CITY.n, gl.UNSIGNED_INT, 0);
  gl.bindVertexArray(BIRDS.va); gl.drawElements(gl.TRIANGLES, NB * 12, gl.UNSIGNED_INT, 0);
  gl.bindVertexArray(null);
  // sky behind everything
  gl.useProgram(PK.p);
  gl.uniformMatrix4fv(PK.u.uIVP, false, IVP);
  for (const k of ['uSun', 'uSunC', 'uSky', 'uHor', 'uGnd']) gl.uniform3fv(PK.u[k], sky[{ uSun: 'sun', uSunC: 'sunC', uSky: 'sky', uHor: 'hor', uGnd: 'gnd' }[k]]);
  gl.uniform3fv(PK.u.uMoon, sky.moon); gl.uniform1f(PK.u.uTime, tAcc); gl.uniform1f(PK.u.uNight, sky.night); gl.uniform1f(PK.u.uExpo, expo);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.disable(gl.DEPTH_TEST);
  // resolve MSAA
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, RT.ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, RT.scene.f);
  gl.blitFramebuffer(0, 0, RT.w, RT.h, 0, 0, RT.w, RT.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  // bloom
  gl.useProgram(PD.p);
  let src = RT.scene;
  for (let i = 0; i < RT.mips.length; i++) { gl.uniform1f(PD.u.uThr, i === 0 ? 1.4 / HDR_SCALE : 0); fs(PD, src.t, RT.mips[i], [1 / src.w, 1 / src.h]); src = RT.mips[i]; }
  gl.useProgram(PU.p); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  for (let i = RT.mips.length - 1; i > 0; i--) fs(PU, RT.mips[i].t, RT.mips[i - 1], [1 / RT.mips[i].w, 1 / RT.mips[i].h]);
  gl.disable(gl.BLEND);
  // composite to screen
  gl.useProgram(PC.p);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, RT.mips[0].t); gl.uniform1i(PC.u.uB, 1);
  gl.uniform1f(PC.u.uBloom, 0.12); gl.uniform1f(PC.u.uTime, tAcc % 100); gl.uniform1f(PC.u.uScale, HDR_SCALE);
  fs(PC, RT.scene.t, null);

  // HUD
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('t').classList.remove('on'); }
  if (!menu) {
    const z = zoneAt(cam.p[0], cam.p[2]) || 'Centro storico';
    if (z !== zoneName) { zoneName = z; $('z').textContent = z; }
    if (showMap) drawMap();
  }
  $('map').style.display = showMap && !menu ? '' : 'none';
  if (showStats && frames % 10 === 0) $('st').textContent = `${(1000 / ftAvg).toFixed(0)} fps · ${RT.w}×${RT.h} · ${(CITY.n / 3 / 1000).toFixed(0)}k triangoli · ${qName}`;
  $('st').style.display = showStats ? '' : 'none';
  if (window.__onFrame) window.__onFrame();
}

// ---- menu ------------------------------------------------------------------------------
function syncHour() { const r = $('hr'); if (r) { r.value = hour; $('hv').textContent = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`; } }
$('hr').addEventListener('input', (e) => { hour = +e.target.value; shadowDirty = true; syncHour(); });
syncHour();
for (const b of document.querySelectorAll('#q button')) {
  b.classList.toggle('on', b.dataset.q === qName);
  b.addEventListener('click', () => { try { localStorage.setItem('mw-q', b.dataset.q); } catch (e) { } location.reload(); });
}
function ui(m) {
  menu = m; body.className = m ? 'm' : 'g';
  $('go').textContent = started ? 'Riprendi' : 'Entra in piazza';
}
let started = false;
$('go').addEventListener('click', () => { if (!started) { started = true; goto(0); } ui(false); capture(); });
$('o').addEventListener('click', () => { document.exitPointerLock && document.exitPointerLock(); ui(true); });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && !matchMedia('(pointer:coarse)').matches) ui(true); });
addEventListener('keydown', (e) => { if (e.code === 'Escape' && !menu && !document.pointerLockElement) ui(true); });

setBar(1);
requestAnimationFrame(loop);
setTimeout(() => ui(true), 300);
window.__mw = { cam, goto, setHour: (h) => { hour = h; shadowDirty = true; syncHour(); }, ui, get scale() { return scale; }, set scale(v) { scale = v; } };
