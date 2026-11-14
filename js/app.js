/* Avalon — интерфейс и сетевая логика (хост / клиент). */
(function () {
  'use strict';
  const E = window.AvalonEngine, B = window.AvalonBots, A = window.AvalonArt, N = window.AvalonNet, SND = window.AvalonSound;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const rid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  const token = LS.get('avalon-token') || (() => { const t = rid(); LS.set('avalon-token', t); return t; })();
  const HOST_SAVE = 'avalon-host-save-v1', CLIENT_SAVE = 'avalon-client-save-v1';

  const app = {
    mode: null, offline: false, S: null, code: null, myId: null, view: null,
    peer: null, conn: null, conns: new Set(), tokens: {},
    screen: null, tab: 'chat', unread: false, target: null, cardHidden: false,
    botTimer: null, botMemo: {}, transKey: null, shown: {}, overlayType: null,
    reconnecting: false, chatLen: 0, logLen: 0, leaving: false,
  };

  // ============ утилиты ============
  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'err' ? ' err' : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, type === 'err' ? 4200 : 2800);
  }
  function copy(text) {
    const done = () => toast('Ссылка скопирована — отправьте её друзьям');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => prompt('Скопируйте ссылку:', text));
    else prompt('Скопируйте ссылку:', text);
  }
  const PS = new URLSearchParams(location.search).get('ps');
  const roomQuery = code => '?room=' + code + (PS ? '&ps=' + encodeURIComponent(PS) : '');
  const inviteLink = () => location.origin + location.pathname + roomQuery(app.code);
  const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 18);
  const pById = (v, id) => v.players.find(p => p.id === id);
  const pIdx = (v, id) => v.players.findIndex(p => p.id === id);
  const nameOf = (v, id) => { const p = pById(v, id); return p ? p.name : '?'; };
  const avatarOf = (v, id) => A.avatar(nameOf(v, id), Math.max(0, pIdx(v, id)));
  const roleName = r => E.ROLES[r].name;

  // ============ ХОСТ ============
  const hostHandlers = {
    onData(conn, m) {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hello') return handleHello(conn, m);
      if (!app.conns.has(conn)) return;
      if (m.t === 'act' && conn.pid && m.a && typeof m.a.type === 'string') hostDispatch(conn.pid, m.a, conn);
      else if (m.t === 'chat') addChat(conn.pid, String(m.text || ''), conn.name);
      else if (m.t === 'leave') { app.conns.delete(conn); removeOrDisconnect(conn.pid, true); afterChange(); }
    },
    onClose(conn) {
      if (!app.conns.has(conn)) return;
      app.conns.delete(conn);
      removeOrDisconnect(conn.pid, false);
      afterChange();
    },
  };

  function uniqueName(name, exceptId) {
    const S = app.S;
    let n = name || 'Рыцарь', k = 2;
    while (S.players.some(p => p.id !== exceptId && p.name.toLowerCase() === n.toLowerCase())) n = `${name} ${k++}`;
    return n;
  }

  function handleHello(conn, m) {
    const S = app.S;
    const name = cleanName(m.name) || 'Рыцарь';
    const tok = String(m.token || '');
    let pid = app.tokens[tok];
    let p = pid && S.players.find(x => x.id === pid);
    if (p) {
      p.connected = true;
      if (p.botified) { p.bot = false; p.botified = false; }
      if (S.phase === 'lobby' && p.name !== name) p.name = uniqueName(name, p.id);
      sysChat(`${p.name} снова за столом`);
    } else if (S.phase === 'lobby') {
      if (S.players.length >= E.MAX_PLAYERS) { conn.send({ t: 'error', msg: 'Комната заполнена (10 игроков)', fatal: true }); return; }
      pid = rid();
      app.tokens[tok] = pid;
      p = { id: pid, name: uniqueName(name) };
      S.players.push(p);
      sysChat(`${p.name} присоединился к столу`);
    } else {
      pid = null; // зритель
    }
    for (const c of [...app.conns]) if (c !== conn && c.token === tok) { app.conns.delete(c); try { c.close(); } catch (e) {} }
    conn.pid = pid; conn.token = tok; conn.name = p ? p.name : name + ' (зритель)';
    app.conns.add(conn);
    conn.send({ t: 'welcome', pid, code: app.code });
    afterChange();
  }

  function removeOrDisconnect(pid, leaving) {
    const S = app.S;
    const p = pid && S.players.find(x => x.id === pid);
    if (!p) return;
    if (S.phase === 'lobby') {
      S.players = S.players.filter(x => x.id !== pid);
      for (const k in app.tokens) if (app.tokens[k] === pid) delete app.tokens[k];
      sysChat(`${p.name} покинул стол`);
    } else {
      p.connected = false;
      sysChat(`${p.name} ${leaving ? 'вышел из игры' : 'отключился'}`);
    }
  }

  function sysChat(text) { addChat(null, text); }
  function addChat(pid, text, fallbackName) {
    text = text.trim().slice(0, 300);
    if (!text) return;
    const S = app.S;
    const p = pid && S.players.find(x => x.id === pid);
    S.chat.push({ t: Date.now(), from: pid ? (p ? p.name : fallbackName) : (fallbackName || null), pid, text });
    if (S.chat.length > 150) S.chat.splice(0, S.chat.length - 150);
    afterChange();
  }

  function addBot() {
    const S = app.S;
    const used = new Set(S.players.map(p => p.name));
    const free = B.BOT_NAMES.filter(n => !used.has(n));
    const name = free.length ? free[Math.floor(Math.random() * free.length)] : uniqueName('Бот');
    S.players.push({ id: 'bot-' + rid(), name, bot: true });
  }

  function hostDispatch(pid, a, conn) {
    const S = app.S;
    const isHost = pid === app.myId;
    const fail = msg => { if (isHost) toast(msg, 'err'); else if (conn) conn.send({ t: 'error', msg }); };
    switch (a.type) {
      case 'addBot':
        if (!isHost || S.phase !== 'lobby') return;
        if (S.players.length >= E.MAX_PLAYERS) return fail('Максимум 10 игроков');
        addBot(); return afterChange();
      case 'kick': {
        if (!isHost || S.phase !== 'lobby' || a.pid === app.myId) return;
        for (const c of [...app.conns]) if (c.pid === a.pid) { c.send({ t: 'error', msg: 'Хост убрал вас из комнаты', fatal: true }); app.conns.delete(c); setTimeout(() => c.close(), 300); }
        S.players = S.players.filter(p => p.id !== a.pid);
        for (const k in app.tokens) if (app.tokens[k] === a.pid) delete app.tokens[k];
        return afterChange();
      }
      case 'botify': {
        if (!isHost || S.phase === 'lobby') return;
        const p = S.players.find(x => x.id === a.pid);
        if (p && !p.bot) { p.bot = true; p.botified = true; sysChat(`Бот играет вместо ${p.name}, пока игрок не вернётся`); }
        return afterChange();
      }
      case 'shuffleSeats': {
        if (!isHost || S.phase !== 'lobby') return;
        S.players = E.shuffle(S.players); return afterChange();
      }
    }
    const err = E.apply(S, pid, a, isHost);
    if (err) return fail(err);
    if (a.type === 'start' || a.type === 'newGame' || a.type === 'abort') { app.botMemo = {}; app.transKey = null; }
    afterChange();
  }

  function afterChange() {
    const S = app.S;
    if (!S) return;
    for (const c of app.conns) { try { c.send({ t: 'view', v: E.viewFor(S, c.pid) }); } catch (e) {} }
    LS.set(HOST_SAVE, { code: app.code, offline: app.offline, S, tokens: app.tokens, myId: app.myId, t: Date.now() });
    onView(E.viewFor(S, app.myId));
    scheduleTransitions();
    scheduleBots();
  }

  function scheduleTransitions() {
    const S = app.S;
    if (S.phase !== 'voteResult' && S.phase !== 'questResult') return;
    const key = `${S.gameNo}:${S.phase}:${S.questNum}:${S.history.length}`;
    if (app.transKey === key) return;
    app.transKey = key;
    const delay = S.phase === 'voteResult' ? 3400 + S.players.length * 180 : 3200 + S.team.length * 800;
    setTimeout(() => {
      if (app.S !== S || `${S.gameNo}:${S.phase}:${S.questNum}:${S.history.length}` !== key) return;
      E.advance(S);
      afterChange();
    }, delay);
  }

  function scheduleBots() {
    clearTimeout(app.botTimer);
    const S = app.S;
    if (!S.roles || S.phase === 'lobby' || S.phase === 'end') return;
    const todo = S.players.filter(p => p.bot && B.botAction(E.viewFor(S, p.id)));
    if (!todo.length) return;
    const p = todo[Math.floor(Math.random() * todo.length)];
    const base = { reveal: 500, vote: 600, quest: 800, team: 1400, lady: 1800, assassin: 2500 }[S.phase] || 1000;
    app.botTimer = setTimeout(() => {
      if (app.S !== S) return;
      let act = B.botAction(E.viewFor(S, p.id));
      if (!act) return scheduleBots();
      if (act.type === 'propose') {
        // сначала показываем выбор состава, потом предлагаем
        const key = `${S.gameNo}:${S.questNum}:${S.reject}`;
        const memo = app.botMemo[p.id];
        if (!memo || memo.key !== key) {
          app.botMemo[p.id] = { key, team: act.team };
          E.apply(S, p.id, { type: 'setTeam', team: act.team }, false);
          return afterChange();
        }
        act = { type: 'propose', team: memo.team };
      }
      hostDispatch(p.id, act);
    }, base * (0.7 + Math.random() * 0.8));
  }

  async function startHosting(code, retries) {
    for (let i = 0; i < retries; i++) {
      try { return await N.host(code, hostHandlers); }
      catch (e) {
        if (i === retries - 1) throw e;
        await new Promise(r => setTimeout(r, 2500));
      }
    }
  }

  async function createRoom(offline) {
    const name = readName();
    if (!name) return;
    app.mode = 'host'; app.offline = offline;
    app.S = E.newState();
    app.myId = rid();
    app.tokens = { [token]: app.myId };
    app.S.players.push({ id: app.myId, name, host: true });
    if (offline) {
      for (let i = 0; i < 5; i++) addBot();
      app.code = null;
      afterChange();
      return;
    }
    renderLoading('Создаём комнату…');
    let err;
    for (let i = 0; i < 4; i++) {
      const code = N.genCode();
      try { app.peer = await N.host(code, hostHandlers); app.code = code; break; }
      catch (e) { err = e; if (!/занят/.test(e.message)) break; }
    }
    if (!app.peer) { toast(err ? err.message : 'Не удалось создать комнату', 'err'); resetToHome(); return; }
    history.replaceState(null, '', roomQuery(app.code));
    sysChat('Комната создана. Пригласите друзей по ссылке!');
  }

  async function resumeHost() {
    const save = LS.get(HOST_SAVE);
    if (!save) return;
    app.mode = 'host'; app.offline = !!save.offline; app.S = save.S; app.tokens = save.tokens; app.myId = save.myId; app.code = save.code;
    app.S.players.forEach(p => { if (!p.bot && p.id !== app.myId) p.connected = false; });
    if (app.S.phase === 'lobby') app.S.players = app.S.players.filter(p => p.bot || p.id === app.myId);
    if (!app.offline) {
      renderLoading('Восстанавливаем комнату ' + app.code + '…');
      try { app.peer = await startHosting(app.code, 8); }
      catch (e) { toast('Не удалось открыть комнату: ' + e.message, 'err'); resetToHome(); return; }
      history.replaceState(null, '', roomQuery(app.code));
    }
    afterChange();
  }

  // ============ КЛИЕНТ ============
  const clientHandlers = {
    onData(m) {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'welcome') {
        app.myId = m.pid;
        if (m.pid == null) toast('Игра уже идёт — вы подключены как зритель');
      } else if (m.t === 'view') {
        onView(m.v);
      } else if (m.t === 'error') {
        toast(m.msg, 'err');
        if (m.fatal) { app.leaving = true; LS.del(CLIENT_SAVE); resetToHome(); }
      }
    },
    onClose() {
      if (app.leaving || app.mode !== 'client') return;
      reconnect(0);
    },
  };

  async function joinRoom(code, name, silent) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) return toast('Введите код комнаты', 'err');
    app.mode = 'client'; app.code = code; app.leaving = false;
    if (!silent) renderLoading('Подключаемся к комнате ' + code + '…');
    try {
      const r = await N.join(code, clientHandlers);
      app.peer = r.peer; app.conn = r.conn;
      r.conn.send({ t: 'hello', token, name });
      LS.set(CLIENT_SAVE, { code, name, t: Date.now() });
      history.replaceState(null, '', roomQuery(code));
      setReconnecting(false);
      return true;
    } catch (e) {
      if (silent) return false;
      toast(e.message, 'err');
      resetToHome();
      return false;
    }
  }

  async function reconnect(attempt) {
    if (app.leaving || app.mode !== 'client') return;
    setReconnecting(true);
    try { app.peer && app.peer.destroy(); } catch (e) {}
    const save = LS.get(CLIENT_SAVE, {});
    const ok = await joinRoom(app.code, save.name || readName(true), true);
    if (ok) { toast('Соединение восстановлено'); return; }
    if (attempt > 40) { setReconnecting(false); toast('Хост недоступен', 'err'); resetToHome(); return; }
    setTimeout(() => reconnect(attempt + 1), 2500);
  }

  function setReconnecting(on) {
    app.reconnecting = on;
    let el = $('#connBanner');
    if (on && !el) { el = document.createElement('div'); el.id = 'connBanner'; el.className = 'conn-banner'; el.innerHTML = '<span class="spin"></span>&nbsp; Связь потеряна, переподключаемся…'; document.body.appendChild(el); }
    if (!on && el) el.remove();
  }

  // ============ общие действия ============
  function act(a) {
    SND.play('click');
    if (app.mode === 'host') hostDispatch(app.myId, a);
    else if (app.conn) { try { app.conn.send({ t: 'act', a }); } catch (e) { toast('Нет связи с хостом', 'err'); } }
  }
  function sendChat(text) {
    if (!text.trim()) return;
    if (app.mode === 'host') addChat(app.myId, text);
    else if (app.conn) app.conn.send({ t: 'chat', text });
  }
  function leave() {
    if (app.mode === 'host') {
      for (const c of app.conns) { try { c.send({ t: 'error', msg: 'Хост закрыл комнату', fatal: true }); } catch (e) {} }
      LS.del(HOST_SAVE);
    } else if (app.conn) {
      app.leaving = true;
      try { app.conn.send({ t: 'leave' }); } catch (e) {}
      LS.del(CLIENT_SAVE);
    }
    setTimeout(() => resetToHome(), 200);
  }
  function resetToHome() {
    clearTimeout(app.botTimer);
    try { app.peer && app.peer.destroy(); } catch (e) {}
    Object.assign(app, { mode: null, S: null, peer: null, conn: null, conns: new Set(), view: null, myId: null, screen: null, shown: {}, transKey: null, code: null });
    setReconnecting(false);
    closeOverlay();
    history.replaceState(null, '', location.pathname + (PS ? '?ps=' + encodeURIComponent(PS) : ''));
    renderHome();
  }
  function readName(quiet) {
    const el = $('#nameInput');
    const n = cleanName(el ? el.value : LS.get('avalon-name', ''));
    if (!n) { if (!quiet) { toast('Введите имя', 'err'); el && el.focus(); } return ''; }
    LS.set('avalon-name', n);
    return n;
  }

  // ============ РЕНДЕР: главная ============
  function renderHome() {
    app.screen = 'home';
    $('#topbar').classList.add('hidden');
    const name = LS.get('avalon-name', '');
    const urlRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
    const hs = LS.get(HOST_SAVE), cs = LS.get(CLIENT_SAVE);
    const fresh = s => s && Date.now() - s.t < 6 * 3600e3;
    const fan = ['merlin', 'percival', 'servant', 'morgana', 'assassin'];
    const pos = [[-150, -14, 26], [-75, -7, 8], [0, 0, 0], [75, 7, 8], [150, 14, 26]];
    $('#app').innerHTML = `
      <section class="home">
        <div class="home-card">
          <div class="hero">
            <h1 class="logo">AVALON</h1>
            <p class="tagline">Добро против зла. Верность против обмана.</p>
            <div class="hero-cards">
              ${fan.map((r, i) => A.roleCard(r).replace('<svg class="card-svg"', `<svg class="card-svg" style="transform: translateX(calc(-50% + ${pos[i][0]}px)) rotate(${pos[i][1]}deg) translateY(${pos[i][2]}px); z-index:${i === 2 ? 5 : 5 - Math.abs(i - 2)}"`)).join('')}
            </div>
          </div>
          <div class="panel home-form">
            <h2 class="title">${urlRoom ? 'Вас пригласили за стол' : 'Сесть за Круглый стол'}</h2>
            <div class="stack">
              <div><label class="field" for="nameInput">Ваше имя</label>
                <input type="text" id="nameInput" maxlength="18" placeholder="Например, Ланселот" value="${esc(name)}" autocomplete="nickname"></div>
              ${urlRoom ? `
                <button class="btn primary block" data-act="join">Войти в комнату ${esc(urlRoom)}</button>
                <input type="hidden" id="codeInput" value="${esc(urlRoom)}">
                <div class="divider">или</div>
                <button class="btn ghost block" data-act="create">Создать свою комнату</button>
              ` : `
                <button class="btn primary block" data-act="create">Создать комнату</button>
                <div class="divider">или войти по коду</div>
                <div class="row"><input type="text" id="codeInput" class="code-input" maxlength="5" placeholder="КОД" autocomplete="off"><button class="btn" data-act="join">Войти</button></div>
              `}
              <div class="divider">или</div>
              <button class="btn ghost block" data-act="solo">Потренироваться с ботами (офлайн)</button>
              ${fresh(hs) ? `<button class="btn ghost block" data-act="resumeHost">↻ Вернуться в свою ${hs.offline ? 'игру с ботами' : 'комнату ' + esc(hs.code)}</button>` : ''}
              ${fresh(cs) && !urlRoom ? `<button class="btn ghost block" data-act="resumeClient">↻ Вернуться в комнату ${esc(cs.code)}</button>` : ''}
              <button class="btn ghost block" data-act="rules">Правила игры</button>
            </div>
            <div class="foot">5–10 игроков · голосовой чат — в Discord/Telegram, игра — здесь<br>${N.available() ? '' : '<span class="c-evil">Сетевая библиотека не загрузилась: доступна только игра с ботами.</span>'}</div>
          </div>
        </div>
      </section>`;
    const ci = $('#codeInput');
    if (ci && ci.type !== 'hidden') ci.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
    $('#nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') (urlRoom ? doJoin() : createRoom(false)); });
  }
  function doJoin() {
    const name = readName();
    if (!name) return;
    joinRoom($('#codeInput').value, name);
  }

  function renderLoading(text) {
    app.screen = 'loading';
    $('#app').innerHTML = `<section class="home"><div class="panel" style="padding:30px 36px;text-align:center"><div class="spin" style="width:28px;height:28px;color:var(--gold)"></div><p class="title" style="font-size:22px;margin-top:14px">${esc(text)}</p><button class="btn ghost small" data-act="cancel" style="margin-top:10px">Отмена</button></div></section>`;
  }

  // ============ РЕНДЕР: верхняя панель ============
  function renderTop() {
    $('#topbar').classList.remove('hidden');
    $('#btnSound').innerHTML = SND.muted ? A.icons.mute : A.icons.sound;
    $('#roomInfo').innerHTML = app.mode === 'host' && app.offline
      ? `<span class="room-chip">Тренировка</span>`
      : `<span class="room-chip" data-act="copy" title="Скопировать ссылку-приглашение"><span>Комната</span><b>${esc(app.code || '')}</b>🔗</span>`;
  }

  // ============ основной обработчик нового состояния ============
  function onView(v) {
    const prev = app.view;
    app.view = v;
    if (prev && prev.gameNo !== v.gameNo) { app.shown = {}; app.target = null; }
    if (v.phase !== (prev && prev.phase)) app.target = null;
    renderTop();
    if (v.phase === 'lobby') renderLobby(v);
    else renderGame(v);
    handleEvents(prev, v);
  }

  // ============ РЕНДЕР: лобби ============
  function renderLobby(v) {
    if (app.overlayType && app.overlayType !== 'rules' && app.overlayType !== 'menu') closeOverlay();
    const isHost = app.mode === 'host';
    const n = v.players.length;
    const st = v.settings;
    const opt = (key, title, desc, art, fixed) => {
      const on = fixed || st[key];
      return `<div class="role-opt ${on ? 'on' : 'off'} ${fixed || !isHost ? 'fixed' : ''}" ${!fixed && isHost ? `data-act="toggle:${key}"` : ''}>
        <span class="chk">${on ? '✓' : ''}</span>${art}<div class="rn">${title}</div><div class="rd">${desc}</div></div>`;
    };
    let comp = '';
    if (n >= 5 && n <= 10) {
      const [g, e] = E.SETUP[n];
      const good = ['Мерлин'].concat(st.percival ? ['Персиваль'] : []);
      const gs = g - good.length;
      const evil = E.evilSpecials(st).map(roleName);
      const es = e - evil.length;
      comp = `<div class="composition"><b class="c-good">Добро (${g}):</b> ${good.join(', ')}${gs > 0 ? `, ${gs}× Верный слуга` : ''}<br>
        <b class="c-evil">Зло (${e}):</b> ${evil.join(', ')}${es > 0 ? `, ${es}× Приспешник` : ''}<br>
        <span class="muted">Походы: ${E.QUESTS[n].join(' · ')}${n >= 7 ? ' · в 4-м походе нужно 2 провала' : ''}</span></div>`;
    }
    $('#app').innerHTML = `
      <section class="lobby">
        <div class="stack">
          ${app.offline ? `<div class="panel invite"><h2 class="title">Тренировка</h2><p class="muted">Вы играете с ботами. Боты видят только то, что им положено по роли.</p></div>` : `
          <div class="panel invite">
            <div class="muted">Код комнаты</div>
            <div class="code">${esc(app.code)}</div>
            <button class="btn primary" data-act="copy">Скопировать ссылку-приглашение</button>
            <p class="muted" style="font-size:13px;margin:10px 0 0">Друзья открывают ссылку или вводят код на главной.</p>
          </div>`}
          <div class="panel">
            <div class="row" style="justify-content:space-between"><h2 class="title" style="font-size:22px">За столом: ${n} / 10</h2>
              ${isHost ? `<div class="row"><button class="btn small ghost" data-act="shuffleSeats" title="Перемешать места">⇄ Места</button><button class="btn small" data-act="addBot" ${n >= 10 ? 'disabled' : ''}>+ Бот</button></div>` : ''}</div>
            <div class="plist">
              ${v.players.map((p, i) => `<div class="pitem"><div class="av">${A.avatar(p.name, i)}</div><div class="nm">${esc(p.name)}${p.id === app.myId ? ' <span class="muted">(вы)</span>' : ''}</div>
                ${p.host ? '<span class="tag host">хост</span>' : ''}${p.bot ? '<span class="tag">бот</span>' : ''}
                ${isHost && p.id !== app.myId ? `<button class="x-btn" data-act="kick:${esc(p.id)}" title="Убрать">✕</button>` : ''}</div>`).join('')}
            </div>
            ${n < 5 ? `<p class="muted" style="margin:12px 0 0">Нужно ещё ${5 - n} — пригласите друзей${isHost ? ' или добавьте ботов' : ''}.</p>` : ''}
          </div>
        </div>
        <div class="panel">
          <h2 class="title" style="font-size:24px">Роли и правила партии</h2>
          <p class="muted" style="margin:4px 0 0;font-size:14px">${isHost ? 'Нажмите на карту, чтобы включить или отключить роль.' : 'Настраивает хост.'}</p>
          <div class="roles-grid">
            ${opt('merlin', 'Мерлин', 'Всегда в игре', A.roleCard('merlin'), true)}
            ${opt('assassin', 'Убийца', 'Всегда в игре', A.roleCard('assassin'), true)}
            ${opt('percival', 'Персиваль', 'Видит Мерлина (и Моргану)', A.roleCard('percival'))}
            ${opt('morgana', 'Моргана', 'Притворяется Мерлином', A.roleCard('morgana'))}
            ${opt('mordred', 'Мордред', 'Скрыт от Мерлина', A.roleCard('mordred'))}
            ${opt('oberon', 'Оберон', 'Зло-одиночка', A.roleCard('oberon'))}
            ${opt('lady', 'Владычица Озера', 'Проверка верности после 2–4 похода. Лучше от 7 игроков', `<div class="lady-icon">${A.icons.lady}</div>`)}
          </div>
          ${comp}
          ${v.setupProblem ? `<div class="warn">⚠ ${esc(v.setupProblem)}</div>` : ''}
          <div class="row" style="margin-top:16px;justify-content:space-between;flex-wrap:wrap">
            <button class="btn ghost small" data-act="leave">← Выйти</button>
            ${isHost ? `<button class="btn primary" data-act="start" ${v.setupProblem ? 'disabled' : ''}>⚔ Начать игру</button>` : `<span class="muted">Ждём, пока хост начнёт игру…</span>`}
          </div>
        </div>
      </section>`;
    app.screen = 'lobby';
  }

  // ============ РЕНДЕР: игра ============
  function ensureGameSkeleton() {
    if (app.screen === 'game') return;
    app.screen = 'game';
    app.chatLen = -1; app.logLen = -1;
    $('#app').innerHTML = `
      <section class="game">
        <div class="board">
          <div class="table-wrap" id="table"></div>
          <div class="panel action" id="action"></div>
        </div>
        <aside class="side">
          <div class="panel mycard" id="mycard"></div>
          <div class="panel side-body">
            <div class="tabs">
              <button class="tab" data-act="tab:chat">Чат</button>
              <button class="tab" data-act="tab:log">Ход игры</button>
              <button class="tab" data-act="tab:hist">Голосования</button>
            </div>
            <div class="scroll" id="tabBody"></div>
            <form class="chat-form" id="chatForm"><input type="text" id="chatInput" maxlength="300" placeholder="Сообщение…" autocomplete="off"><button class="btn small">➤</button></form>
          </div>
        </aside>
      </section>`;
    $('#chatForm').addEventListener('submit', e => { e.preventDefault(); const i = $('#chatInput'); sendChat(i.value); i.value = ''; });
  }

  function renderGame(v) {
    ensureGameSkeleton();
    renderTable(v);
    renderAction(v);
    renderMyCard(v);
    renderTabs(v);
  }

  function inTeamPhase(v) { return ['team', 'vote', 'voteResult', 'quest', 'questResult'].includes(v.phase); }
  function amLeader(v) { return v.me && v.players[v.leader] && v.players[v.leader].id === v.me.id; }
  function canTarget(v, id) {
    if (!v.me) return false;
    if (v.phase === 'team' && amLeader(v)) return true;
    if (v.phase === 'lady' && v.lady && v.lady.holder === v.me.id) return id !== v.me.id && !v.lady.prev.includes(id);
    if (v.phase === 'assassin' && v.me.role === 'assassin') return id !== v.me.id && !v.me.sees.some(k => k.id === id);
    return false;
  }

  function renderTable(v) {
    const n = v.players.length;
    const myI = Math.max(0, pIdx(v, app.myId));
    const seats = [];
    const rx = n > 8 ? 45 : 43, ry = n > 8 ? 42 : 40;
    for (let k = 0; k < n; k++) {
      const i = (myI + k) % n;
      const p = v.players[i];
      const ang = Math.PI / 2 + (k * 2 * Math.PI) / n;
      const x = 50 + rx * Math.cos(ang), y = 50 + ry * Math.sin(ang);
      const badges = [];
      if (v.leader === i && v.phase !== 'end') badges.push(`<span class="badge crown">${A.icons.crown}</span>`);
      if (inTeamPhase(v) && v.team.includes(p.id)) badges.push(`<span class="badge shield">${A.icons.shield}</span>`);
      if (v.lady && v.lady.holder === p.id && v.phase !== 'end') badges.push(`<span class="badge lady" title="Владычица Озера">${A.icons.lady}</span>`);
      const kn = v.me && v.phase !== 'end' && v.me.sees.find(s => s.id === p.id);
      if (kn) badges.push(`<span class="badge know" style="left:-14%;right:auto" title="${kn.tag === 'evil' ? 'Зло' : 'Мерлин или Моргана'}">${kn.tag === 'evil' ? A.icons.eye : A.icons.magic}</span>`);
      let done = false;
      if (v.phase === 'reveal') done = v.ready.includes(p.id);
      if (v.phase === 'vote') done = v.voted.includes(p.id);
      if (v.phase === 'quest') done = v.played.includes(p.id);
      if (done) badges.push(`<span class="badge done">✓</span>`);
      if (v.phase === 'voteResult' && v.votes) badges.push(`<span class="badge vote" style="animation-delay:${k * 0.08}s">${v.votes[p.id] ? A.icons.approve : A.icons.reject}</span>`);
      let sub = '';
      if (!p.connected && !p.bot) sub = 'нет связи';
      else if (p.bot) sub = 'бот';
      else if (v.phase === 'vote' && !done) sub = 'голосует…';
      else if (v.phase === 'quest' && v.team.includes(p.id) && !done) sub = 'в походе…';
      else if (v.leader === i && v.phase === 'team') sub = 'выбирает состав';
      const cls = ['seat'];
      if (p.id === app.myId) cls.push('me');
      if (!p.connected && !p.bot) cls.push('off');
      const clickable = canTarget(v, p.id);
      if (clickable) cls.push('clickable');
      if (v.phase === 'team' && v.team.includes(p.id)) cls.push('selected');
      if ((v.phase === 'lady' || v.phase === 'assassin') && app.target === p.id) cls.push('target');
      if (v.phase === 'end' && v.assassinTarget === p.id) cls.push('target');
      const role = v.phase === 'end' && v.roles ? `<span class="role-mini">${A.roleCard(v.roles[p.id])}</span>` : '';
      seats.push(`<div class="${cls.join(' ')}" style="left:${x}%;top:${y}%" ${clickable ? `data-act="seat:${esc(p.id)}"` : ''}>
        <div class="ring">${A.avatar(p.name, i)}${badges.join('')}</div>
        <div class="nm">${esc(p.name)}</div><div class="sub">${esc(sub)}</div>${role}</div>`);
    }
    const q = v.quests || [];
    const track = q.map((qq, i) => {
      const c = qq.result ? qq.result : i === v.questNum && v.phase !== 'end' ? 'current' : '';
      const inner = qq.result ? `<span class="res">${qq.result === 'success' ? '✦' : '✕'}</span>` : qq.size;
      return `<div class="qm ${c}" title="Поход ${i + 1}: ${qq.size} участников${qq.need > 1 ? ', нужно 2 провала' : ''}${qq.result ? ` — ${qq.result === 'success' ? 'успех' : 'провал'} (провалов: ${qq.fails})` : ''}">
        <span class="num">${i + 1}</span>${inner}${qq.need > 1 ? '<span class="two">2 провала</span>' : ''}</div>`;
    }).join('');
    const vt = [1, 2, 3, 4, 5].map(i => `<span class="vt ${i === v.reject + 1 && v.phase !== 'end' ? 'on' : ''} ${i === 5 ? 'last' : ''}">${i}</span>`).join('');
    $('#table').innerHTML = `<div class="table-top"></div>
      <div class="table-center">
        <div class="phase-banner">${esc(banner(v))}</div>
        <div class="quest-track">${track}</div>
        <div class="vote-track"><span>Попытка</span>${vt}</div>
      </div>${seats.join('')}`;
  }

  function banner(v) {
    const L = v.players[v.leader] ? v.players[v.leader].name : '';
    const qn = (v.questNum || 0) + 1;
    switch (v.phase) {
      case 'reveal': return 'Узнайте свою роль';
      case 'team': return `Поход ${qn} · лидер ${L}`;
      case 'vote': return `Голосование за состав`;
      case 'voteResult': return v.voteApproved ? 'Состав одобрен' : 'Состав отклонён';
      case 'quest': return `Поход ${qn} в пути…`;
      case 'questResult': { const r = v.quests[v.questNum].result; return r === 'success' ? 'Поход успешен!' : 'Поход провален!'; }
      case 'lady': return 'Владычица Озера';
      case 'assassin': return 'Убийца ищет Мерлина';
      case 'end': return v.winner === 'good' ? 'Победа сил добра' : 'Победа приспешников Мордреда';
    }
    return '';
  }

  function renderAction(v) {
    const el = $('#action');
    const me = v.me;
    const n = v.players.length;
    const L = v.players[v.leader];
    const q = v.quests && v.quests[v.questNum];
    const chips = (ids, size) => `<div class="chips">${ids.map(id => `<span class="chip">${esc(nameOf(v, id))}</span>`).join('')}${Array.from({ length: Math.max(0, (size || 0) - ids.length) }, () => '<span class="chip empty">свободно</span>').join('')}</div>`;
    const prog = (k, tot) => `<div class="progress"><i style="width:${(100 * k) / tot}%"></i></div><p style="font-size:13px">${k} из ${tot}</p>`;
    let h = '';
    if (!me && v.phase !== 'end') h = `<h3>Вы наблюдаете за игрой</h3><p>Игра уже шла, когда вы зашли. Дождитесь следующей партии.</p>`;
    else switch (v.phase) {
      case 'reveal':
        h = `<h3>Тайные роли розданы</h3><p>Посмотрите роль так, чтобы никто не видел экран.</p>
          <div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn" data-act="showRole">Посмотреть роль</button>
          ${v.ready.includes(me.id) ? '' : '<button class="btn primary" data-act="ready">Я готов</button>'}</div>
          ${prog(v.ready.length, n)}
          ${app.mode === 'host' ? '<div><button class="btn ghost small" data-act="skipReveal">Начать, не дожидаясь всех</button></div>' : ''}`;
        break;
      case 'team':
        if (amLeader(v)) {
          h = `<h3>Вы — лидер. Выберите ${q.size} рыцарей для похода ${v.questNum + 1}</h3>
            <p>Нажимайте на игроков за столом. Можно взять и себя.${q.need > 1 ? ' В этом походе злу нужно 2 провала.' : ''}</p>
            ${chips(v.team, q.size)}
            <div><button class="btn primary" data-act="propose" ${v.team.length !== q.size ? 'disabled' : ''}>Предложить состав</button></div>
            ${v.reject === 4 ? '<p class="c-evil">Это пятая попытка: если состав отклонят — победит зло.</p>' : ''}`;
        } else {
          h = `<h3>${esc(L.name)} выбирает ${q.size} рыцарей для похода</h3>${chips(v.team, q.size)}
            <p>Обсуждайте в чате, кого стоит взять. Попытка ${v.reject + 1} из 5.</p>`;
        }
        break;
      case 'vote':
        h = `<h3>Одобряете поход в таком составе?</h3>${chips(v.team, q.size)}`;
        if (me.voted === null) h += `<div class="vote-btns">
            <button class="vote-token" data-act="vote:1">${A.icons.approve}<span class="gold">Одобряю</span></button>
            <button class="vote-token" data-act="vote:0">${A.icons.reject}<span class="c-evil">Отклоняю</span></button></div>
            ${v.reject === 4 ? '<p class="c-evil">Пятая попытка! Отклонение — победа зла.</p>' : ''}`;
        else h += `<p>Ваш голос: <b class="${me.voted ? 'gold' : 'c-evil'}">${me.voted ? 'одобряю' : 'отклоняю'}</b>. Ждём остальных…</p>`;
        h += prog(v.voted.length, n);
        break;
      case 'voteResult':
        h = `<h3>${v.voteApproved ? 'Состав одобрен — рыцари отправляются в поход' : 'Состав отклонён — лидерство переходит дальше'}</h3>`;
        break;
      case 'quest':
        if (v.team.includes(me.id) && !me.played) {
          const good = me.side === 'good';
          h = `<h3>Вы в походе. Выберите карту</h3><p>${good ? 'Силы добра могут играть только «Успех».' : 'Вы служите Мордреду: можно сыграть «Провал»… или затаиться.'}</p>
            <div class="quest-cards"><button class="qc" data-act="quest:1">${A.questCard(true)}</button><button class="qc" data-act="quest:0" ${good ? 'disabled title="Добро не может провалить поход"' : ''}>${A.questCard(false)}</button></div>`;
        } else if (v.team.includes(me.id)) h = `<h3>Карта сыграна</h3><p>Ждём остальных участников похода…</p>`;
        else h = `<h3>Рыцари в походе</h3>${chips(v.team, q.size)}`;
        h += prog(v.played.length, v.team.length);
        break;
      case 'questResult': {
        const r = v.quests[v.questNum];
        h = `<h3 class="${r.result === 'success' ? 'c-good' : 'c-evil'}">${r.result === 'success' ? 'Поход успешен' : 'Поход провален'} · карт «Провал»: ${r.fails}</h3>`;
        break;
      }
      case 'lady': {
        const holder = v.lady.holder;
        if (holder === me.id) {
          h = `<h3>Владычица Озера у вас</h3><p>Выберите игрока за столом, чтобы тайно узнать его верность. После проверки Владычица перейдёт к нему.</p>
            ${app.target ? `<p>Проверить: <b class="gold">${esc(nameOf(v, app.target))}</b></p>` : ''}
            <div><button class="btn primary" data-act="ladyGo" ${app.target ? '' : 'disabled'}>Заглянуть в душу</button></div>`;
        } else h = `<h3>${esc(nameOf(v, holder))} использует Владычицу Озера</h3><p>Проверенный игрок получит Владычицу.</p>`;
        break;
      }
      case 'assassin': {
        if (me.role === 'assassin') {
          h = `<h3>Добро победило в трёх походах… но у вас есть последний шанс</h3><p>Выберите, кто из игроков Мерлин. Посоветуйтесь с союзниками в чате.</p>
            ${app.target ? `<p>Цель: <b class="c-evil">${esc(nameOf(v, app.target))}</b></p>` : ''}
            <div><button class="btn evil" data-act="assassinGo" ${app.target ? '' : 'disabled'}>Нанести удар</button></div>`;
        } else if (me.side === 'evil') h = `<h3>Помогите Убийце найти Мерлина</h3><p>Кто из добрых вёл себя так, будто знал слишком много? Пишите в чат.</p>`;
        else h = `<h3>Убийца выбирает цель…</h3><p>Если он найдёт Мерлина — победа достанется злу. Не выдавайте Мерлина!</p>`;
        break;
      }
      case 'end':
        h = `<h3 class="${v.winner === 'good' ? 'c-good' : 'c-evil'}">${v.winner === 'good' ? 'Силы добра победили!' : 'Приспешники Мордреда победили!'}</h3><p>${esc(v.reason)}</p>
          <div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn ghost" data-act="showEnd">Итоги партии</button>
          ${app.mode === 'host' ? '<button class="btn primary" data-act="newGame">Новая партия</button>' : '<span class="muted">Хост может начать новую партию</span>'}</div>`;
        break;
    }
    el.innerHTML = h;
  }

  function knowText(v) {
    const me = v.me;
    if (!me) return '';
    const items = me.sees.map(k => `<span class="know-item ${k.tag}">${k.tag === 'evil' ? '👁 ' : '✦ '}${esc(nameOf(v, k.id))}</span>`).join('');
    const has = r => v.roleList && v.roleList.includes(r);
    let label = '', note = '';
    switch (me.role) {
      case 'merlin': label = 'Приспешники Мордреда:'; if (has('mordred')) note = 'Мордред скрыт от вас.'; break;
      case 'percival': label = has('morgana') ? 'Один из них Мерлин, другой — Моргана:' : 'Мерлин:'; break;
      case 'oberon': note = 'Вы не знаете союзников, и они не знают вас.'; break;
      case 'servant': break;
      default: label = me.sees.length ? 'Ваши союзники:' : ''; if (has('oberon')) note = 'Оберон тоже на стороне зла, но вы его не видите.';
    }
    return { label, items, note };
  }

  function renderMyCard(v) {
    const el = $('#mycard');
    if (!v.me) { el.innerHTML = `<div class="card-wrap">${A.cardBack()}</div><div><div class="rname">Зритель</div><div class="rdesc">Вы смотрите за игрой.</div></div>`; return; }
    const k = knowText(v);
    el.innerHTML = `<div class="card-wrap" data-act="flipCard" title="Нажмите, чтобы скрыть/показать">
        <div class="flip ${app.cardHidden ? 'hide' : ''}"><div class="face">${A.roleCard(v.me.role)}</div><div class="face back">${A.cardBack()}</div></div></div>
      <div>${app.cardHidden ? `<div class="rname">Роль скрыта</div><div class="rdesc">Нажмите на карту, чтобы посмотреть.</div>` : `
        <div class="rname ${v.me.side === 'good' ? 'c-good' : 'c-evil'}">${esc(roleName(v.me.role))}</div>
        <div class="rdesc">${esc(E.ROLES[v.me.role].short)}</div>
        ${k.label ? `<div class="rdesc" style="margin:0 0 4px">${k.label}</div>` : ''}<div class="know-list">${k.items}</div>
        ${k.note ? `<div class="rdesc" style="margin-top:4px">${k.note}</div>` : ''}
        ${ladyNotes(v)}`}
      </div>`;
  }

  function ladyNotes(v) {
    if (!v.lady || !v.me) return '';
    const mine = v.lady.checks.filter(c => c.by === v.me.id && c.side);
    return mine.map(c => `<div class="know-list" style="margin-top:4px"><span class="know-item ${c.side === 'evil' ? 'evil' : 'magic'}">🌊 ${esc(nameOf(v, c.target))}: ${c.side === 'evil' ? 'зло' : 'добро'}</span></div>`).join('');
  }

  function renderTabs(v) {
    document.querySelectorAll('.tab').forEach(t => {
      const k = t.dataset.act.split(':')[1];
      t.classList.toggle('on', k === app.tab);
      t.innerHTML = { chat: 'Чат', log: 'Ход игры', hist: 'Голосования' }[k] + (k === 'chat' && app.unread && app.tab !== 'chat' ? '<span class="dot"></span>' : '');
    });
    $('#chatForm').classList.toggle('hidden', app.tab !== 'chat');
    const body = $('#tabBody');
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
    if (app.tab === 'chat') {
      if (app.chatLen === v.chat.length && body.dataset.tab === 'chat') return;
      body.innerHTML = v.chat.length ? v.chat.map(m => m.from == null ? `<div class="msg sys">${esc(m.text)}</div>` : `<div class="msg"><b>${esc(m.from)}:</b>${esc(m.text)}</div>`).join('') : '<p class="muted">Здесь можно обсуждать, спорить и обвинять. Удачи, рыцари!</p>';
      app.chatLen = v.chat.length;
    } else if (app.tab === 'log') {
      body.innerHTML = v.log.slice().reverse().map(l => `<div class="log-item ${l.kind}">${esc(l.text)}</div>`).join('') || '<p class="muted">Пока пусто.</p>';
    } else {
      body.innerHTML = histTable(v);
    }
    body.dataset.tab = app.tab;
    if (app.tab === 'chat' && (atBottom || body.dataset.first !== '1')) { body.scrollTop = body.scrollHeight; body.dataset.first = '1'; }
  }

  function histTable(v) {
    if (!v.history || !v.history.length) return '<p class="muted">Здесь появится таблица всех голосований: кто кого предлагал и кто как голосовал. Лучший инструмент для поиска зла!</p>';
    const ps = v.players;
    const rows = v.history.map(h => {
      const q = v.quests[h.quest];
      const last = h.approved;
      const cls = last && q.result ? (q.result === 'success' ? 'ok' : 'bad') : '';
      return `<tr class="${cls}"><td class="q" title="Поход ${h.quest + 1}, попытка ${h.attempt}">${h.quest + 1}.${h.attempt}</td>${ps.map(p => `<td class="${h.team.includes(p.id) ? 'on-team' : ''} ${h.leader === p.id ? 'lead' : ''}">${p.id in h.votes ? (h.votes[p.id] ? '<span class="y">✓</span>' : '<span class="n">✗</span>') : ''}</td>`).join('')}<td>${h.approved ? (q.result && last ? (q.result === 'success' ? '<span class="c-good">✦</span>' : `<span class="c-evil">✕${q.fails}</span>`) : '<span class="y">→</span>') : '<span class="n">—</span>'}</td></tr>`;
    }).join('');
    return `<table class="hist"><thead><tr><th></th>${ps.map(p => `<th class="pn">${esc(p.name)}</th>`).join('')}<th></th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted" style="font-size:12px;margin-top:10px">Синий фон — участник похода, рамка — лидер. ✓ одобрил, ✗ отклонил. Справа — итог похода.</p>`;
  }

  // ============ события и оверлеи ============
  function handleEvents(prev, v) {
    const key = s => `${v.gameNo}:${s}`;
    const once = (k, fn) => { if (app.shown[k]) return; app.shown[k] = true; fn(); };
    if (v.phase === 'reveal' && v.me && !v.ready.includes(v.me.id)) once(key('reveal'), () => showRoleReveal(v));
    if (v.phase === 'team') {
      if (app.overlayType === 'vote' || app.overlayType === 'quest') closeOverlay();
      if (amLeader(v)) once(key(`lead:${v.questNum}:${v.reject}`), () => { SND.play('turn'); toast('Вы — лидер! Выберите состав похода'); });
    }
    if (v.phase === 'vote') {
      if (app.overlayType === 'reveal') closeOverlay();
      once(key(`vote:${v.history ? v.history.length : 0}`), () => SND.play('select'));
    }
    if (v.phase === 'voteResult') once(key(`vr:${v.history.length}`), () => showVoteResult(v));
    if (v.phase === 'quest' && app.overlayType === 'vote') closeOverlay();
    if (v.phase === 'questResult') once(key(`qr:${v.questNum}`), () => showQuestResult(v));
    if (v.phase === 'lady' && app.overlayType === 'quest') closeOverlay();
    if (v.phase === 'assassin') {
      if (app.overlayType === 'quest') closeOverlay();
      once(key('assassin'), () => { SND.play('turn'); });
    }
    if (v.lady && v.me) v.lady.checks.forEach((c, i) => { if (c.by === v.me.id && c.side) once(key(`lady:${i}`), () => showLadyResult(v, c)); });
    if (v.phase === 'end') once(key('end'), () => setTimeout(() => showEnd(app.view), app.overlayType === 'quest' ? 1800 : 300));
    // непрочитанный чат
    if (prev && v.chat.length > prev.chat.length) {
      const last = v.chat[v.chat.length - 1];
      if (last.pid && last.pid !== app.myId) { SND.play('chat'); if (app.tab !== 'chat') { app.unread = true; if (app.screen === 'game') renderTabs(v); } }
    }
  }

  function openOverlay(type, html, wide) {
    app.overlayType = type;
    const inner = $('#overlayInner');
    inner.className = 'overlay-inner' + (wide ? ' wide' : '');
    inner.innerHTML = html;
    $('#overlay').classList.remove('hidden');
  }
  function closeOverlay() {
    app.overlayType = null;
    $('#overlay').classList.add('hidden');
    $('#overlayInner').innerHTML = '';
  }

  function showRoleReveal(v) {
    const me = v.me;
    const k = knowText(v);
    openOverlay('reveal', `
      <h2 class="ov-title">Ваша роль</h2>
      <p class="ov-sub">Убедитесь, что никто не смотрит в экран</p>
      <div class="reveal-card"><div class="flip" id="revealFlip"><div class="face">${A.roleCard(me.role)}</div><div class="face back">${A.cardBack()}</div></div></div>
      <p class="ov-text"><b class="${me.side === 'good' ? 'c-good' : 'c-evil'}">${esc(roleName(me.role))}.</b> ${esc(E.ROLES[me.role].short)}</p>
      ${k.label ? `<p class="muted" style="margin:0 0 8px">${k.label}</p>` : ''}
      <div class="ov-know">${k.items}</div>
      ${k.note ? `<p class="muted" style="margin:-6px 0 18px">${k.note}</p>` : ''}
      <div class="ov-actions">${v.phase === 'reveal' && !v.ready.includes(me.id) ? '<button class="btn primary" data-act="ready">Я запомнил(а) — готов</button>' : '<button class="btn" data-act="closeOv">Закрыть</button>'}</div>`);
    setTimeout(() => { const f = $('#revealFlip'); if (f) { f.classList.add('open'); SND.play('flip'); } }, 500);
  }

  function showVoteResult(v) {
    const yes = Object.values(v.votes).filter(Boolean).length;
    openOverlay('vote', `
      <h2 class="ov-title">Итоги голосования</h2>
      <p class="ov-sub">Состав: ${v.team.map(id => esc(nameOf(v, id))).join(', ')}</p>
      <div class="vote-reveal">${v.players.map((p, i) => `<div class="vr" style="animation-delay:${0.15 + i * 0.12}s">${v.votes[p.id] ? A.icons.approve : A.icons.reject}<div class="n">${esc(p.name)}</div></div>`).join('')}</div>
      <div class="verdict ${v.voteApproved ? 'ok' : 'no'}" style="animation-delay:${0.3 + v.players.length * 0.12}s">${v.voteApproved ? 'Одобрено' : 'Отклонено'} · ${yes} : ${v.players.length - yes}</div>
      ${!v.voteApproved ? `<p class="muted">Отклонено подряд: ${v.reject + 1} из 5${v.reject + 1 >= 5 ? ' — зло побеждает!' : ''}</p>` : ''}`);
    setTimeout(() => SND.play(v.voteApproved ? 'approve' : 'reject'), 300 + v.players.length * 120);
  }

  function showQuestResult(v) {
    const r = v.quests[v.questNum];
    const cards = v.lastCards || [];
    openOverlay('quest', `
      <h2 class="ov-title">Поход ${v.questNum + 1}</h2>
      <p class="ov-sub">Карты перемешаны — никто не узнает, кто что сыграл</p>
      <div class="quest-reveal">${cards.map((c, i) => `<div class="qr" id="qr${i}"><div class="face">${A.questCard(c === 'S')}</div><div class="face back">A</div></div>`).join('')}</div>
      <div id="qverdict" style="min-height:90px"></div>`);
    cards.forEach((c, i) => setTimeout(() => { const el = $('#qr' + i); if (el) { el.classList.add('open'); SND.play('flip'); } }, 700 + i * 750));
    setTimeout(() => {
      const el = $('#qverdict');
      if (!el) return;
      el.innerHTML = `<div class="verdict ${r.result === 'success' ? 'ok' : 'no'}">${r.result === 'success' ? 'Поход успешен!' : 'Поход провален!'}</div>
        <p class="muted">Карт «Провал»: ${r.fails}${r.need > 1 ? ' (для провала нужно 2)' : ''}</p>`;
      SND.play(r.result === 'success' ? 'success' : 'fail');
    }, 900 + cards.length * 750);
  }

  function showLadyResult(v, c) {
    const evil = c.side === 'evil';
    openOverlay('lady', `
      <div style="width:110px;margin:0 auto 10px">${A.icons.lady}</div>
      <h2 class="ov-title">Владычица Озера</h2>
      <p class="ov-sub">Вода показала истинную верность</p>
      <div style="width:90px;margin:0 auto 10px">${avatarOf(v, c.target)}</div>
      <div class="verdict ${evil ? 'no' : 'ok'}" style="margin-bottom:10px">${esc(nameOf(v, c.target))} ${evil ? 'служит Мордреду' : 'верен(а) Артуру'}</div>
      <p class="muted">Это знаете только вы. Можете сказать правду… или солгать.</p>
      <div class="ov-actions"><button class="btn" data-act="closeOv">Понятно</button></div>`);
    SND.play(evil ? 'reject' : 'approve');
  }

  function showEnd(v) {
    if (!v || v.phase !== 'end') return;
    const good = v.winner === 'good';
    openOverlay('end', `
      <h2 class="big-win ${good ? 'good' : 'evil'}">${good ? 'Победа добра' : 'Победа зла'}</h2>
      <p class="ov-sub" style="font-size:18px">${esc(v.reason)}</p>
      <div class="end-grid">${v.players.map((p, i) => `<div class="end-item ${v.assassinTarget === p.id ? 'killed' : ''}" style="animation-delay:${i * 0.08}s">${A.roleCard(v.roles[p.id])}<div class="n">${esc(p.name)}${p.id === app.myId ? ' (вы)' : ''}</div>${v.assassinTarget === p.id ? '<div class="x">🗡 цель Убийцы</div>' : ''}</div>`).join('')}</div>
      <div class="ov-actions">${app.mode === 'host' ? '<button class="btn primary" data-act="newGame">Новая партия</button>' : ''}<button class="btn" data-act="closeOv">Посмотреть стол</button></div>`, true);
    const mine = v.me && v.me.side === v.winner;
    SND.play(mine || (!v.me && good) ? 'victory' : 'doom');
  }

  function showRules() {
    openOverlay('rules', `<div class="panel rules">
      <h3>Суть игры</h3>
      <p>Силы добра (рыцари Артура) должны успешно завершить 3 похода из 5. Приспешники Мордреда знают друг друга и стараются провалить 3 похода — или в конце вычислить Мерлина.</p>
      <h3>Ход раунда</h3>
      <ol>
        <li><b>Лидер</b> (корона) предлагает состав похода нужного размера.</li>
        <li><b>Все голосуют</b> открыто: одобрить или отклонить. Нужно строго больше половины голосов «за».</li>
        <li>Если состав отклонён, лидерство переходит к следующему игроку по часовой стрелке. <b>5 отклонений подряд — победа зла.</b></li>
        <li>Участники похода тайно играют карты. Добро обязано играть «Успех», зло может сыграть «Провал». Один «Провал» проваливает поход (в 4-м походе при 7+ игроках нужно два).</li>
      </ol>
      <h3>Убийство Мерлина</h3>
      <p>Если добро выиграло 3 похода, Убийца выбирает одного игрока. Если это Мерлин — зло побеждает. Поэтому Мерлину нельзя слишком явно показывать свои знания.</p>
      <h3>Роли</h3>
      <ul>
        <li><b class="c-good">Мерлин</b> — видит всех злых, кроме Мордреда.</li>
        <li><b class="c-good">Персиваль</b> — видит Мерлина и Моргану, но не знает, кто есть кто.</li>
        <li><b class="c-good">Верный слуга Артура</b> — ничего не знает.</li>
        <li><b class="c-evil">Убийца</b> — в конце пытается вычислить Мерлина.</li>
        <li><b class="c-evil">Моргана</b> — для Персиваля выглядит как Мерлин.</li>
        <li><b class="c-evil">Мордред</b> — невидим для Мерлина.</li>
        <li><b class="c-evil">Оберон</b> — не знает других злых, и они не знают его (но Мерлин его видит).</li>
        <li><b class="c-evil">Приспешник Мордреда</b> — обычный злой рыцарь.</li>
      </ul>
      <h3>Владычица Озера</h3>
      <p>Выдаётся игроку справа от первого лидера. После 2-го, 3-го и 4-го похода владелец тайно узнаёт сторону любого игрока (кроме тех, кто уже держал Владычицу), и жетон переходит к проверенному.</p>
      <h3>Состав и походы</h3>
      <table><tr><th>Игроков</th><th>5</th><th>6</th><th>7</th><th>8</th><th>9</th><th>10</th></tr>
        <tr><td>Добро</td><td>3</td><td>4</td><td>4</td><td>5</td><td>6</td><td>6</td></tr>
        <tr><td>Зло</td><td>2</td><td>2</td><td>3</td><td>3</td><td>3</td><td>4</td></tr>
        ${[0, 1, 2, 3, 4].map(i => `<tr><td>Поход ${i + 1}</td>${[5, 6, 7, 8, 9, 10].map(n => `<td>${E.QUESTS[n][i]}${i === 3 && n >= 7 ? '*' : ''}</td>`).join('')}</tr>`).join('')}
      </table>
      <p class="muted">* нужно два «Провала».</p>
      <div class="ov-actions" style="margin-top:16px"><button class="btn primary" data-act="closeOv">К столу</button></div>
    </div>`);
  }

  function showMenu() {
    const v = app.view;
    const isHost = app.mode === 'host';
    const inGame = v && v.phase !== 'lobby';
    const away = inGame && isHost ? v.players.filter(p => !p.bot && !p.connected) : [];
    openOverlay('menu', `<div class="panel menu">
      <h2 class="title" style="font-size:24px">Меню</h2>
      ${!app.offline ? '<button class="btn ghost block" data-act="copy">Скопировать ссылку-приглашение</button>' : ''}
      ${away.map(p => `<button class="btn ghost block" data-act="botify:${esc(p.id)}">Заменить ботом: ${esc(p.name)}</button>`).join('')}
      ${isHost && inGame ? '<button class="btn ghost block" data-act="abort">Прервать партию и вернуться в лобби</button>' : ''}
      <button class="btn ghost block" data-act="leave">${isHost ? (app.offline ? 'Выйти на главную' : 'Закрыть комнату') : 'Выйти из комнаты'}</button>
      <button class="btn block" data-act="closeOv">Назад</button>
    </div>`);
  }

  // ============ клики ============
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const [cmd, arg] = el.dataset.act.split(/:(.*)/s);
    const v = app.view;
    switch (cmd) {
      case 'create': return createRoom(false);
      case 'solo': return createRoom(true);
      case 'join': return doJoin();
      case 'resumeHost': return resumeHost();
      case 'resumeClient': { const cs = LS.get(CLIENT_SAVE); const name = readName(true) || cs.name; return joinRoom(cs.code, name); }
      case 'cancel': return resetToHome();
      case 'rules': SND.play('click'); return showRules();
      case 'copy': return copy(inviteLink());
      case 'leave': closeOverlay(); if (app.mode === 'host' && !app.offline && v && v.phase !== 'lobby' && !confirm('Закрыть комнату? Игра закончится для всех.')) return; return leave();
      case 'toggle': return act({ type: 'settings', settings: { [arg]: !v.settings[arg] } });
      case 'addBot': case 'start': case 'newGame': case 'skipReveal': case 'shuffleSeats':
        if (cmd === 'newGame') closeOverlay();
        return act({ type: cmd });
      case 'abort': closeOverlay(); if (confirm('Прервать партию для всех?')) act({ type: 'abort' }); return;
      case 'kick': return act({ type: 'kick', pid: arg });
      case 'botify': closeOverlay(); return act({ type: 'botify', pid: arg });
      case 'ready': closeOverlay(); return act({ type: 'ready' });
      case 'showRole': return showRoleReveal(v);
      case 'flipCard': app.cardHidden = !app.cardHidden; SND.play('flip'); return renderMyCard(v);
      case 'closeOv': return closeOverlay();
      case 'showEnd': return showEnd(v);
      case 'tab': app.tab = arg; if (arg === 'chat') app.unread = false; app.chatLen = -1; return renderTabs(v);
      case 'seat': {
        if (v.phase === 'team') {
          const size = v.quests[v.questNum].size;
          let t = v.team.slice();
          if (t.includes(arg)) t = t.filter(x => x !== arg);
          else if (t.length < size) t.push(arg);
          else return toast(`В походе только ${size} мест — сначала уберите кого-нибудь`, 'err');
          SND.play('select');
          return act({ type: 'setTeam', team: t });
        }
        app.target = app.target === arg ? null : arg;
        SND.play('select');
        renderTable(v); renderAction(v);
        return;
      }
      case 'propose': return act({ type: 'propose' });
      case 'vote': return act({ type: 'vote', approve: arg === '1' });
      case 'quest': return act({ type: 'quest', success: arg === '1' });
      case 'ladyGo': return app.target && act({ type: 'lady', target: app.target });
      case 'assassinGo':
        if (!app.target) return;
        if (!confirm(`Убить ${nameOf(v, app.target)}? Это окончательный выбор.`)) return;
        return act({ type: 'assassinate', target: app.target });
    }
  });
  $('#overlay').addEventListener('click', e => { if (e.target.id === 'overlay' && ['rules', 'menu', 'lady', 'end', 'reveal'].includes(app.overlayType)) closeOverlay(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ['rules', 'menu', 'lady', 'end'].includes(app.overlayType)) closeOverlay(); });
  $('#btnSound').addEventListener('click', () => { SND.toggle(); renderTop(); });
  $('#btnRules').addEventListener('click', () => showRules());
  $('#btnMenu').addEventListener('click', () => showMenu());
  window.addEventListener('beforeunload', e => { if (app.mode === 'host' && !app.offline && app.S && app.S.phase !== 'lobby') { e.preventDefault(); e.returnValue = ''; } });

  // для автотестов
  window.__avalon = app;

  // Автовозврат после перезагрузки страницы
  (function boot() {
    const urlRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
    const hs = LS.get(HOST_SAVE), cs = LS.get(CLIENT_SAVE);
    const fresh = s => s && Date.now() - s.t < 6 * 3600e3;
    if (urlRoom && fresh(hs) && hs.code === urlRoom) return resumeHost();
    if (urlRoom && fresh(cs) && cs.code === urlRoom && cs.name) return joinRoom(urlRoom, cs.name);
    renderHome();
  })();
})();
