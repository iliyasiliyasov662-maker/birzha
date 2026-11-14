/* Простые синтезированные звуки (WebAudio) — без аудиофайлов. */
(function (root) {
  'use strict';
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('avalon-mute') === '1'; } catch (e) {}

  function ac() {
    if (!ctx) { try { ctx = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, opts) {
    if (muted) return;
    const c = ac(); if (!c) return;
    opts = opts || {};
    const t = c.currentTime + (opts.delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol || 0.18, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  const S = {
    click: () => tone(660, 0.08, { type: 'triangle', vol: 0.08 }),
    select: () => tone(880, 0.1, { type: 'triangle', vol: 0.1 }),
    turn: () => { tone(523, 0.25, { type: 'triangle' }); tone(784, 0.35, { type: 'triangle', delay: 0.12 }); },
    flip: () => tone(300, 0.12, { type: 'square', vol: 0.05, slide: 900 }),
    approve: () => { tone(523, 0.3, { type: 'triangle' }); tone(659, 0.3, { type: 'triangle', delay: .1 }); tone(784, 0.5, { type: 'triangle', delay: .2 }); },
    reject: () => { tone(330, 0.4, { type: 'sawtooth', vol: .07 }); tone(247, 0.6, { type: 'sawtooth', vol: .07, delay: .15 }); },
    success: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, { type: 'triangle', delay: i * 0.12, vol: .16 })),
    fail: () => [392, 370, 311, 233].forEach((f, i) => tone(f, 0.6, { type: 'sawtooth', delay: i * 0.16, vol: .07 })),
    victory: () => [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.45, { type: 'triangle', delay: i * 0.14, vol: .17 })),
    doom: () => [196, 185, 156, 117].forEach((f, i) => tone(f, 0.9, { type: 'sawtooth', delay: i * 0.25, vol: .08 })),
    chat: () => tone(1200, 0.06, { type: 'sine', vol: .05 }),
  };
  root.AvalonSound = {
    play: name => { try { S[name] && S[name](); } catch (e) {} },
    get muted() { return muted; },
    toggle() { muted = !muted; try { localStorage.setItem('avalon-mute', muted ? '1' : '0'); } catch (e) {} if (!muted) S.click(); return muted; },
  };
})(window);
