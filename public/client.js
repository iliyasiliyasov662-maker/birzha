// Клиент «Биржи»: показывает состояние, которое присылает сервер, и отправляет действия.
'use strict';

const S = {
  ws: null, view: null, pid: null, room: null,
  modal: null,            // { type: 'company', id } | { type: 'news' } | { type: 'rules' }
  clockOffset: 0,
  anim: null,             // идущая анимация хода: кубики крутятся, потом фишка шагает по клеткам
  lastMoveId: null,
};

const urlRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
const LS = {
  get name() { try { return localStorage.getItem('birzha:name') || ''; } catch { return ''; } },
  set name(v) { try { localStorage.setItem('birzha:name', v); } catch {} },
  pid(room) { try { return localStorage.getItem('birzha:pid:' + room); } catch { return null; } },
  setPid(room, pid) { try { localStorage.setItem('birzha:pid:' + room, pid); } catch {} },
};

// ---------- Значки отраслей ----------
const IND = {
  food:   { color: '#f76707', label: '#ffa94d', icon: '<path d="M4 10a8 5 0 0 1 16 0z"/><path d="M3 14h18"/><path d="M4 17h16v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>' },
  drinks: { color: '#f06595', label: '#faa2c1', icon: '<path d="M10 2h4v4l2 3v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3z"/><path d="M8 13h8"/>' },
  wear:   { color: '#9775fa', label: '#b197fc', icon: '<path d="M3 17v-6l4-1 3 3h4l5 2a2 2 0 0 1 2 2z"/><path d="M3 20h18"/>' },
  cars:   { color: '#4dabf7', label: '#74c0fc', icon: '<path d="M4 15l2-6h12l2 6v3H4z"/><path d="M4 15h16"/><path d="M7 18v2M17 18v2"/>' },
  scent:  { color: '#da77f2', label: '#e599f7', icon: '<rect x="6" y="10" width="12" height="11" rx="2"/><path d="M10 10V7h4v3"/><path d="M9 4h6"/>' },
  tech:   { color: '#20c997', label: '#63e6be', icon: '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>' },
  stream: { color: '#fcc419', label: '#ffe066', icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>' },
  oil:    { color: '#ced4da', label: '#dee2e6', icon: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>' },
};
const svg = (inner, size = 13, stroke = '#0f1115', w = 2.4) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICONS = {
  start: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  news: '<path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 18h.01"/><circle cx="12" cy="12" r="9"/>',
  tax: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  deal: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M10 10v8M14 10v8M19 10v8"/><path d="M3 20h18"/>',
  auction: '<path d="M14 4l6 6"/><path d="M11 7l6 6"/><path d="M12.5 5.5l-4 4 6 6 4-4"/><path d="M10.5 11.5L4 18l2 2 6.5-6.5"/><path d="M14 21h7"/>',
  rumor: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  dividends: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  exchange: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  audit: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

// ---------- Помощники ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Math.round(n).toLocaleString('ru-RU').replace(/ |,/g, ' ') + ' $';
const short = (n) => Math.round(n / 1000).toLocaleString('ru-RU').replace(/ |,/g, ' ') + ' тыс.';
const me = () => S.view && S.view.players.find((p) => p.id === S.pid);
const pl = (id) => S.view.players.find((p) => p.id === id);
const myTurn = () => S.view && S.view.currentId === S.pid && S.view.phase !== 'over';
// Изменение цены с начала игры, в процентах
const change = (c) => c.basePrice ? Math.round((c.price - c.basePrice) / c.basePrice * 100) : 0;
const chg = (c) => { const d = change(c); return d > 0 ? `<span class="up">▲ ${d}%</span>` : d < 0 ? `<span class="down">▼ ${-d}%</span>` : '<span class="muted">0%</span>'; };
const sharesOf = (pid, cid) => S.view.companies[cid].owners[pid] || 0;
const bankShares = (cid) => 10 - Object.values(S.view.companies[cid].owners).reduce((a, b) => a + b, 0);
const controller = (cid) => { for (const [id, n] of Object.entries(S.view.companies[cid].owners)) if (n >= 6) return id; return null; };
function sellable(cid) {
  const v = S.view;
  const locked = myTurn() ? (v.turn.boughtShares[cid] || 0) : 0;
  const listed = v.offers.filter((o) => o.sellerId === S.pid && o.companyId === cid).reduce((a, o) => a + o.shares, 0);
  return Math.max(0, sharesOf(S.pid, cid) - locked - listed);
}
// «Старт» — левый верхний угол, дальше по часовой стрелке: вправо по верху, вниз справа, влево по низу, вверх слева
// side — клеток между углами, G — размер сетки (у нас 28 клеток: по 6 на сторону, сетка 8×8)
function cellPos(i) {
  const n = S.view.board.length, side = n / 4, G = side + 1;
  if (i === 0) return [1, 1];
  if (i < side) return [1, 1 + i];
  if (i === side) return [1, G];
  if (i < 2 * side) return [1 + (i - side), G];
  if (i === 2 * side) return [G, G];
  if (i < 3 * side) return [G, G - (i - 2 * side)];
  if (i === 3 * side) return [G, 1];
  return [G - (i - 3 * side), 1];
}
const indIcon = (ind, size = 13) => svg(IND[ind].icon, size);
const SHY = { mcd: 'Mc\u00adDonald\u2019s', exxon: 'Exxon\u00adMobil' };
const cellName = (c) => SHY[c.id] || c.name;
// Короткие названия для маленького поля на телефоне
const SHORT = { mcd: 'McD', bk: 'BK', kfc: 'KFC', coke: 'Coke', pepsi: 'Pepsi', nike: 'Nike', adidas: 'Adi', toyota: 'Toyo', bmw: 'BMW', mercedes: 'Merc',
  chanel: 'Chnl', dior: 'Dior', samsung: 'Sams', google: 'Goog', apple: 'Apple', netflix: 'Netfx', spotify: 'Spot', shell: 'Shell', bp: 'BP', exxon: 'Exxon' };
const isMobile = () => window.innerWidth < 760;
const displayPos = (p) => (S.anim && S.anim.pid === p.id ? S.anim.cur : p.pos);
const rnd6 = () => 1 + Math.floor(Math.random() * 6);
const tokenHtml = (p, hop) => `<div class="token${hop ? ' hop' : ''}" style="background:${p.color}" title="${esc(p.name)}">${esc(p.name[0] || '?').toUpperCase()}</div>`;
const avatar = (p, size = 32) => `<div class="avatar" style="width:${size}px;height:${size}px;background:${p.color}">${esc(p.name[0] || '?').toUpperCase()}</div>`;

function toast(msg, ok) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (ok ? ' ok' : '');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => { t.className = 'toast'; }, 3200);
}

// ---------- Связь с сервером ----------
function connect() {
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  S.ws = ws;
  ws.onopen = () => {
    const room = S.room || urlRoom;
    const pid = room && LS.pid(room);
    if (room && pid) send({ t: 'join', room, pid, name: LS.name });
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'joined') {
      S.pid = m.pid; S.room = m.room; LS.setPid(m.room, m.pid);
      if (urlRoom !== m.room) history.replaceState(null, '', '/?room=' + m.room);
    } else if (m.t === 'state') {
      const prevMove = S.lastMoveId;
      S.view = m.view;
      S.clockOffset = m.view.now - Date.now();
      const lm = m.view.lastMove;
      if (prevMove === null) S.lastMoveId = lm ? lm.id : 0;           // первое состояние после входа — без анимации
      else if (lm && lm.id !== prevMove) { S.lastMoveId = lm.id; startAnim(lm); }
      if (S.view.turn && S.view.turn.newsChoice && myTurn()) S.modal = { type: 'news' };
      else if (S.modal && S.modal.type === 'news') S.modal = null;
      render();
    } else if (m.t === 'error') {
      toast(m.msg);
      if (!S.view) render();
    }
  };
  ws.onclose = () => { setTimeout(connect, 1500); };
}
function send(m) {
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(m));
  else toast('Нет связи с сервером, переподключаюсь…');
}
setInterval(() => send({ t: 'ping' }), 25000);

// ---------- Отрисовка ----------
function render() {
  // сохраняем то, что игрок печатает, чтобы обновление не стирало ввод
  const keep = {};
  for (const id of ['name-input', 'sell-price', 'sell-shares', 'rumor-company', 'trade-cash']) {
    const el = document.getElementById(id);
    if (el) keep[id] = { v: el.value, f: document.activeElement === el };
  }
  const app = document.getElementById('app');
  if (!S.view) app.innerHTML = startScreen();
  else if (S.view.phase === 'lobby') app.innerHTML = lobbyScreen();
  else app.innerHTML = gameScreen();
  document.getElementById('modal-root').innerHTML = S.view ? modalHtml() : '';
  for (const [id, k] of Object.entries(keep)) {
    const el = document.getElementById(id);
    if (el) { el.value = k.v; if (k.f) el.focus(); }
  }
  tick();
}

function startScreen() {
  return `<div class="lobby">
    <div class="logo"><div class="logo-mark">${svg(ICONS.exchange, 20, 'currentColor')}</div><div class="logo-name">Биржа</div></div>
    <h1>${urlRoom ? `Вас пригласили в комнату ${esc(urlRoom)}` : 'Биржевая игра для друзей'}</h1>
    <div class="muted">Покупайте доли компаний, торгуйтесь, блефуйте секретными новостями. Цель: ${money(400000)} наличными или ${money(500000)} капитала. От 2 до 5 игроков.</div>
    <div class="field"><label for="name-input">Ваше имя</label><input id="name-input" class="input" maxlength="16" value="${esc(LS.name)}" placeholder="Например, Макс"></div>
    ${urlRoom ? `<button class="btn btn-primary btn-big" data-act="join">Войти в комнату ${esc(urlRoom)}</button>` : ''}
    <button class="btn ${urlRoom ? '' : 'btn-primary btn-big'}" data-act="create">Создать новую комнату</button>
  </div>`;
}

function lobbyScreen() {
  const v = S.view;
  const link = location.origin + '/?room=' + v.code;
  const host = v.hostId === S.pid;
  return `<div class="lobby">
    <div class="logo"><div class="logo-mark">${svg(ICONS.exchange, 20, 'currentColor')}</div><div class="logo-name">Биржа</div></div>
    <h1>Комната ${esc(v.code)}</h1>
    <div class="field"><label>Отправьте друзьям ссылку</label>
      <div class="linkbox"><input class="input" readonly value="${esc(link)}" id="invite"><button class="btn" data-act="copy">Скопировать</button></div>
    </div>
    <div class="card">
      <div class="h">Игроки (${v.players.length} из ${v.config.maxPlayers})</div>
      ${v.players.map((p) => `<div class="prow">${avatar(p)}<div class="pname">${esc(p.name)}${p.id === S.pid ? ' (вы)' : ''}</div>${p.isBot ? '<span class="tag tag-grey">бот</span>' : ''}${p.id === v.hostId ? '<span class="tag tag-grey">создатель</span>' : ''}${p.online ? '' : '<span class="tag tag-grey">не в сети</span>'}${host && p.isBot ? `<button class="btn btn-sm" data-act="removeBot" data-id="${p.id}">Убрать</button>` : ''}</div>`).join('')}
      ${host ? `<button class="btn" data-act="addBot" ${v.players.length >= v.config.maxPlayers ? 'disabled' : ''}>+ Добавить бота</button>
        <div class="hint">Боты ходят сами: покупают доли, делают ставки на аукционах, выбирают новости. Торговаться и блефовать как люди они не умеют.</div>` : ''}
    </div>
    ${host ? `<div class="field"><label for="minutes">Длительность партии</label>
        <select id="minutes" class="input"><option value="30">30 минут</option><option value="45" selected>45 минут</option><option value="60">60 минут</option><option value="90">90 минут</option></select></div>
      <div class="hint">Если за это время никто не дойдёт до цели, победит игрок с самым большим капиталом.</div>
      <button class="btn btn-primary btn-big" data-act="start" ${v.players.length < 2 ? 'disabled' : ''}>${v.players.length < 2 ? 'Нужно минимум 2 игрока' : 'Начать игру'}</button>`
      : '<div class="muted">Ждём, пока создатель комнаты начнёт игру…</div>'}
    <button class="btn" data-act="leave">Выйти из комнаты</button>
  </div>`;
}

function mobileGameScreen() {
  const v = S.view;
  const cur = pl(v.currentId);
  const tab = S.mtab || 'turn';
  const tabs = [['turn', 'Ход'], ['players', 'Игроки'], ['log', 'Журнал']];
  let body = '';
  if (tab === 'turn') body = capitalCard() + rightHtml(false);
  if (tab === 'players') body = v.players.map((p) => playerCard(p, cur)).join('') + `<div class="hint">Победа: ${money(v.config.winCash)} наличными или ${money(v.config.winCapital)} капитала.</div>`;
  if (tab === 'log') body = logCard();
  const actions = centerActions();
  const status = v.phase === 'over' ? '' : myTurn() ? '' : `<div class="m-status">Ходит <b>${esc(cur ? cur.name : '')}</b> · <span class="turn-timer">—</span></div>`;
  return `<div class="mwrap">
    <div class="mhead-bar">
      <div class="logo-mark" style="width:32px;height:32px">${svg(ICONS.exchange, 18, 'currentColor')}</div>
      <div class="mh-info"><b>Комната ${esc(v.code)}</b><span>круг ${v.round} · осталось <b id="timer" class="num">—</b></span></div>
      <button class="btn btn-sm" data-act="copy-link">Пригласить</button>
      <button class="btn btn-sm" data-act="rules" aria-label="Правила" style="width:36px;padding:0">?</button>
    </div>
    <section class="m-board" aria-label="Игровое поле">${boardHtml()}</section>
    <div class="m-info">${centerInfo()}</div>
    <div class="mtabs" role="tablist">${tabs.map(([k, t]) => `<button class="mtab ${tab === k ? 'on' : ''}" role="tab" aria-selected="${tab === k}" data-act="mtab" data-tab="${k}">${t}</button>`).join('')}</div>
    <div class="m-body">${body}</div>
    ${actions || status ? `<div class="m-actionbar">${actions || status}</div>` : ''}
  </div>`;
}

function gameScreen() {
  if (isMobile()) return mobileGameScreen();
  const v = S.view;
  const cur = pl(v.currentId);
  return `<div class="wrap">
    <div class="header">
      <div class="logo"><div class="logo-mark">${svg(ICONS.exchange, 20, 'currentColor')}</div><div class="logo-name">Биржа</div></div>
      <div class="head-info">
        <span>Комната <b>${esc(v.code)}</b> · круг ${v.round} · осталось <b id="timer" class="num">—</b></span>
        <button class="btn" data-act="copy-link">Пригласить</button>
        <button class="btn" data-act="rules">Правила</button>
      </div>
    </div>
    ${tickerHtml()}
    <div class="layout">
      <section class="col-left" aria-label="Игроки">
        ${capitalCard()}
        <div class="h">Игроки</div>
        ${v.players.map((p) => playerCard(p, cur)).join('')}
        <div class="hint">Победа: ${money(v.config.winCash)} наличными или ${money(v.config.winCapital)} капитала. Проверяется в начале своего хода.</div>
      </section>
      <section class="col-board" aria-label="Игровое поле">${boardHtml()}</section>
      <section class="col-right" aria-label="Ваш ход">${rightHtml()}</section>
    </div>
  </div>`;
}

function tickerHtml() {
  const cs = Object.values(S.view.companies).map((c) => ({ c, d: change(c) }));
  const ups = cs.filter((x) => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 3);
  const downs = cs.filter((x) => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 3);
  if (!ups.length && !downs.length) return '<div class="ticker"><span class="muted">С начала игры цены пока не менялись</span></div>';
  return `<div class="ticker num">
    ${ups.length ? '<b>Рост с начала игры</b>' + ups.map((x) => `<span>${esc(x.c.name)} <b class="up">▲ ${x.d}%</b></span>`).join('') : ''}
    ${downs.length ? '<b style="margin-left:12px">Падение</b>' + downs.map((x) => `<span>${esc(x.c.name)} <b class="down">▼ ${-x.d}%</b></span>`).join('') : ''}
  </div>`;
}

function playerCard(p, cur) {
  const v = S.view;
  const isTurn = cur && cur.id === p.id && v.phase !== 'over';
  const tag = p.out ? '<span class="tag tag-grey">выбыл</span>'
    : isTurn ? '<span class="tag tag-blue">ходит · <span class="turn-timer">—</span></span>'
    : p.knowsNews ? '<span class="tag tag-yellow">знает новость</span>'
    : !p.online ? '<span class="tag tag-grey">не в сети</span>' : '';
  const capPct = Math.min(100, Math.round(p.capital / v.config.winCapital * 100));
  return `<div class="card pcard ${isTurn ? 'turn' : ''} ${p.out ? 'out' : ''}">
    <div class="prow">${avatar(p, 30)}<div class="pname">${esc(p.name)}${p.id === S.pid ? ' (вы)' : ''}</div>${p.isBot && !isTurn ? '<span class="tag tag-grey">бот</span>' : ''}${tag}${p.id !== S.pid && !p.out && S.view.phase !== 'over' && me() && !me().out ? `<button class="btn btn-sm" data-act="tradeOpen" data-to="${p.id}" title="Предложить обмен" aria-label="Предложить обмен игроку ${esc(p.name)}" style="height:30px;padding:0 9px">⇄</button>` : ''}</div>
    <div class="kv"><span>капитал <b style="color:var(--text)">${money(p.capital)}</b></span><span class="muted">нал. ${money(p.cash)}</span></div>
    <div class="bar"><div style="width:${capPct}%;background:${p.color}"></div></div>
  </div>`;
}

// Подсказка про лимит у банка: 20% за одно попадание, 30% за всю игру
function bankLimitText(cid) {
  const v = S.view;
  const my = me();
  const bought = my.bankBought[cid] || 0;
  const visit = (v.turn.bankVisit || {})[cid] || 0;
  if (bankShares(cid) <= 0) return 'У банка не осталось свободных долей. Покупайте у игроков.';
  if (bought >= v.config.bankLimitShares) return `Вы уже купили у банка ${v.config.bankLimitShares * 10}% этой компании. Больше — только у игроков.`;
  if (visit >= v.config.bankPerVisit) return `За это попадание вы уже взяли ${v.config.bankPerVisit * 10}%. Ещё ${(v.config.bankLimitShares - bought) * 10}% — когда снова встанете сюда.`;
  const now = Math.min(v.config.bankPerVisit - visit, v.config.bankLimitShares - bought);
  return `Сейчас можно взять ещё ${now * 10}%. Всего у банка куплено ${bought * 10}% из ${v.config.bankLimitShares * 10}% (не больше ${v.config.bankPerVisit * 10}% за одно попадание).`;
}

function capitalCard() {
  const v = S.view;
  const my = me();
  if (!my) return '';
  const cashPct = Math.min(100, Math.round(my.cash / v.config.winCash * 100));
  const capPct = Math.min(100, Math.round(my.capital / v.config.winCapital * 100));
  return `<div class="card capcard">
    <div class="kv"><span>Ваш капитал</span><span>акции ${money(my.shares)}</span></div>
    <div class="big">${money(my.capital)}</div>
    <div class="kv"><span>Наличные</span><b>${money(my.cash)}</b></div>
    <div class="goal"><span>${cashPct}%</span><div class="bar"><div style="width:${cashPct}%;background:var(--up)"></div></div><span class="muted">до ${short(v.config.winCash)} нал.</span></div>
    <div class="goal"><span>${capPct}%</span><div class="bar"><div style="width:${capPct}%;background:var(--blue)"></div></div><span class="muted">до ${short(v.config.winCapital)} кап.</span></div>
  </div>`;
}

function boardHtml() {
  const v = S.view;
  const my = me();
  const G = v.board.length / 4 + 1;
  let html = `<div class="board" style="grid-template-columns:repeat(${G},minmax(0,1fr));grid-template-rows:repeat(${G},minmax(0,1fr))">`;
  v.board.forEach((cell, i) => {
    const [r, c] = cellPos(i);
    const style = `grid-row:${r};grid-column:${c}`;
    const here = v.players.filter((p) => !p.out && displayPos(p) === i);
    const tokens = `<div class="tokens" id="tok-${i}">${here.map((p) => tokenHtml(p)).join('')}</div>`;
    const isMine = my && !my.out && displayPos(my) === i;
    if (cell.type === 'company') {
      const co = v.companies[cell.id];
      // владельцы: рамка — цвет того, у кого больше всего долей; у контрольного пакета клетка ещё и подкрашена
      const owners = Object.entries(co.owners).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ p: pl(id), n })).filter((x) => x.p);
      const top = owners[0];
      const ownStyle = top ? `;border-color:${top.p.color}${top.n >= 6 ? `;background:color-mix(in srgb, ${top.p.color} 18%, #1f232b)` : ''}` : '';
      const segs = [];
      for (const o of owners) for (let k = 0; k < o.n; k++) segs.push(`<span style="background:${o.p.color}"></span>`);
      while (segs.length < 10) segs.push('<span></span>');
      const who = owners.map((o) => `${o.p.name} ${o.n * 10}%`).join(', ');
      html += `<button class="cell ${top ? 'owned' : ''} ${isMine ? 'here' : ''}" data-idx="${i}" style="${style}${ownStyle}" data-act="open" data-id="${cell.id}" aria-label="${esc(co.name)}, цена ${short(co.price)}${who ? ', владельцы: ' + esc(who) : ''}" title="${esc(who || 'Никто не владеет')}">
        <div class="band" style="background:${IND[co.industry].color}">${indIcon(co.industry)}</div>
        <div class="cbody">
          <div class="cname"><span class="nfull">${esc(cellName(co))}</span><span class="nshort">${esc(SHORT[co.id] || co.name)}</span></div>
          <div class="cprice"><span class="nfull">${short(co.price)}</span><span class="nshort">${Math.round(co.price / 1000)}к</span></div>
          <div class="cfoot">${chg(co)}${top && top.n >= 6 ? `<span class="ctrl" title="Контрольный пакет: ${esc(top.p.name)}">${svg('<path d="M3 18h18l-2-11-5 5-2-7-2 7-5-5z"/>', 14, top.p.color, 2.4)}</span>` : ''}</div>
        </div>
        <div class="ownbar" aria-hidden="true">${segs.join('')}</div>${tokens}</button>`;
    } else {
      const sp = {
        start: ['s-start', ICONS.start, '#8fb6ff', 'СТАРТ', `+${money(v.config.salary)} зарплата`, 'Старт'],
        news: ['s-news', ICONS.news, '#fcc419', 'Новости', 'секретная', 'Новости'],
        tax: ['s-tax', ICONS.tax, '#ff8a80', 'Налог', `−${money(v.config.taxCell)}`, 'Налог'],
        bankdeal: ['s-deal', ICONS.deal, '#6fdc8c', 'Сделка с банком', `+${money(v.config.bankDeal)}`, 'Банк'],
        auction: ['s-auction', ICONS.auction, '#b197fc', 'Аукцион', '10% с торгов', 'Аукцион'],
        rumor: ['s-rumor', ICONS.rumor, '#63e6be', 'Слух', '±10% любой', 'Слух'],
        dividends: ['s-deal', ICONS.dividends, '#6fdc8c', 'Дивиденды', '5% от долей', 'Дивид.'],
        exchange: ['s-corner', ICONS.exchange, '#e8ebf0', 'Бирже\u00adвые торги', 'продать банку −10%', 'Биржа'],
        audit: ['s-corner', ICONS.audit, '#e8ebf0', 'Нало\u00adговая про\u00adверка', '−10% от долей', 'Аудит'],
      }[cell.type];
      html += `<div class="cell special ${sp[0]} ${isMine ? 'here' : ''}" data-idx="${i}" style="${style}" title="${esc(sp[3].replace(/\u00ad/g, ''))}: ${esc(sp[4])}">${svg(sp[1], 20, sp[2], 2.2)}<div class="t1"><span class="nfull">${sp[3]}</span><span class="nshort">${sp[5]}</span></div><div class="t2">${sp[4]}</div>${tokens}</div>`;
    }
  });
  html += `<div class="center" style="grid-row:2 / span ${G - 2};grid-column:2 / span ${G - 2}">${isMobile() ? centerTop() : centerHtml()}</div></div>`;
  return html;
}

const die = (n) => {
  const pips = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]] }[n];
  return `<svg width="56" height="56" viewBox="0 0 100 100" role="img" aria-label="Кубик: ${n}"><rect x="5" y="5" width="90" height="90" rx="18" fill="#e8ebf0"/>${pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="#0f1115"/>`).join('')}</svg>`;
};

// Центр поля разбит на три части: верх (круг, таймер, кубики), события и кнопки.
// На компьютере всё внутри поля, на телефоне события идут под полем, а кнопки — в нижней панели.
function centerTop() {
  const v = S.view;
  const cur = pl(v.currentId);
  let h = '';
  if (v.phase === 'over' && v.winner) {
    h += `<div class="winner">Победил ${esc(v.winner.name)}!</div><div class="muted">${esc(v.winner.why)}</div>
      <a class="btn btn-primary" href="/" style="display:inline-flex;align-items:center;text-decoration:none">Новая игра</a>`;
  } else {
    h += `<div class="turnlabel">Круг ${v.round} · ${myTurn() ? 'ходите вы' : 'ходит ' + esc(cur ? cur.name : '')} · <span class="turntimer turn-timer">—</span></div>`;
  }
  if (S.anim && S.anim.rolling) h += `<div class="dice rolling" id="dice">${die(rnd6())}${die(rnd6())}</div>`;
  else if (S.anim) h += `<div class="dice" id="dice">${die(S.anim.dice[0])}${die(S.anim.dice[1])}</div>`;
  else if (v.dice) h += `<div class="dice" id="dice">${die(v.dice[0])}${die(v.dice[1])}</div>`;
  // На телефоне в центре поля — последние записи журнала, чтобы видеть, что происходит, без переключения вкладок
  if (isMobile() && v.log.length) h += `<div class="mlog">${[...v.log].slice(-4).reverse().map((l) => `<div>${colorize(l.text)}</div>`).join('')}</div>`;
  return h;
}

function centerInfo() {
  const v = S.view;
  let h = '';
  if (v.marketEvent && v.marketEvent.round === v.round) {
    const me2 = v.marketEvent;
    h += `<div class="marketbar">${svg(ICONS.exchange, 22, me2.up ? '#3fb950' : '#ff6b62', 2)}<div><b>Событие круга ${me2.round}: ${esc(me2.title)}.</b> ${esc(me2.text)}</div></div>`;
  }
  const hideEvent = S.anim && v.lastEvent && v.lastEvent.pid === S.anim.pid;  // не раскрываем, куда придёт фишка
  if (v.lastEvent && !hideEvent) {
    h += `<div class="event"><div class="et">${esc(v.lastEvent.title)}</div><div class="ex">${colorize(v.lastEvent.text)}</div></div>`;
  }
  for (const n of v.news) {
    const who = pl(n.chooserId);
    const when = n.turnsLeft <= 1 ? 'на следующем ходу' : `через ${n.turnsLeft} ход${n.turnsLeft < 5 ? 'а' : 'ов'}`;
    h += n.known
      ? `<div class="newsbar">${svg(ICONS.clock, 22, '#fcc419', 2)}<div><b>${esc(n.title)} (${esc(n.effect)})</b> — ${when}. ${esc(n.text)}<br><span style="color:#e0b94c">Это знаете вы${who && who.id !== S.pid ? ` и ${esc(who.name)}` : ''}.</span></div></div>`
      : `<div class="newsbar">${svg(ICONS.clock, 22, '#fcc419', 2)}<div><b>${when[0].toUpperCase() + when.slice(1)} — новость про «${esc(v.industries[n.industry].name)}».</b> Вверх или вниз, знает только ${esc(who ? who.name : '?')}.</div></div>`;
  }
  return h;
}

function centerActions() {
  const v = S.view;
  const cur = pl(v.currentId);
  const my = me();
  if (v.phase === 'over' || S.anim) return '';
  let a = '';
  if (myTurn()) {
    if (!v.turn.rolled) a += '<button class="btn btn-primary btn-big" data-act="roll">Бросить кубики</button>';
    else if (v.turn.newsChoice) a += '<button class="btn btn-primary btn-big" data-act="news">Выбрать новость</button>';
    else {
      const cell = v.board[my.pos];
      if (cell.type === 'company') a += `<button class="btn" data-act="open" data-id="${cell.id}">Карточка ${esc(v.companies[cell.id].name)}</button>`;
      if (v.auction) a += '<div class="muted">Идёт аукцион…</div>';
      else a += v.turn.extraRoll
        ? '<button class="btn btn-primary" data-act="roll">Дубль! Бросить ещё раз</button>'
        : '<button class="btn btn-primary" data-act="end">Завершить ход</button>';
    }
  } else if (cur && !cur.online) {
    a += `<button class="btn" data-act="skip">Пропустить ход ${esc(cur.name)} (не в сети)</button>`;
  } else if (v.turn.choosing) {
    a += `<div class="muted">${esc(cur.name)} выбирает секретную новость…</div>`;
  }
  return a;
}

function centerHtml() {
  const a = centerActions();
  return centerTop() + centerInfo() + (a ? `<div class="center-actions">${a}</div>` : '');
}

// Имена игроков в тексте подсвечиваются их цветом
function colorize(text) {
  let h = esc(text);
  const names = S.view.players.filter((p) => p.name.length >= 2).map((p) => ({ n: esc(p.name), c: p.color })).sort((a, b) => b.n.length - a.n.length);
  names.forEach((x, i) => { h = h.split(x.n).join(`\u0001${i}\u0002`); });
  names.forEach((x, i) => { h = h.split(`\u0001${i}\u0002`).join(`<b style="color:${x.c}">${x.n}</b>`); });
  return h;
}
const logCard = () => `<div class="card"><div class="h">Журнал</div><div class="log">${[...S.view.log].reverse().map((l) => `<div>${colorize(l.text)}</div>`).join('')}</div></div>`;

function rightHtml(withLog = true) {
  const v = S.view;
  const my = me();
  if (!my) return '<div class="card">Вы наблюдаете за игрой</div>';
  let h = withLog ? logCard() : '';

  // Действия на клетке
  let act = '';
  if (S.anim && S.anim.pid === S.pid) act += '<div class="hint">Фишка идёт…</div>';
  else if (myTurn() && v.turn.rolled && !my.out) {
    const cell = v.board[my.pos];
    if (cell.type === 'company') {
      const c = v.companies[cell.id];
      const bought = my.bankBought[c.id] || 0;
      const visit = (v.turn.bankVisit || {})[c.id] || 0;
      const can = bankShares(c.id) > 0 && bought < v.config.bankLimitShares && visit < v.config.bankPerVisit && my.cash >= c.price / 10;
      act += `<button class="btn btn-primary btn-big" data-act="buyBank" data-id="${c.id}" ${can ? '' : 'disabled'}>Купить 10% ${esc(c.name)} · ${money(c.price / 10)}</button>
        <div class="hint">${bankLimitText(c.id)}${my.cash < c.price / 10 ? ' Не хватает наличных.' : ''}</div>`;
    }
    if (cell.type === 'exchange') {
      const mine = Object.values(v.companies).filter((c) => sellable(c.id) > 0);
      act += '<div class="hint">Вы на биржевых торгах: можно продать доли банку по цене −10%.</div>';
      act += mine.length ? mine.map((c) => `<div class="offer"><span class="ico" style="background:${IND[c.industry].color}">${indIcon(c.industry, 16)}</span><div class="info"><div class="l1">${esc(c.name)} · у вас ${sharesOf(S.pid, c.id) * 10}%</div><div class="l2">10% банку за ${money(Math.round(c.price / 10 * (1 - v.config.bankSellDiscount) / 100) * 100)}</div></div><button class="btn btn-sm" data-act="sellBank" data-id="${c.id}">Продать</button></div>`).join('')
        : '<div class="hint">Продавать нечего.</div>';
    }
  }
  if (myTurn() && v.turn.rumor && !(S.anim && S.anim.pid === S.pid)) {
    const opts = Object.values(v.companies).map((c) => `<option value="${c.id}">${esc(c.name)} · ${short(c.price)}</option>`).join('');
    act += `<div class="box" style="background:#0f2a26;border:1px solid #1f5a50">
      <div class="h" style="color:#96f2d7">Слух</div>
      <div class="hint" style="color:var(--soft)">Бесплатно и без кубика: цена выбранной компании изменится на 10%.</div>
      <label for="rumor-company" class="hint">Компания</label>
      <select id="rumor-company" class="input">${opts}</select>
      <div class="row"><button class="btn btn-up" data-act="rumor" data-dir="up">▲ +10%</button><button class="btn btn-down" data-act="rumor" data-dir="down">▼ −10%</button></div>
      <button class="btn btn-sm" data-act="skipRumor">Не пускать слух</button>
    </div>`;
  }
  if (myTurn()) act += `<div class="hint">${v.turn.lobbied ? 'В этот ход вы уже лоббировали.' : 'Лоббировать можно любую компанию: нажмите на её клетку.'}</div>`;
  if (act) h += `<div class="card"><div class="h">Действия</div>${act}</div>`;

  // Портфель
  const port = Object.values(v.companies).filter((c) => sharesOf(S.pid, c.id) > 0);
  h += `<div class="card"><div class="h">Ваши доли</div>${port.length ? port.map((c) => `<div class="offer"><span class="ico" style="background:${IND[c.industry].color}">${indIcon(c.industry, 16)}</span><div class="info"><div class="l1">${esc(c.name)} · ${sharesOf(S.pid, c.id) * 10}%</div><div class="l2">${money(sharesOf(S.pid, c.id) * c.price / 10)} · ${chg(c)}</div></div><button class="btn btn-sm" data-act="open" data-id="${c.id}">Открыть</button></div>`).join('') : '<div class="hint">Пока нет. Встаньте на клетку компании и купите долю у банка.</div>'}</div>`;

  // Предложения
  h += `<div class="card"><div class="h">Продают игроки</div>${v.offers.length ? v.offers.map(offerRow).join('') : '<div class="hint">Пока никто ничего не продаёт. Выставить свою долю можно в карточке компании.</div>'}</div>`;
  const out = (v.trades || []).find((t) => t.from === S.pid);
  h += `<div class="card"><div class="h">Обмен</div>
    ${out ? `<div class="hint" style="color:var(--soft)">Вы предложили обмен игроку <b style="color:${pl(out.to) ? pl(out.to).color : '#fff'}">${esc(pl(out.to) ? pl(out.to).name : '?')}</b>. Ждём ответа.</div>
      <button class="btn btn-sm" data-act="tradeCancel" data-id="${out.id}">Отменить предложение</button>`
      : `<div class="hint">Предложите свои доли за чужие, можно с доплатой. Другому игроку предложение всплывёт посередине экрана.</div>
      <button class="btn btn-outline-blue" data-act="tradeOpen" ${v.phase === 'over' || my.out ? 'disabled' : ''}>Предложить обмен</button>`}
  </div>`;

  return h;
}

function offerRow(o) {
  const v = S.view;
  const c = v.companies[o.companyId];
  const s = pl(o.sellerId);
  const market = o.shares * c.price / 10;
  const mine = o.sellerId === S.pid;
  const btn = mine ? `<button class="btn btn-sm" data-act="cancelOffer" data-id="${o.id}">Снять</button>`
    : `<button class="btn btn-sm btn-outline-blue" data-act="buyOffer" data-id="${o.id}" ${myTurn() && me().cash >= o.price ? '' : 'disabled'} title="${myTurn() ? '' : 'Купить можно в свой ход'}">Купить</button>`;
  return `<div class="offer"><span class="ico" style="background:${IND[c.industry].color}">${indIcon(c.industry, 16)}</span>
    <div class="info"><div class="l1">${o.shares * 10}% ${esc(c.name)} · ${money(o.price)}</div><div class="l2">${mine ? 'ваше предложение' : esc(s ? s.name : '')} · по рынку ${money(market)}</div></div>${btn}</div>`;
}

// ---------- Окна ----------
function modalHtml() {
  if (S.view.auction && !S.anim) return auctionModal();
  const inc = !S.anim && (S.view.trades || []).find((t) => t.to === S.pid);
  if (inc) return incomingTradeModal(inc);
  if (!S.modal) return '';
  if (S.modal.type === 'trade') return tradeModal();
  if (S.modal.type === 'company') return companyModal(S.modal.id);
  if (S.modal.type === 'news') return S.anim ? '' : newsModal();
  if (S.modal.type === 'rules') return rulesModal();
  return '';
}

function auctionModal() {
  const v = S.view;
  const a = v.auction;
  const c = v.companies[a.companyId];
  const ind = IND[c.industry];
  const starter = pl(a.starterId);
  const my = me();
  const step = v.config.auctionStep;
  const top = a.top;
  const leader = top && pl(top.pid);
  const iLead = top && top.pid === S.pid;
  const iPassed = a.passed.includes(S.pid);
  const iBid = a.history.some((h) => h.pid === S.pid);
  const outbid = !iLead && iBid && !iPassed;
  const next = top ? top.amount + step : a.minBid;
  const canAct = my && !my.out && !iPassed && !iLead;
  let actions;
  if (!my || my.out) actions = '<div class="box">Вы наблюдаете за аукционом.</div>';
  else if (iPassed) actions = '<div class="box">Вы вышли из торгов. Ждём, кто победит.</div>';
  else if (iLead) actions = `<div class="box" style="background:#10261a;border:1px solid #1f5233;color:#a7f0bb"><b>Ваша ставка самая высокая.</b> Если 10 секунд никто не перебьёт — доля ваша.</div>`;
  else actions = `
    <div class="row">
      <button class="btn btn-primary" data-act="raise" data-inc="${step}" ${my.cash >= next ? '' : 'disabled'}>${top ? `Повысить до ${money(next)}` : `Поставить ${money(next)}`}</button>
      ${top ? `<button class="btn" data-act="raise" data-inc="1000" ${my.cash >= top.amount + 1000 ? '' : 'disabled'} style="flex:0 0 auto">+1 000 $</button>` : ''}
    </div>
    <button class="btn" data-act="pass">Выйти из торгов</button>`;
  return `<div class="overlay"><div class="modal" style="width:min(620px,100%)" role="dialog" aria-label="Аукцион">
    <div class="mtop" style="background:#b197fc"></div>
    <div class="mbody">
      <div class="mhead">
        <div><div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#d0bfff">АУКЦИОН · ОТКРЫЛ ${esc((starter ? starter.name : '').toUpperCase())}</div>
          <div style="font-size:clamp(20px,5.5vw,26px);font-weight:800;letter-spacing:-.02em">Банк продаёт 10%</div></div>
        <div class="stat"><div class="s1">${top ? 'До удара молотка' : 'Ждём первую ставку'}</div><div class="s2 num" id="auction-timer">—</div></div>
      </div>
      <div style="display:flex;gap:14px;align-items:center">
        <div class="bigicon" style="background:${ind.color}">${indIcon(c.industry, 30)}</div>
        <div><div style="font-size:24px;font-weight:800">${esc(c.name)}</div>
          <div class="muted num">10% по рынку ${money(c.price / 10)} · стартовая цена ${money(a.minBid)}</div></div>
      </div>
      ${outbid ? `<div class="box" style="background:#2a1416;border:1px solid #5c2226;color:#ffb3ad"><b>Вас перебили!</b> ${esc(leader ? leader.name : '')} поставил ${money(top.amount)}. Повысите ещё?</div>` : ''}
      <div class="box" style="text-align:center">
        <div class="muted" style="font-size:13px">${top ? 'Текущая ставка' : 'Ставок пока нет'}</div>
        <div class="big" style="font-size:34px">${money(top ? top.amount : a.minBid)}</div>
        ${leader ? `<div>лидирует <b style="color:${leader.color}">${esc(leader.name)}</b></div>` : ''}
      </div>
      ${canAct || iLead || iPassed || !my ? actions : actions}
      ${a.history.length ? `<div class="log" style="max-height:110px">${[...a.history].reverse().map((h) => { const p = pl(h.pid); return `<div><b style="color:${p ? p.color : '#fff'}">${esc(p ? p.name : '?')}</b> — ${money(h.amount)}</div>`; }).join('')}</div>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:8px">${v.players.filter((p) => !p.out).map((p) => {
        const st = a.passed.includes(p.id) ? 'пас' : top && top.pid === p.id ? 'лидер' : 'в торгах';
        return `<span class="tag tag-grey" style="${a.passed.includes(p.id) ? 'opacity:.5' : ''}"><span style="color:${p.color}">●</span> ${esc(p.name)} — ${st}</span>`;
      }).join('')}</div>
      <div class="hint">Ставки видят все. Если ${10} секунд никто не повышает, лот уходит лидеру. Эта доля не считается в лимит 30% у банка.</div>
    </div></div></div>`;
}

// ---------- Обмен ----------
const val10 = (cid, n) => (cid ? n * S.view.companies[cid].price / 10 : 0);
// сколько долей игрок может отдать (без выставленных на продажу); для себя ещё минус купленное в этот ход
function freeShares(pid, cid) {
  if (pid === S.pid) return sellable(cid);
  const listed = S.view.offers.filter((o) => o.sellerId === pid && o.companyId === cid).reduce((a, o) => a + o.shares, 0);
  return Math.max(0, sharesOf(pid, cid) - listed);
}
function tradeModal() {
  const v = S.view;
  const m = S.modal;
  const others = v.players.filter((p) => !p.out && p.id !== S.pid);
  if (!others.length) return '';
  if (!others.find((p) => p.id === m.to)) m.to = others[0].id;
  const partner = pl(m.to);
  const myCos = Object.values(v.companies).filter((c) => freeShares(S.pid, c.id) > 0);
  const theirCos = Object.values(v.companies).filter((c) => freeShares(m.to, c.id) > 0);
  if (m.give && !myCos.find((c) => c.id === m.give)) m.give = '';
  if (m.get && !theirCos.find((c) => c.id === m.get)) m.get = '';
  const nOpts = (max, cur) => Array.from({ length: max }, (_, k) => `<option value="${k + 1}" ${cur === k + 1 ? 'selected' : ''}>${(k + 1) * 10}%</option>`).join('');
  const giveMax = m.give ? freeShares(S.pid, m.give) : 0;
  const getMax = m.get ? freeShares(m.to, m.get) : 0;
  m.giveN = Math.min(Math.max(1, m.giveN || 1), Math.max(1, giveMax));
  m.getN = Math.min(Math.max(1, m.getN || 1), Math.max(1, getMax));
  return `<div class="overlay" data-act="close-bg"><div class="modal" style="width:min(640px,100%)" role="dialog" aria-label="Предложить обмен">
    <div class="mtop" style="background:var(--blue)"></div>
    <div class="mbody">
      <div class="mhead"><div style="font-size:clamp(20px,5.5vw,26px);font-weight:800">Предложить обмен</div>
        <button class="btn" data-act="close" aria-label="Закрыть" style="width:44px;padding:0">${svg(ICONS.close, 18, 'currentColor', 2.2)}</button></div>
      <div class="field"><label for="trade-to">С кем</label>
        <select id="trade-to" class="input">${others.map((p) => `<option value="${p.id}" ${p.id === m.to ? 'selected' : ''}>${esc(p.name)}${p.isBot ? ' (бот)' : ''}</option>`).join('')}</select></div>
      <div class="box"><div class="h">Вы отдаёте</div>
        <div class="row">
          <select id="trade-give" class="input"><option value="">— ничего —</option>${myCos.map((c) => `<option value="${c.id}" ${c.id === m.give ? 'selected' : ''}>${esc(c.name)} · у вас ${sharesOf(S.pid, c.id) * 10}%</option>`).join('')}</select>
          ${m.give ? `<select id="trade-give-n" class="input" style="flex:0 0 96px">${nOpts(giveMax, m.giveN)}</select>` : ''}
        </div></div>
      <div class="box"><div class="h">Вы получаете от ${esc(partner.name)}</div>
        <div class="row">
          <select id="trade-get" class="input"><option value="">— ничего —</option>${theirCos.map((c) => `<option value="${c.id}" ${c.id === m.get ? 'selected' : ''}>${esc(c.name)} · у него ${sharesOf(m.to, c.id) * 10}%</option>`).join('')}</select>
          ${m.get ? `<select id="trade-get-n" class="input" style="flex:0 0 96px">${nOpts(getMax, m.getN)}</select>` : ''}
        </div></div>
      <div class="box"><div class="h">Доплата</div>
        <div class="row">
          <select id="trade-cash-dir" class="input">
            <option value="none" ${m.dir === 'none' || !m.dir ? 'selected' : ''}>без доплаты</option>
            <option value="me" ${m.dir === 'me' ? 'selected' : ''}>я доплачиваю</option>
            <option value="them" ${m.dir === 'them' ? 'selected' : ''}>${esc(partner.name)} доплачивает</option>
          </select>
          <input id="trade-cash" class="input" type="number" min="0" step="500" value="${m.cash || 0}" ${m.dir && m.dir !== 'none' ? '' : 'disabled'} aria-label="Сумма доплаты" style="flex:0 0 130px">
        </div>
        <button class="btn btn-sm" data-act="tradeBalance">Уравнять доплатой</button>
      </div>
      <div id="trade-summary" class="box" style="background:var(--deep)">${tradeSummary()}</div>
      <div class="row"><button class="btn btn-primary" data-act="tradeSend">Отправить предложение</button><button class="btn" data-act="close" style="flex:0 0 auto">Отмена</button></div>
    </div></div></div>`;
}
function tradeCash() { const m = S.modal; return m.dir === 'me' ? (Number(m.cash) || 0) : m.dir === 'them' ? -(Number(m.cash) || 0) : 0; }
function tradeSummary() {
  const m = S.modal;
  const give = val10(m.give, m.giveN || 1);
  const get = val10(m.get, m.getN || 1);
  const cash = tradeCash();
  const net = get - give - cash; // плюс — выгодно вам по рыночным ценам
  return `<div class="kv"><span>Вы отдаёте по рынку</span><b>${money(give + Math.max(0, cash))}</b></div>
    <div class="kv"><span>Вы получаете по рынку</span><b>${money(get + Math.max(0, -cash))}</b></div>
    <div class="kv"><span>Итого для вас</span><b class="${net > 0 ? 'up' : net < 0 ? 'down' : ''}">${net > 0 ? '+' : net < 0 ? '−' : ''}${money(Math.abs(net))}</b></div>`;
}
function incomingTradeModal(t) {
  const v = S.view;
  const from = pl(t.from);
  const gets = val10(t.giveCid, t.giveN) + Math.max(0, t.cash);
  const gives = val10(t.getCid, t.getN) + Math.max(0, -t.cash);
  const net = gets - gives;
  const line = (cid, n) => { const c = v.companies[cid]; return `<span class="ico" style="width:26px;height:26px;border-radius:7px;background:${IND[c.industry].color};display:inline-flex;align-items:center;justify-content:center;vertical-align:middle">${indIcon(c.industry, 15)}</span> <b>${n * 10}% ${esc(c.name)}</b> <span class="muted">≈ ${money(val10(cid, n))}</span>`; };
  return `<div class="overlay"><div class="modal" style="width:min(560px,100%)" role="dialog" aria-label="Предложение обмена">
    <div class="mtop" style="background:${from ? from.color : 'var(--blue)'}"></div>
    <div class="mbody">
      <div><div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--muted)">ПРЕДЛОЖЕНИЕ ОБМЕНА</div>
        <div style="font-size:clamp(20px,5.5vw,26px);font-weight:800"><span style="color:${from ? from.color : '#fff'}">${esc(from ? from.name : '?')}</span> предлагает обмен</div></div>
      <div class="box"><div class="h">Вы получаете</div>
        ${t.giveCid ? `<div>${line(t.giveCid, t.giveN)}</div>` : ''}
        ${t.cash > 0 ? `<div><b class="up">+${money(t.cash)}</b> доплата</div>` : ''}
        ${!t.giveCid && t.cash <= 0 ? '<div class="muted">ничего</div>' : ''}</div>
      <div class="box"><div class="h">Вы отдаёте</div>
        ${t.getCid ? `<div>${line(t.getCid, t.getN)}</div>` : ''}
        ${t.cash < 0 ? `<div><b class="down">−${money(-t.cash)}</b> доплата</div>` : ''}
        ${!t.getCid && t.cash >= 0 ? '<div class="muted">ничего</div>' : ''}</div>
      <div class="kv" style="font-size:15px"><span>По рыночным ценам для вас</span><b class="${net > 0 ? 'up' : net < 0 ? 'down' : ''}">${net > 0 ? '+' : net < 0 ? '−' : ''}${money(Math.abs(net))}</b></div>
      <div class="row"><button class="btn btn-primary" data-act="tradeAccept" data-id="${t.id}">Принять</button><button class="btn btn-down" data-act="tradeDecline" data-id="${t.id}">Отклонить</button></div>
    </div></div></div>`;
}

function companyModal(cid) {
  const v = S.view;
  const c = v.companies[cid];
  const ind = IND[c.industry];
  const my = me();
  const ctrl = controller(cid);
  const rent = Math.round(c.price * v.config.rentRate * (ctrl ? 2 : 1));
  const owners = Object.entries(c.owners).sort((a, b) => b[1] - a[1]);
  const segs = [];
  for (const [id, n] of owners) for (let k = 0; k < n; k++) { const p = pl(id); segs.push(`<div class="seg" style="background:${p ? p.color : '#666'}">${esc(p ? p.name[0].toUpperCase() : '?')}</div>`); }
  while (segs.length < 10) segs.push('<div class="seg free"></div>');
  const standing = my && my.pos === v.board.findIndex((b) => b.id === cid);
  const bought = my ? my.bankBought[cid] || 0 : 0;
  const visit = (v.turn.bankVisit || {})[cid] || 0;
  const canBuyBank = myTurn() && v.turn.rolled && standing && bankShares(cid) > 0 && bought < v.config.bankLimitShares && visit < v.config.bankPerVisit && my.cash >= c.price / 10;
  const lobbyCost = Math.round(c.price * v.config.lobbyRate);
  const canLobby = myTurn() && !v.turn.lobbied && my.cash >= lobbyCost;
  const offers = v.offers.filter((o) => o.companyId === cid);
  const sel = my ? sellable(cid) : 0;

  let buyText;
  if (!standing) buyText = 'Купить у банка можно, только встав на клетку этой компании.';
  else buyText = bankLimitText(cid);

  return `<div class="overlay" data-act="close-bg"><div class="modal" role="dialog" aria-label="Карточка компании ${esc(c.name)}">
    <div class="mtop" style="background:${ind.color}"></div>
    <div class="mbody">
      <div class="mhead">
        <div style="display:flex;gap:16px;align-items:center">
          <div class="bigicon" style="background:${ind.color}">${indIcon(c.industry, 32)}</div>
          <div>
            <div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:${ind.label}">${esc(v.industries[c.industry].name.toUpperCase())}</div>
            <div style="font-size:clamp(24px,6vw,34px);font-weight:800;letter-spacing:-.02em;line-height:1.05">${esc(c.name)}</div>
            <div class="num" style="margin-top:4px"><span style="font-size:22px;font-weight:800">${money(c.price)}</span> &nbsp;${chg(c)} <span class="muted">с начала игры</span></div>
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <div class="stat"><div class="s1">Аренда</div><div class="s2 num">${money(rent)}${ctrl ? ' (×2)' : ''}</div></div>
          <div class="stat"><div class="s1">Контрольный пакет</div><div class="s2">${ctrl ? esc(pl(ctrl).name) : 'ни у кого'}</div></div>
          <button class="btn" data-act="close" aria-label="Закрыть" style="width:44px;padding:0">${svg(ICONS.close, 18, 'currentColor', 2.2)}</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div class="h">Кому принадлежит</div>
        <div class="segs">${segs.join('')}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;color:var(--soft)">
          ${owners.map(([id, n]) => `<span><b style="color:var(--text)">${esc(pl(id) ? pl(id).name : '?')}</b> ${n * 10}%</span>`).join('')}
          <span class="muted">Свободно у банка ${bankShares(cid) * 10}%</span>
        </div>
      </div>
      <div class="grid2">
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="box"><div class="h">Купить у банка</div><div class="hint" style="color:var(--soft)">${buyText}</div>
            <button class="btn btn-primary" data-act="buyBank" data-id="${cid}" ${canBuyBank ? '' : 'disabled'}>Купить 10% · ${money(c.price / 10)}</button></div>
          <div class="box"><div style="display:flex;justify-content:space-between"><div class="h">Лоббирование</div><b class="num">${money(lobbyCost)}</b></div>
            <div class="hint" style="color:var(--soft)">Цена ±15%, если на кубике выпадет 4–6. При 1–3 деньги пропадают. Один раз за ход.</div>
            <div class="row"><button class="btn btn-up" data-act="lobby" data-id="${cid}" data-dir="up" ${canLobby ? '' : 'disabled'}>▲ Поднять</button><button class="btn btn-down" data-act="lobby" data-id="${cid}" data-dir="down" ${canLobby ? '' : 'disabled'}>▼ Уронить</button></div></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="box"><div class="h">Продают игроки</div>${offers.length ? offers.map(offerRow).join('') : '<div class="hint">Никто не продаёт.</div>'}</div>
          <div class="box"><div class="h">Выставить свою долю</div>
            ${sel > 0 ? `<div class="row">
                <div class="field"><label for="sell-shares">Сколько</label><select id="sell-shares" class="input">${Array.from({ length: sel }, (_, k) => `<option value="${k + 1}">${(k + 1) * 10}%</option>`).join('')}</select></div>
                <div class="field"><label for="sell-price">Ваша цена, $</label><input id="sell-price" class="input" type="number" min="1000" step="500" value="${Math.round(c.price / 10 * 1.15 / 500) * 500}"></div>
              </div>
              <button class="btn btn-light" data-act="offer" data-id="${cid}">Выставить на продажу</button>
              <div class="hint">По рынку 10% стоит ${money(c.price / 10)}. Купленное в этот ход продать нельзя.</div>`
              : `<div class="hint">${sharesOf(S.pid, cid) > 0 ? 'Все ваши доли уже выставлены или куплены в этот ход.' : 'У вас нет долей этой компании.'}</div>`}
          </div>
        </div>
      </div>
    </div>
  </div></div>`;
}

function newsModal() {
  const v = S.view;
  const opts = v.turn.newsChoice || [];
  return `<div class="overlay"><div class="modal" role="dialog" aria-label="Выбор секретной новости"><div class="mbody">
    <div class="mhead"><div><div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#fcc419">КЛЕТКА «НОВОСТИ»</div>
      <div style="font-size:clamp(20px,5.5vw,28px);font-weight:800;letter-spacing:-.02em">Выберите, что случится через 2 круга</div></div>
      <span class="tag tag-yellow" style="font-size:13px;padding:8px 14px">Видите только вы</span></div>
    <div class="newsgrid">${opts.map((o, i) => `<div class="ncard">
      <div style="display:flex;align-items:center;gap:8px"><span class="ico" style="width:28px;height:28px;border-radius:7px;background:${IND[o.industry].color};display:flex;align-items:center;justify-content:center">${indIcon(o.industry, 16)}</span><span style="font-size:12px;font-weight:700;letter-spacing:.06em;color:${IND[o.industry].label}">${esc(v.industries[o.industry].name.toUpperCase())}</span></div>
      <div style="font-size:18px;font-weight:800;line-height:1.15">${esc(o.title)}</div>
      <div class="eff ${o.up === true ? 'up' : o.up === false ? 'down' : ''}">${esc(o.effect)}</div>
      <div class="hint" style="color:var(--soft);font-size:13px">${esc(o.text)}</div>
      <button class="btn btn-primary" style="margin-top:auto" data-act="chooseNews" data-idx="${i}">Выбрать</button></div>`).join('')}</div>
    <div class="box" style="background:var(--deep)"><span>Остальные игроки увидят только отрасль. Вверх или вниз, они не узнают.</span></div>
  </div></div></div>`;
}

function rulesModal() {
  return `<div class="overlay" data-act="close-bg"><div class="modal" role="dialog" aria-label="Правила"><div class="mbody">
    <div class="mhead"><div style="font-size:26px;font-weight:800">Правила коротко</div><button class="btn" data-act="close" aria-label="Закрыть" style="width:44px;padding:0">${svg(ICONS.close, 18, 'currentColor', 2.2)}</button></div>
    <div style="display:flex;flex-direction:column;gap:10px;line-height:1.5;color:var(--soft)">
      <div><b>Цель.</b> Старт со 150 000 $. Побеждает тот, у кого в начале его хода 400 000 $ наличными или 500 000 $ капитала (наличные + доли по текущей цене). Если время партии вышло — побеждает самый богатый.</div>
      <div><b>Время хода.</b> На ход 90 секунд. Не успели — кубики бросятся сами, и ход закончится.</div>
      <div><b>Дубли.</b> Выпали одинаковые кубики (например, 3 и 3) — после своей клетки ходите ещё раз, и на это даётся новых 90 секунд. Третий дубль подряд — фишка не идёт, вместо этого вы выбираете секретную новость, и ход заканчивается.</div>
      <div><b>Живой рынок.</b> В начале каждого круга все цены немного меняются сами (в среднем рынок растёт на 3%). Иногда случается общее событие: кризис, бум отрасли и т. п. Его никто не выбирает и не знает заранее.</div>
      <div><b>Доли.</b> Компания делится на 10 долей по 10%. Встав на клетку, можно купить у банка до 20% за одно попадание, а всего не больше 30% одной компании за игру. Остальное — только у игроков: через продажу или обмен.</div>
      <div><b>Аренда.</b> Встал на клетку компании — платишь 15% её цены владельцам по их долям. Непроданная часть не платится. У кого больше 50% — аренда ×2.</div>
      <div><b>Торговля.</b> Свою долю можно выставить по любой цене в карточке компании. Купить чужое предложение можно в свой ход, где бы вы ни стояли. Купленное в этот ход продать нельзя.</div>
      <div><b>Обмен.</b> Кнопка «Предложить обмен» или ⇄ у игрока: отдаёте свои доли за его доли, можно с доплатой в любую сторону. Видно, сколько стоит каждая сторона по рынку, и есть кнопка «Уравнять доплатой». Второму игроку предложение всплывает посередине экрана: принять или отклонить.</div>
      <div><b>Новости.</b> На клетке «Новости» выбираете одну из трёх. Она сработает через 2 круга. Текст видите только вы, остальные — лишь отрасль, без знака: вверх или вниз.</div>
      <div><b>Лоббирование.</b> Один раз за ход: платите 3% цены любой компании, бросок 4–6 — цена ±15%, 1–3 — деньги пропали.</div>
      <div><b>Углы.</b> Старт: +30 000 $ за проход. Два угла «Биржевые торги» друг напротив друга: продажа долей банку по цене −10%. Налоговая проверка: 10% от стоимости ваших долей.</div>
      <div><b>Особые клетки.</b> Аукцион (два на поле, друг напротив друга): банк продаёт 10% случайной компании, торги открытые — все видят ставки и повышают по 100 $ или по 1 000 $, кто не хочет — выходит. Если 10 секунд никто не повышает, лот уходит лидеру. Доля не считается в лимит 30%. Дивиденды: получите 5% от стоимости всех своих долей. Налог: −10 000 $. Сделка с банком: +15 000 $.</div>
      <div><b>Банкротство.</b> Если нечем платить, доли сами продаются банку по цене −10%. Не хватило и этого — игрок выбывает.</div>
    </div></div></div></div>`;
}

// ---------- Таймер ----------
const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
function tick() {
  if (!S.view) return;
  const now = Date.now() + S.clockOffset;
  const el = document.getElementById('timer');
  if (el && S.view.endsAt) el.textContent = mmss(S.view.endsAt - now);
  const at = document.getElementById('auction-timer');
  if (at && S.view.auction) at.textContent = mmss(S.view.auction.endsAt - now);
  const live = S.view.phase === 'roll' || S.view.phase === 'action';
  for (const t of document.querySelectorAll('.turn-timer')) {
    const left = S.view.turnDeadline ? S.view.turnDeadline - now : 0;
    t.textContent = live ? mmss(left) : '';
    t.classList.toggle('low', live && left <= 15000);
  }
}

// ---------- Анимация хода ----------
function stopAnim() {
  if (!S.anim) return;
  S.anim.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
  S.anim = null;
}
function paintTokens(hopPid) {
  const v = S.view;
  const my = me();
  v.board.forEach((_, i) => {
    const box = document.getElementById('tok-' + i);
    if (box) box.innerHTML = v.players.filter((p) => !p.out && displayPos(p) === i).map((p) => tokenHtml(p, p.id === hopPid)).join('');
    const cell = document.querySelector(`[data-idx="${i}"]`);
    if (cell) cell.classList.toggle('here', !!(my && !my.out && displayPos(my) === i));
  });
}
function startAnim(lm) {
  stopAnim();
  const n = S.view.board.length;
  const a = { pid: lm.pid, from: lm.from, to: lm.to, cur: lm.from, dice: lm.dice, rolling: true, timers: [] };
  S.anim = a;
  render();
  // 1) кубики крутятся чуть больше секунды
  const spin = setInterval(() => {
    const d = document.getElementById('dice');
    if (d) d.innerHTML = die(rnd6()) + die(rnd6());
  }, 85);
  a.timers.push(spin);
  a.timers.push(setTimeout(() => {
    clearInterval(spin);
    a.rolling = false;
    const d = document.getElementById('dice');
    if (d) { d.classList.remove('rolling'); d.innerHTML = die(a.dice[0]) + die(a.dice[1]); }
    a.timers.push(setTimeout(step, 250));
  }, 1150));
  // 2) фишка шагает по клеткам и подпрыгивает на каждой
  function step() {
    if (S.anim !== a) return;
    if (a.cur === a.to) {
      a.timers.push(setTimeout(() => { if (S.anim === a) { S.anim = null; render(); } }, 300));
      return;
    }
    a.cur = (a.cur + 1) % n;
    paintTokens(a.pid);
    a.timers.push(setTimeout(step, 210));
  }
}
setInterval(tick, 1000);

// ---------- Нажатия ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  if (act === 'close-bg' && e.target !== t) return;
  const id = t.dataset.id;
  const nameVal = () => { const el = document.getElementById('name-input'); const n = el ? el.value.trim() : ''; if (n) LS.name = n; return n; };
  switch (act) {
    case 'create': { const n = nameVal(); if (!n) return toast('Введите имя'); send({ t: 'create', name: n }); break; }
    case 'join': { const n = nameVal(); if (!n) return toast('Введите имя'); send({ t: 'join', room: urlRoom, name: n, pid: LS.pid(urlRoom) }); break; }
    case 'start': send({ t: 'start', minutes: document.getElementById('minutes').value }); break;
    case 'addBot': send({ t: 'addBot' }); break;
    case 'removeBot': send({ t: 'removeBot', id }); break;
    case 'leave': send({ t: 'leave' }); S.view = null; history.replaceState(null, '', '/'); location.reload(); break;
    case 'copy': case 'copy-link': {
      const link = location.origin + '/?room=' + S.view.code;
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Ссылка скопирована', true), () => toast(link, true));
      break;
    }
    case 'rules': S.modal = { type: 'rules' }; render(); break;
    case 'mtab': S.mtab = t.dataset.tab; render(); break;
    case 'roll': send({ t: 'roll' }); break;
    case 'end': send({ t: 'endTurn' }); break;
    case 'skip': send({ t: 'skipTurn' }); break;
    case 'news': S.modal = { type: 'news' }; render(); break;
    case 'chooseNews': send({ t: 'chooseNews', idx: Number(t.dataset.idx) }); break;
    case 'open': S.modal = { type: 'company', id }; render(); break;
    case 'close': case 'close-bg': S.modal = null; render(); break;
    case 'buyBank': send({ t: 'buyBank', company: id }); break;
    case 'sellBank': send({ t: 'sellBank', company: id }); break;
    case 'lobby': send({ t: 'lobby', company: id, dir: t.dataset.dir }); break;
    case 'offer': {
      const shares = Number(document.getElementById('sell-shares').value);
      const price = Number(document.getElementById('sell-price').value);
      send({ t: 'offer', company: id, shares, price });
      break;
    }
    case 'cancelOffer': send({ t: 'cancelOffer', id: Number(id) }); break;
    case 'rumor': send({ t: 'rumor', company: document.getElementById('rumor-company').value, dir: t.dataset.dir }); break;
    case 'skipRumor': send({ t: 'skipRumor' }); break;
    case 'raise': send({ t: 'raise', inc: Number(t.dataset.inc) }); break;
    case 'pass': send({ t: 'pass' }); break;
    case 'tradeOpen': S.modal = { type: 'trade', to: t.dataset.to || null, give: '', get: '', giveN: 1, getN: 1, dir: 'none', cash: 0 }; render(); break;
    case 'tradeCancel': send({ t: 'cancelTrade', id: Number(id) }); break;
    case 'tradeAccept': send({ t: 'respondTrade', id: Number(id), accept: true }); break;
    case 'tradeDecline': send({ t: 'respondTrade', id: Number(id), accept: false }); break;
    case 'tradeBalance': {
      const m = S.modal;
      const diff = val10(m.get, m.getN || 1) - val10(m.give, m.giveN || 1); // >0: я получаю больше — я доплачиваю
      m.dir = diff > 0 ? 'me' : diff < 0 ? 'them' : 'none';
      m.cash = Math.round(Math.abs(diff) / 100) * 100;
      render();
      break;
    }
    case 'tradeSend': {
      const m = S.modal;
      send({ t: 'proposeTrade', trade: { to: m.to, giveCid: m.give || null, giveN: m.giveN, getCid: m.get || null, getN: m.getN, cash: tradeCash() } });
      S.modal = null; render();
      break;
    }
    case 'buyOffer': send({ t: 'buyOffer', id: Number(id) }); break;
  }
});
// Окно обмена: запоминаем выбор; при смене игрока или компании перерисовываем списки
function onTradeInput(e) {
  if (!S.modal || S.modal.type !== 'trade') return;
  const m = S.modal, el = e.target;
  const map = { 'trade-to': 'to', 'trade-give': 'give', 'trade-get': 'get', 'trade-give-n': 'giveN', 'trade-get-n': 'getN', 'trade-cash-dir': 'dir', 'trade-cash': 'cash' };
  const key = map[el.id];
  if (!key) return;
  m[key] = ['giveN', 'getN', 'cash'].includes(key) ? Number(el.value) : el.value;
  if (key === 'to') { m.get = ''; m.getN = 1; }
  if (['to', 'give', 'get', 'dir'].includes(key)) render();
  else { const sm = document.getElementById('trade-summary'); if (sm) sm.innerHTML = tradeSummary(); }
}
document.addEventListener('change', onTradeInput);
document.addEventListener('input', (e) => { if (e.target.id === 'trade-cash') onTradeInput(e); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.modal && S.modal.type !== 'news') { S.modal = null; render(); }
});

// При повороте телефона или изменении окна переключаемся между раскладками
let wasMobile = isMobile();
window.addEventListener('resize', () => {
  if (isMobile() !== wasMobile) { wasMobile = isMobile(); render(); }
});

render();
connect();
