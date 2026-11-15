// Lokashaka character in the VS Code panel: walks on the floor, sits on a mini terminal, reacts to events, loves headpats.
(() => {
  const vscode = acquireVsCodeApi();
  const { char: CHAR, sheet: SHEET_URL } = window.LOKASHAKA;
  const [CW, CH] = CHAR.cell;
  const S = CHAR.states;

  const TEXT = {
    en: {
      signin: `Sign in to bring ${CHAR.name} here.`, signin_btn: 'Sign in',
      buy: `You don't own ${CHAR.name} yet. The desktop app has a free trial.`, buy_btn: `Get ${CHAR.name}`,
      off: `${CHAR.name} is turned off.`, off_btn: 'Turn on',
      command: 'The command', file: 'The file', host: 'The site',
      time: ['morning', 'afternoon', 'evening', 'night'],
    },
    id: {
      signin: `Masuk untuk membawa ${CHAR.name} ke sini.`, signin_btn: 'Masuk',
      buy: `Kamu belum memiliki ${CHAR.name}. Aplikasi desktop punya trial gratis.`, buy_btn: `Dapatkan ${CHAR.name}`,
      off: `${CHAR.name} sedang dimatikan.`, off_btn: 'Nyalakan',
      command: 'Perintahnya', file: 'Filenya', host: 'Situsnya',
      time: ['pagi', 'siang', 'sore', 'malam'],
    },
  };
  let lang = 'en';
  const t = (key) => TEXT[lang][key];

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const bubble = document.getElementById('bubble');
  const gate = document.getElementById('gate');
  const gateText = document.getElementById('gate-text');
  const gateBtn = document.getElementById('gate-btn');

  const img = new Image();
  let rows = 0;
  let loaded = false;
  let active = false;
  let running = false;
  let greeted = false;

  const pet = { x: 80, top: 0, targetX: null, sitUntil: 0, oneshot: null, loops: 0, shown: null, frame: 0, acc: 0 };
  const flags = { typingUntil: 0, debugging: false, sleeping: false };
  const mouse = { x: 0, y: 0, movedAt: 0 };
  let width = 0, height = 0, spriteW = 0, spriteH = 0, box = null;
  let bubbleTimer = null, nextIdea = performance.now() + 4000;

  // ---------- size ----------
  function resize() {
    if (!stage.clientWidth || !stage.clientHeight) return;
    const dpr = window.devicePixelRatio || 1;
    width = stage.clientWidth;
    height = stage.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    spriteH = Math.max(70, Math.min(CH, height - 6));
    spriteW = spriteH * CW / CH;
    const bw = Math.round(spriteW * 0.62);
    const bh = Math.round(spriteH * 0.3);
    box = { x: width - bw / 2 - 16, w: bw, h: bh, top: height - bh };
    pet.x = Math.min(Math.max(pet.x, spriteW / 2), width - spriteW / 2);
  }
  new ResizeObserver(resize).observe(stage);

  // ---------- state ----------
  const resolve = (name) => {
    while (S[name].row >= rows) name = S[name].fallback || 'idle';
    return name;
  };
  const seated = (name) => 'seat' in S[resolve(name)];
  const atBox = () => Math.abs(pet.x - box.x) < 2;

  function wanted() {
    const now = performance.now();
    if (flags.sleeping) return 'sleeping';
    if (flags.debugging) return 'debugging';
    if (now < flags.typingUntil) return 'typing';
    if (now < pet.sitUntil) return 'sitting';
    return 'idle';
  }

  function baseState() {
    let name = wanted();
    if (seated(name) && !atBox()) {
      pet.targetX = box.x; // walk to the mini terminal first
      name = 'idle';
    }
    if (pet.targetX !== null) {
      if (Math.abs(pet.targetX - pet.x) < 2) {
        pet.x = pet.targetX;
        pet.targetX = null;
      } else {
        return pet.targetX > pet.x ? 'running-right' : 'running-left';
      }
    }
    return name;
  }

  function play(name, loops = 1) {
    pet.oneshot = name;
    pet.loops = loops;
    pet.shown = null;
  }

  function idea(now) {
    if (now < nextIdea) return;
    nextIdea = now + 8000 + Math.random() * 12000;
    if (pet.oneshot || pet.targetX !== null || wanted() !== 'idle') return;
    const r = Math.random();
    if (r < 0.4) pet.targetX = spriteW / 2 + Math.random() * Math.max(1, box.x - box.w - spriteW / 2);
    else if (r < 0.75) pet.sitUntil = now + 20000 + Math.random() * 25000;
    else if (r < 0.85) play('waving');
  }

  // ---------- drawing ----------
  function drawBox() {
    const { x, w, h, top } = box;
    const left = x - w / 2;
    ctx.fillStyle = '#0b1a45';
    ctx.strokeStyle = '#a8853f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(left, top, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#d9bb75';
    ctx.font = `bold ${Math.max(9, Math.round(h * 0.32))}px monospace`;
    ctx.fillText('>_', left + 7, top + h * 0.62);
    for (const [i, c] of ['#ff6b6b', '#ffd166', '#06d6a0'].entries()) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(left + w - 8 - i * 8, top + 7, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function lookIndex(name, y) {
    if (name !== 'idle' || performance.now() - mouse.movedAt > 2500) return null;
    const dx = mouse.x - pet.x;
    const dy = mouse.y - (y + spriteH * 0.28);
    if (Math.hypot(dx, dy) < spriteW * 0.35) return null;
    return Math.round((((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) / 22.5) % 16;
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    drawBox();
    const name = pet.shown;
    const s = S[name];
    const anchorY = 'seat' in s ? box.top : height - 2;
    const y = anchorY - (s.seat ?? CHAR.feet) * spriteH;
    pet.top = y;
    let row = s.row;
    let col = pet.frame % s.frames;
    const look = lookIndex(name, y);
    if (look !== null) {
      row = CHAR.look_rows[Math.floor(look / 8)];
      col = look % 8;
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, col * CW, row * CH, CW, CH, pet.x - spriteW / 2, y, spriteW, spriteH);
    placeBubble(y);
  }

  function placeBubble(spriteTop) {
    if (bubble.hidden) return;
    const bw = bubble.offsetWidth;
    const left = Math.min(Math.max(4, pet.x - bw / 2), width - bw - 4);
    const top = Math.max(4, spriteTop + spriteH * 0.04 - bubble.offsetHeight - 8);
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    bubble.style.setProperty('--tail', `${Math.min(Math.max(14, pet.x - left), bw - 14)}px`);
  }

  // ---------- loop ----------
  let last = performance.now();
  function loop(now) {
    if (!active) {
      running = false;
      return;
    }
    const dt = Math.min(100, now - last);
    last = now;
    if (!box) resize();
    if (box) {
      idea(now);
      const name = resolve(pet.oneshot || baseState());
      if (name !== pet.shown) {
        pet.shown = name;
        pet.frame = 0;
        pet.acc = 0;
      }
      if (name.startsWith('running-') && pet.targetX !== null) {
        const step = (spriteH * 0.45 * dt) / 1000;
        pet.x += name === 'running-right' ? Math.min(step, pet.targetX - pet.x) : -Math.min(step, pet.x - pet.targetX);
      }
      pet.acc += dt;
      while (pet.acc >= S[name].ms) {
        pet.acc -= S[name].ms;
        pet.frame++;
        if (pet.frame >= S[name].frames) {
          pet.frame = 0;
          if (pet.oneshot && --pet.loops <= 0) pet.oneshot = null;
        }
      }
      draw();
    }
    requestAnimationFrame(loop);
  }

  function start() {
    if (running || !loaded) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  // ---------- speech ----------
  function say(text) {
    bubble.textContent = text;
    bubble.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => (bubble.hidden = true), Math.min(Math.max(4000 + text.length * 60, 5000), 20000));
  }

  function react(kind, ev = {}) {
    const r = CHAR.reactions[kind];
    if (!r) return;
    const fields = { command: t('command'), file: t('file'), host: t('host') };
    for (const [k, v] of Object.entries(ev)) {
      if (k === 'type' || v === null || typeof v === 'object') continue;
      const line = String(v).split('\n')[0];
      fields[k] = line.length > 40 ? `${line.slice(0, 37)}…` : line;
    }
    const lines = (lang === 'en' && CHAR.linesEn?.[kind]) || r.lines;
    const line = lines[Math.floor(Math.random() * lines.length)];
    say(line.replace(/\{(\w+)\}/g, (_, k) => fields[k] ?? ''));
    pet.sitUntil = 0;
    play(r.state, 2);
  }

  function greet() {
    if (greeted) return;
    greeted = true;
    const h = new Date().getHours();
    const part = h >= 4 && h < 11 ? 0 : h >= 11 && h < 15 ? 1 : h >= 15 && h < 18 ? 2 : 3;
    react('greeting', { waktu: t('time')[part] });
  }

  // ---------- show the character, or explain why she is not here ----------
  let gateAction = null;
  function applyState(state) {
    lang = state.language === 'id' ? 'id' : 'en';
    active = state.active;
    stage.hidden = !active;
    gate.hidden = active;
    if (active) {
      resize();
      start();
      if (loaded) greet();
      return;
    }
    bubble.hidden = true;
    const [text, btn, cmd] = !state.signedIn ? ['signin', 'signin_btn', 'signin']
      : !state.owned ? ['buy', 'buy_btn', 'store'] : ['off', 'off_btn', 'turn-on'];
    gateText.textContent = t(text);
    gateBtn.textContent = t(btn);
    gateAction = cmd;
  }
  gateBtn.addEventListener('click', () => vscode.postMessage({ cmd: gateAction }));

  // ---------- messages from the extension ----------
  window.addEventListener('message', ({ data }) => {
    if (data.cmd === 'state') {
      applyState(data);
    } else if (data.cmd === 'event' && active) {
      const ev = data.event;
      if (ev.type === 'sleep') {
        flags.sleeping = true;
        return;
      }
      const wasSleeping = flags.sleeping;
      flags.sleeping = false;
      if (ev.type === 'typing') flags.typingUntil = performance.now() + 4000;
      else if (ev.type === 'debug') {
        flags.debugging = !!ev.active;
        if (ev.active) react('debug-start', ev);
      } else if (ev.type !== 'wake' || wasSleeping) react(ev.type, ev);
    }
  });

  // ---------- input ----------
  stage.addEventListener('mousemove', (e) => {
    const r = stage.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.movedAt = performance.now();
    vscode.postMessage({ cmd: 'activity' });
  });
  canvas.addEventListener('click', (e) => {
    const onPet = Math.abs(e.offsetX - pet.x) < spriteW * 0.35;
    if (onPet && e.offsetY >= pet.top && e.offsetY < pet.top + spriteH * 0.3) {
      react('headpat');
      return;
    }
    if (onPet) react('poke');
  });

  img.onload = () => {
    rows = Math.floor(img.height / CH);
    loaded = true;
    resize();
    if (box) pet.x = box.x - box.w - spriteW / 2;
    if (active) {
      start();
      greet();
    }
  };
  img.src = SHEET_URL;
  vscode.postMessage({ cmd: 'ready' });
})();
