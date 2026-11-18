// ---------------------------------------------------------------------------
// Modena, the real thing: Google Photorealistic 3D Tiles streamed through CesiumJS,
// with a first-person walk on the actual surfaces of the town.
// The tiles are a photogrammetric scan, so every stone of the Duomo is where it is.
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const body = document.body;
const C = window.Cesium;
if (!C) throw new Error('Non riesco a caricare CesiumJS: serve una connessione a internet.');

// ---- places (WGS84 degrees). Walk spots snap to the nearest street level nearby.
const DUOMO = [44.64647, 10.92567], TOWER = [44.64662, 10.92622];
const VIEWS = [
  { name: 'La facciata del Duomo', at: [44.64652, 10.92497], look: [44.64648, 10.92528, 14] },
  { name: 'Piazza Grande', at: [44.64608, 10.92585], look: [44.64640, 10.92590, 10] },
  { name: 'La Ghirlandina', at: [44.64688, 10.92590], look: [...TOWER, 60] },
  { name: 'Le absidi da Piazza Torre', at: [44.64648, 10.92680], look: [44.64648, 10.92610, 12] },
  { name: 'Via Emilia', at: [44.64575, 10.92540], look: [44.64575, 10.92640, 4] },
  { name: 'Dall\'alto', at: [44.64480, 10.92420], look: [...DUOMO, 20], fly: 120 },
];
const PLACES = [['Piazza Grande', 44.64612, 10.92590, 35], ['Sagrato del Duomo', 44.64650, 10.92500, 25], ['Piazza della Torre', 44.64650, 10.92685, 30], ['Via Lanfranco', 44.64680, 10.92570, 25], ['Via Emilia', 44.64575, 10.92560, 40]];

// ---- quality
const QUAL = { low: { sse: 28, msaa: 1, res: 0.75 }, medium: { sse: 14, msaa: 2, res: 1 }, high: { sse: 6, msaa: 4, res: Math.min(1.5, devicePixelRatio || 1) } };
let qName = 'high';
try { qName = localStorage.getItem('mr-q') || (matchMedia('(pointer:coarse)').matches ? 'low' : 'high'); } catch (e) { }
if (!QUAL[qName]) qName = 'high';
const Q = QUAL[qName];

// ---- key: a Google Maps key ("AIza…") or a Cesium ion token ("eyJ…")
let KEY = '';
try { KEY = new URLSearchParams(location.search).get('key') || localStorage.getItem('mr-key') || ''; } catch (e) { }

// ---- viewer
const viewer = new C.Viewer('cz', {
  globe: false, baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
  navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false, infoBox: false,
  selectionIndicator: false, msaaSamples: Q.msaa, requestRenderMode: false, skyAtmosphere: new C.SkyAtmosphere(),
});
const scene = viewer.scene, camera = viewer.camera;
viewer.resolutionScale = Q.res;
scene.skyAtmosphere.show = true;
scene.fog.enabled = true; scene.fog.density = 0.00025;
scene.highDynamicRange = true;
scene.postProcessStages.fxaa.enabled = Q.msaa < 2;
scene.screenSpaceCameraController.enableInputs = false;
camera.frustum.fov = 1.15;
camera.frustum.near = 0.15;
// a late-spring morning: the photographs in the tiles are daylight, so is the sky
viewer.clock.currentTime = C.JulianDate.fromIso8601('2025-05-20T08:30:00Z');
viewer.clock.shouldAnimate = false;
// a light filmic grade on top of the photogrammetry
scene.postProcessStages.add(new C.PostProcessStage({
  fragmentShader: `uniform sampler2D colorTexture; in vec2 v_textureCoordinates;
  void main(){ vec4 c=texture(colorTexture,v_textureCoordinates); vec3 x=c.rgb;
    float l=dot(x,vec3(.2126,.7152,.0722)); x=mix(vec3(l),x,1.1); x=mix(x,x*x*(3.-2.*x),.18);
    x*=vec3(1.02,1.,.97); vec2 q=v_textureCoordinates-.5; x*=1.-.3*dot(q,q);
    out_FragColor=vec4(x,c.a); }`,
}));

let tileset = null;
async function loadTiles() {
  if (tileset) { scene.primitives.remove(tileset); tileset = null; }
  if (KEY.startsWith('AIza')) { C.GoogleMaps.defaultApiKey = KEY; } else { C.GoogleMaps.defaultApiKey = undefined; C.Ion.defaultAccessToken = KEY; }
  tileset = await C.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true }, { maximumScreenSpaceError: Q.sse, showCreditsOnScreen: true, enableCollision: true });
  scene.primitives.add(tileset);
  tileset.tileFailed.addEventListener((e) => console.warn('tile', e.message));
  return tileset;
}

// ---- positions
const ell = C.Ellipsoid.WGS84;
const RAD = Math.PI / 180, R_EARTH = 6378137;
const cam = { lon: DUOMO[1] * RAD, lat: (DUOMO[0] - 0.0015) * RAD, h: 300, ground: null, heading: 0.6, pitch: -0.4, fly: true, bob: 0 };
const ray = new C.Ray(), tmp = new C.Cartesian3(), tmp2 = new C.Cartesian3(), carto = new C.Cartographic();
// first surface below a point (height above the ellipsoid), or undefined
function groundBelow(lon, lat, fromH) {
  C.Cartesian3.fromRadians(lon, lat, fromH, ell, ray.origin);
  ell.geodeticSurfaceNormal(ray.origin, ray.direction); C.Cartesian3.negate(ray.direction, ray.direction);
  const hit = tileset && tileset.pick(ray, scene.frameState, tmp);
  if (!hit) return undefined;
  return ell.cartesianToCartographic(hit, carto).height;
}
// distance to the first wall along a horizontal direction (east, north metres), at knee/chest height
function wallDistance(lon, lat, h, de, dn) {
  C.Cartesian3.fromRadians(lon, lat, h, ell, ray.origin);
  const L = Math.hypot(de, dn) || 1;
  C.Cartesian3.fromRadians(lon + de / L / (R_EARTH * Math.cos(lat)), lat + dn / L / R_EARTH, h, ell, tmp2);
  C.Cartesian3.subtract(tmp2, ray.origin, ray.direction); C.Cartesian3.normalize(ray.direction, ray.direction);
  const hit = tileset && tileset.pick(ray, scene.frameState, tmp);
  return hit ? C.Cartesian3.distance(hit, ray.origin) : Infinity;
}
// the lowest walkable spot near a target: street level, not a roof
function streetNear(lat, lon) {
  const pts = [];
  for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) {
    const la = lat * RAD + (i * 3) / R_EARTH, lo = lon * RAD + (j * 3) / (R_EARTH * Math.cos(lat * RAD));
    const g = groundBelow(lo, la, 600);
    if (g !== undefined) pts.push({ la, lo, g, d: Math.hypot(i, j) });
  }
  if (!pts.length) return null;
  const min = Math.min(...pts.map((p) => p.g));
  const ok = pts.filter((p) => p.g < min + 0.8).sort((a, b) => a.d - b.d);
  return ok[0];
}
function lookAt(target) {
  const tl = target[0] * RAD, to = target[1] * RAD;
  const dn = (tl - cam.lat) * R_EARTH, de = (to - cam.lon) * R_EARTH * Math.cos(cam.lat);
  const tg = groundBelow(to, tl, 600) ?? (cam.ground ?? cam.h);
  cam.heading = Math.atan2(de, dn);
  cam.pitch = Math.atan2(tg + target[2] - cam.h, Math.hypot(de, dn));
}

// ---- going to a place: wait for the detailed tiles there, then put the walker on the street
let pending = null;
function goto(i) {
  const v = VIEWS[i]; if (!v || !tileset) return;
  pending = { v, t: performance.now() };
  // fly there first, high enough to stream the area
  cam.lat = v.at[0] * RAD; cam.lon = v.at[1] * RAD; cam.fly = true;
  const g = groundBelow(cam.lon, cam.lat, 600);
  cam.h = (g ?? cam.h) + (v.fly || 60);
  toast(v.name);
  lookAt(v.look);
}
function settle() {
  if (!pending) return;
  const { v } = pending, waited = performance.now() - pending.t;
  if (!tileset.tilesLoaded && waited < 6000) return;
  if (v.fly) { const g = groundBelow(cam.lon, cam.lat, 600); if (g !== undefined) cam.h = g + v.fly; lookAt(v.look); pending = null; return; }
  const s = streetNear(v.at[0], v.at[1]);
  if (s) { cam.lat = s.la; cam.lon = s.lo; cam.ground = s.g; cam.h = s.g + 1.7; cam.fly = false; lookAt(v.look); }
  if (s || waited > 9000) pending = null;
}

// ---- controls
const keys = {};
let mdx = 0, mdy = 0, menu = true, started = false;
addEventListener('keydown', (e) => {
  if (e.repeat || e.target.tagName === 'INPUT') return; keys[e.code] = 1;
  if (menu) return;
  if (e.code >= 'Digit1' && e.code <= 'Digit6') goto(+e.code[5] - 1);
  if (e.code === 'KeyF') { cam.fly = !cam.fly; toast(cam.fly ? 'Volo libero' : 'A piedi'); if (!cam.fly) { const s = streetNear(cam.lat / RAD, cam.lon / RAD); if (s) { cam.lat = s.la; cam.lon = s.lo; cam.ground = s.g; cam.h = s.g + 1.7; } } }
  if (e.code === 'KeyM') audio.toggle();
  if (e.code === 'KeyB') audio.bells(6);
});
addEventListener('keyup', (e) => { keys[e.code] = 0; });
addEventListener('blur', () => { for (const k in keys) keys[k] = 0; });
const canvas = viewer.canvas;
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas || dragging) { mdx += e.movementX; mdy += e.movementY; } });
let dragging = false;
canvas.addEventListener('mousedown', () => { if (!menu) dragging = document.pointerLockElement !== canvas; });
addEventListener('mouseup', () => { dragging = false; });
const capture = () => { audio.start(); const p = canvas.requestPointerLock && canvas.requestPointerLock(); if (p && p.catch) p.catch(() => 0); };
canvas.addEventListener('click', () => { if (!menu && document.pointerLockElement !== canvas) capture(); });
// touch: left half walks, right half looks
const T = { mv: null, lk: null, mx: 0, mz: 0 };
function onTouch(e) {
  e.preventDefault(); audio.start();
  const r = canvas.getBoundingClientRect(), seen = new Set();
  for (const t of e.touches) {
    const x = t.clientX - r.left, y = t.clientY - r.top; seen.add(t.identifier);
    if (T.mv && T.mv.id === t.identifier) { T.mx = Math.max(-1, Math.min(1, (x - T.mv.x) / 60)); T.mz = Math.max(-1, Math.min(1, (y - T.mv.y) / 60)); }
    else if (T.lk && T.lk.id === t.identifier) { mdx += (x - T.lk.x) * 2.2; mdy += (y - T.lk.y) * 2.2; T.lk.x = x; T.lk.y = y; }
    else if (x < r.width / 2 && !T.mv) T.mv = { id: t.identifier, x, y };
    else if (!T.lk) T.lk = { id: t.identifier, x, y };
  }
  if (T.mv && !seen.has(T.mv.id)) { T.mv = null; T.mx = T.mz = 0; }
  if (T.lk && !seen.has(T.lk.id)) T.lk = null;
}
for (const n of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) canvas.addEventListener(n, onTouch, { passive: false });

function step(dt) {
  cam.heading += mdx * 0.0022; cam.pitch = Math.max(-1.5, Math.min(1.4, cam.pitch - mdy * 0.0022)); mdx = mdy = 0;
  if (menu) { cam.heading += dt * 0.02; return; }
  const run = keys.ShiftLeft || keys.ShiftRight;
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + T.mx;
  let mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - T.mz;
  const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
  const sh = Math.sin(cam.heading), ch = Math.cos(cam.heading);
  if (cam.fly) {
    const sp = run ? 60 : 15, cp = Math.cos(cam.pitch);
    const de = (sh * cp * mz + ch * mx) * sp * dt, dn = (ch * cp * mz - sh * mx) * sp * dt;
    cam.lon += de / (R_EARTH * Math.cos(cam.lat)); cam.lat += dn / R_EARTH;
    cam.h += (Math.sin(cam.pitch) * mz + ((keys.KeyE || keys.Space ? 1 : 0) - (keys.KeyQ || keys.KeyC ? 1 : 0))) * sp * dt;
    const g = groundBelow(cam.lon, cam.lat, cam.h + 2);
    if (g !== undefined) cam.h = Math.max(cam.h, g + 1.7);
    return;
  }
  // walking: move, refuse walls and drops, follow the ground
  const sp = run ? 5.5 : 1.9;
  let de = (sh * mz + ch * mx) * sp * dt, dn = (ch * mz - sh * mx) * sp * dt;
  const ground = cam.ground ?? cam.h - 1.7;
  const tryMove = (de, dn) => {
    if (!de && !dn) return false;
    if (wallDistance(cam.lon, cam.lat, ground + 0.9, de, dn) < Math.hypot(de, dn) + 0.35) return false;
    const lon = cam.lon + de / (R_EARTH * Math.cos(cam.lat)), lat = cam.lat + dn / R_EARTH;
    const g = groundBelow(lon, lat, ground + 1.8);
    if (g === undefined || g > ground + 0.55 || g < ground - 2.5) return false;
    cam.lon = lon; cam.lat = lat; cam.ground = g; return true;
  };
  const moved = tryMove(de, dn) || tryMove(de, 0) || tryMove(0, dn);
  if (cam.ground === null) { const g = groundBelow(cam.lon, cam.lat, cam.h + 1); if (g !== undefined) cam.ground = g; }
  const target = (cam.ground ?? ground) + 1.7;
  cam.h += (target - cam.h) * Math.min(1, dt * 10);
  if (moved) {
    const prev = cam.bob; cam.bob += dt * (run ? 11 : 8);
    if (Math.floor(prev / Math.PI) !== Math.floor(cam.bob / Math.PI)) audio.step(run);
  }
}

// ---- HUD
let toastT = 0;
function toast(s) { $('t').textContent = s; $('t').classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => $('t').classList.remove('on'), 2500); }
function placeName() {
  let best = 'Centro storico', bd = 1e9;
  for (const [n, la, lo, r] of PLACES) { const d = Math.hypot((la * RAD - cam.lat) * R_EARTH, (lo * RAD - cam.lon) * R_EARTH * Math.cos(cam.lat)); if (d < r && d < bd) { bd = d; best = n; } }
  return best;
}

// ---- frame
let last = performance.now(), hudN = 0;
scene.preUpdate.addEventListener(() => {
  const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (tileset) { step(dt); settle(); }
  const bob = cam.fly ? 0 : Math.abs(Math.sin(cam.bob)) * 0.04;
  camera.setView({ destination: C.Cartesian3.fromRadians(cam.lon, cam.lat, cam.h + bob, ell, tmp2), orientation: { heading: cam.heading, pitch: cam.pitch, roll: 0 } });
  if (++hudN % 15 === 0) {
    $('z').textContent = placeName();
    $('cmp').style.transform = `rotate(${-cam.heading}rad)`;
    $('ld').classList.toggle('on', !!tileset && !tileset.tilesLoaded);
  }
});

// ---- menu
function ui(m) { menu = m; body.className = m ? 'm' : 'g'; $('go').textContent = started ? 'Riprendi' : 'Entra in piazza'; }
function setStatus(s, err) { $('s').textContent = s; $('s').classList.toggle('err', !!err); }
async function start() {
  const k = $('key').value.trim();
  if (!k) { setStatus('Incolla prima la tua chiave qui sopra.', true); $('key').focus(); return; }
  if (k !== KEY || !tileset) {
    KEY = k; try { localStorage.setItem('mr-key', k); } catch (e) { }
    setStatus('Collegamento ai server di Google…');
    $('go').disabled = true;
    try { await loadTiles(); }
    catch (e) {
      $('go').disabled = false;
      setStatus(k.startsWith('AIza')
        ? 'Google ha rifiutato la chiave. Controlla che la "Map Tiles API" sia attiva nel progetto e che la chiave possa usarla. (' + (e.message || e) + ')'
        : 'Cesium ion ha rifiutato il token. Copialo di nuovo dalla pagina "Access Tokens". (' + (e.message || e) + ')', true);
      return;
    }
    $('go').disabled = false; setStatus('');
  }
  if (!started) { started = true; goto(0); }
  ui(false); capture();
}
$('key').value = KEY;
$('go').addEventListener('click', start);
$('key').addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
$('o').addEventListener('click', () => { document.exitPointerLock && document.exitPointerLock(); ui(true); });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && !matchMedia('(pointer:coarse)').matches) ui(true); });
addEventListener('keydown', (e) => { if (e.code === 'Escape' && !menu && !document.pointerLockElement) ui(true); });
for (const b of document.querySelectorAll('#q button')) {
  b.classList.toggle('on', b.dataset.q === qName);
  b.addEventListener('click', () => { try { localStorage.setItem('mr-q', b.dataset.q); } catch (e) { } location.reload(); });
}
ui(true);
// with a saved key, start streaming straight away so the town is there behind the menu
if (KEY) loadTiles().then(() => { cam.lat = 44.6442 * RAD; cam.lon = 10.9238 * RAD; cam.h = 260; lookAt([...DUOMO, 0]); }).catch(() => setStatus('La chiave salvata non funziona più: incollane una nuova.', true));
window.__mr = { cam, viewer, goto, get tileset() { return tileset; } };
