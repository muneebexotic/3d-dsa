// Playback controls, the narration placard, keyboard shortcuts and the help card.
// Every chapter uses the same markup ids, so the pieces look and behave the same.

const $ = id => document.getElementById(id);
export const SPEEDS = [0.25, 0.5, 1, 2, 4];

const ICON = {
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 5 L8 12 L18 19 Z"/><path d="M5 5 L5 19"/></svg>',
  fwd: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 5 L16 12 L6 19 Z"/><path d="M19 5 L19 19"/></svg>',
  pause: '<svg id="icPause" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  play: '<svg id="icPlay" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" hidden><path d="M8 5 L19 12 L8 19 Z"/></svg>',
  replay: '<svg id="icReplay" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" hidden><path d="M4 12 A8 8 0 1 0 7 5.8"/><path d="M3.5 4 L7 5.8 L5.5 9.4"/></svg>',
};

// Fills #transport and wires it to a Player.
//   tickClass(step, k, steps) extra classes for a timeline tick ('rot', 'key', 'gap')
export function mountTransport(container, player, { onGesture = () => {}, tickClass = () => '' } = {}) {
  container.innerHTML = `<div class="bar card">
      <button class="icon" id="bBack" type="button" aria-label="Step back">${ICON.back}</button>
      <button class="icon" id="bPlay" type="button" aria-label="Pause">${ICON.pause}${ICON.play}${ICON.replay}</button>
      <button class="icon" id="bFwd" type="button" aria-label="Step forward">${ICON.fwd}</button>
      <div id="timeline" role="group" aria-label="Steps"></div>
      <div id="speed" role="group" aria-label="Speed">${SPEEDS.map(s => `<button type="button" data-s="${s}" aria-pressed="${s === 1}">${s}×</button>`).join('')}</div>
      <button class="icon" id="speedCycle" type="button" aria-label="Speed 1×">1×</button>
    </div>`;
  const timeline = $('timeline');
  let ticks = [];
  $('bPlay').addEventListener('click', () => player.togglePlay());
  $('bBack').addEventListener('click', () => player.stepBy(-1));
  $('bFwd').addEventListener('click', () => { onGesture(); player.stepBy(1); });
  function setSpeed(s) {
    player.speed = s;
    container.querySelectorAll('#speed button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.s === s)));
    const label = `${s}×`; $('speedCycle').textContent = label; $('speedCycle').setAttribute('aria-label', `Speed ${label}`);
  }
  container.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.s)));
  $('speedCycle').addEventListener('click', () => setSpeed(SPEEDS[(SPEEDS.indexOf(player.speed) + 1) % SPEEDS.length]));
  return {
    setSpeed,
    build() {
      const steps = player.prog.steps;
      timeline.innerHTML = '';
      timeline.classList.toggle('dense', steps.length > 40);
      timeline.classList.toggle('xdense', steps.length > 110);
      ticks = steps.map((s, k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = ('tick ' + tickClass(s, k, steps)).trim();
        b.setAttribute('aria-label', `Step ${k + 1}: ${s.head}`);
        b.addEventListener('click', () => { onGesture(); player.seek(k); });
        timeline.appendChild(b);
        return b;
      });
      timeline.hidden = steps.length === 0;
    },
    mark(i) { ticks.forEach((b, k) => { b.classList.toggle('past', k <= i); b.classList.toggle('now', k === i); }); },
    updatePlayUI() {
      const n = player.prog.steps.length, end = player.atEnd() && n > 0;
      $('icPause').toggleAttribute('hidden', !player.playing);
      $('icPlay').toggleAttribute('hidden', player.playing || end);
      $('icReplay').toggleAttribute('hidden', player.playing || !end);
      $('bPlay').setAttribute('aria-label', player.playing ? 'Pause' : end ? 'Replay' : 'Play');
      $('bPlay').disabled = n === 0;
      $('bBack').disabled = n === 0;
      $('bFwd').disabled = n === 0;
    },
  };
}

// The narration card: an eyebrow line, a headline, a body and optional chips.
export function placard() {
  const els = { opname: $('opname'), stepno: $('stepno'), head: $('head'), body: $('body'), chips: $('chips') };
  return {
    els,
    set({ op = '', stepno = '', head = '', body = '', chips = '' }) {
      els.opname.textContent = op;
      els.stepno.textContent = stepno;
      els.head.textContent = head;
      els.body.textContent = body;
      if (els.chips) els.chips.innerHTML = chips;
    },
  };
}

// Space plays or pauses, arrows step, ? opens help, Escape closes things.
export function bindKeys({ player, isTyping = () => false, onEscape = () => {}, onHelp = () => {}, onGesture = () => {} }) {
  addEventListener('keydown', e => {
    const typing = isTyping(e);
    if (e.key === 'Escape') { onEscape(e, typing); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === ' ') { e.preventDefault(); player.togglePlay(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onGesture(); player.stepBy(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); player.stepBy(-1); }
    else if (e.key === '?') onHelp();
  });
}

export function bindHelp() {
  const help = $('help');
  const open = () => { help.hidden = false; $('helpClose').focus(); };
  const close = () => { help.hidden = true; };
  $('bHelp').addEventListener('click', open);
  $('helpClose').addEventListener('click', close);
  help.addEventListener('click', e => { if (e.target === help) close(); });
  return { open, close, isOpen: () => !help.hidden };
}

// The small label that follows the action on screen.
export function calloutPlacer(camera, THREE) {
  const el = $('callout'), v = new THREE.Vector3();
  return c => {
    if (!c || c.a < 0.02) { el.style.opacity = 0; return; }
    if (el.textContent !== c.text) el.textContent = c.text;
    const cls = c.tone === 'red' ? 'red' : c.tone === 'cobalt' ? 'cobalt' : '';
    if (el.className !== cls) el.className = cls;
    v.set(c.x + (c.side === 'l' ? -c.off : c.off), c.y, c.z || 0).project(camera);
    const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${c.side === 'l' ? '-100%' : '0'}, -50%)`;
    el.style.opacity = c.a.toFixed(3);
  };
}
