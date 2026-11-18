// ---------------------------------------------------------------------------
// Sound, all synthesized: the murmur of the town, pigeons, footsteps on stone and
// the bells of the Ghirlandina (inharmonic partials of a real bell, struck one by one).
// ---------------------------------------------------------------------------
const audio = (() => {
  let ac = null, out = null, on = true, noise = null, nextBell = 0, nextCoo = 0;
  function start() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC(); out = ac.createGain(); out.gain.value = on ? 0.8 : 0; out.connect(ac.destination);
    // one second of noise, reused for everything
    noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noise.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = i & 1 ? w : b * 3.5; }
    // ambience: low city rumble + soft air
    for (const [f, g, q] of [[180, 0.05, 0.4], [900, 0.012, 0.6]]) {
      const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = f; fl.Q.value = q;
      const gn = ac.createGain(); gn.gain.value = g;
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.07 + Math.random() * 0.05; lg.gain.value = g * 0.5; lfo.connect(lg).connect(gn.gain); lfo.start();
      s.connect(fl).connect(gn).connect(out); s.start();
    }
    nextBell = ac.currentTime + 12; nextCoo = ac.currentTime + 3;
    setInterval(schedule, 500);
  }
  function schedule() {
    if (!ac) return;
    const t = ac.currentTime;
    if (t > nextBell) { bells(3 + ((Math.random() * 4) | 0)); nextBell = t + 70 + Math.random() * 60; }
    if (t > nextCoo) { coo(); nextCoo = t + 4 + Math.random() * 9; }
  }
  function strike(t, f0, vol) {
    const partials = [[0.5, 1, 4.5], [1, 0.8, 3], [1.19, 0.5, 2.2], [1.5, 0.35, 1.6], [2, 0.3, 1.3], [2.52, 0.18, 0.9], [3.01, 0.12, 0.7], [4.07, 0.07, 0.5]];
    const g = ac.createGain(); g.gain.value = vol;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3500;
    // a little echo off the facades
    const dl = ac.createDelay(1), fb = ac.createGain(); dl.delayTime.value = 0.21; fb.gain.value = 0.28;
    g.connect(lp); lp.connect(out); lp.connect(dl); dl.connect(fb).connect(dl); dl.connect(out);
    for (const [r, a, dec] of partials) {
      const o = ac.createOscillator(), e = ac.createGain();
      o.frequency.value = f0 * r * (1 + (Math.random() - 0.5) * 0.004);
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(a, t + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, t + dec * 2.2);
      o.connect(e).connect(g); o.start(t); o.stop(t + dec * 2.3);
    }
  }
  function bells(n) {
    if (!ac) return;
    const t = ac.currentTime + 0.1, tones = [392, 330, 294, 262];
    for (let i = 0; i < n; i++) strike(t + i * 1.35 + Math.random() * 0.1, tones[i % 2 === 0 ? 0 : 1 + ((Math.random() * 3) | 0)], 0.09);
  }
  function coo() {
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(), v = ac.createOscillator(), vg = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(520, t + 0.25); o.frequency.linearRampToValueAtTime(380, t + 0.7);
    v.frequency.value = 28; vg.gain.value = 18; v.connect(vg).connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.1); g.gain.linearRampToValueAtTime(0.015, t + 0.4); g.gain.linearRampToValueAtTime(0, t + 0.75);
    o.connect(g).connect(out); o.start(t); v.start(t); o.stop(t + 0.8); v.stop(t + 0.8);
  }
  function step(run) {
    if (!ac || !on) return;
    const t = ac.currentTime, s = ac.createBufferSource(); s.buffer = noise;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700 + Math.random() * 500; f.Q.value = 1.2;
    const g = ac.createGain(); g.gain.setValueAtTime(run ? 0.14 : 0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 1.5, 0.1);
  }
  // animal voices; vol 0..1 already includes distance
  function voice(type, f0, f1, dur, vol, fq, t0 = 0) {
    if (!ac || !on || vol <= 0) return;
    const t = ac.currentTime + t0, o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.type = 'bandpass'; f.frequency.value = fq; f.Q.value = 1.4;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.03, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  const bark = (v) => { v = Math.max(0, v) * 0.35; voice('sawtooth', 420, 260, 0.14, v, 900); voice('sawtooth', 400, 240, 0.16, v, 900, 0.22); };
  const meow = (v) => { v = Math.max(0, v) * 0.18; voice('sawtooth', 520, 760, 0.25, v, 1400); voice('sawtooth', 760, 430, 0.4, v, 1300, 0.22); };
  const chirp = (v) => { for (let i = 0; i < 4; i++) voice('sine', 4200 + Math.random() * 800, 6200, 0.06, v * 0.05, 5000, i * 0.09 + Math.random() * 0.04); };
  const arf = (v) => { v = Math.max(0, v) * 0.3; for (let i = 0; i < 3; i++) voice('sawtooth', 300, 170, 0.18, v, 650, i * 0.3); };
  function toggle() { on = !on; if (out) out.gain.setTargetAtTime(on ? 0.8 : 0, ac.currentTime, 0.1); }
  return { start, bells, step, toggle, bark, meow, chirp, arf };
})();
