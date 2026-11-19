// Sound, haptics and visual burst effects, ported from the Neon Edge mockup (non-glitch).
// No DOM access at module top level.
let ctx;

function synth(up) {
  try {
    if (ctx && ctx.state === 'closed') ctx = undefined;
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state !== 'running') ctx.resume(); // iOS may report 'suspended' or 'interrupted'
    const t0 = ctx.currentTime, out = ctx.createGain();
    out.gain.value = 0.22; out.connect(ctx.destination);
    // filtered saw sweep
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; f.type = 'lowpass'; f.Q.value = 12;
    o.frequency.setValueAtTime(up ? 110 : 220, t0); o.frequency.exponentialRampToValueAtTime(up ? 220 : 110, t0 + 0.25);
    f.frequency.setValueAtTime(up ? 300 : 3000, t0); f.frequency.exponentialRampToValueAtTime(up ? 4000 : 250, t0 + 0.3);
    g.gain.setValueAtTime(0.0, t0); g.gain.linearRampToValueAtTime(0.9, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45);
    o.connect(f).connect(g).connect(out); o.start(t0); o.stop(t0 + 0.5);
    // bright confirm arpeggio
    (up ? [880, 1318.5, 1760] : [1318.5, 880]).forEach((fr, i) => {
      const s = ctx.createOscillator(), sg = ctx.createGain(), t = t0 + 0.12 + i * 0.07;
      s.type = 'square'; s.frequency.value = fr;
      sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.25, t + 0.005); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      s.connect(sg).connect(out); s.start(t); s.stop(t + 0.2);
    });
    // sub thump
    const k = ctx.createOscillator(), kg = ctx.createGain();
    k.frequency.setValueAtTime(140, t0); k.frequency.exponentialRampToValueAtTime(40, t0 + 0.15);
    kg.gain.setValueAtTime(1, t0); kg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
    k.connect(kg).connect(out); k.start(t0); k.stop(t0 + 0.22);
  } catch (e) { /* audio unavailable: ignore */ }
}

export function playStart() { synth(true); }
export function playStop() { synth(false); }

// iOS 18 Safari fires a haptic tick when a <input type=checkbox switch> is toggled.
export function hapticTick() {
  try {
    const label = document.querySelector('#haptic');
    if (label) label.click();
  } catch (e) { /* no-op */ }
}

export function setSilentMode(on) {
  try {
    if (typeof navigator !== 'undefined' && navigator.audioSession) {
      navigator.audioSession.type = on ? 'playback' : 'auto';
    }
  } catch (e) { /* no-op */ }
}

export function burst(container, origin, color) {
  const pr = container.getBoundingClientRect(), br = origin.getBoundingClientRect();
  const cx = br.left - pr.left + br.width / 2, cy = br.top - pr.top + br.height / 2;
  const fl = container.querySelector('.flash');
  if (fl) {
    fl.style.background = color;
    fl.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
  }
  [0, 90].forEach((delay) => setTimeout(() => {
    const r = document.createElement('div');
    r.className = 'ring'; r.style.setProperty('--col', color);
    r.style.left = cx + 'px'; r.style.top = cy + 'px';
    container.appendChild(r); setTimeout(() => r.remove(), 750);
  }, delay));
  const cols = [color, '#22E6FF', '#D4FF3A', '#FF2E88', '#fff'];
  for (let i = 0; i < 28; i++) {
    const s = document.createElement('div'); s.className = 'shard';
    const a = Math.PI * 2 * i / 28 + Math.random() * 0.2, dist = 110 + Math.random() * 90;
    s.style.left = cx + 'px'; s.style.top = cy + 'px'; s.style.setProperty('--col', cols[i % cols.length]);
    s.style.setProperty('--dx', Math.cos(a) * dist + 'px'); s.style.setProperty('--dy', Math.sin(a) * dist + 'px');
    s.style.setProperty('--r', (a * 57 + 90) + 'deg'); s.style.transform = 'rotate(' + (a * 57 + 90) + 'deg)';
    container.appendChild(s); setTimeout(() => s.remove(), 700);
  }
  origin.classList.remove('slam'); void origin.offsetWidth; origin.classList.add('slam');
}
