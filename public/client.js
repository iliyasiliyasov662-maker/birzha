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
  insider: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
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
function cellPos(i) {
  if (i === 0) return [1, 1];
  if (i < 8) return [1, 1 + i];
  if (i === 8) return [1, 9];
  if (i < 16) return [1 + (i - 8), 9];
  if (i === 16) return [9, 9];
  if (i < 24) return [9, 9 - (i - 16)];
  if (i === 24) return [9, 1];
  return [9 - (i - 24), 1];
}
const indIcon = (ind, size = 13) => svg(IND[ind].icon, size);
const SHY = { mcd: 'Mc\u00adDonald\u2019s', exxon: 'Exxon\u00adMobil' };
const cellName = (c) => SHY[c.id] || c.name;
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
  for (const id of ['name-input', 'sell-price', 'sell-shares']) {
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
      ${v.players.map((p) => `<div class="prow">${avatar(p)}<div class="pname">${esc(p.name)}${p.id === S.pid ? ' (вы)' : ''}</div>${p.id === v.hostId ? '<span class="tag tag-grey">создатель</span>' : ''}${p.online ? '' : '<span class="tag tag-grey">не в сети</span>'}</div>`).join('')}
    </div>
    ${host ? `<div class="field"><label for="minutes">Длительность партии</label>
        <select id="minutes" class="input"><option value="30">30 минут</option><option value="45" selected>45 минут</option><option value="60">60 минут</option><option value="90">90 минут</option></select></div>
      <div class="hint">Если за это время никто не дойдёт до цели, победит игрок с самым большим капиталом.</div>
      <button class="btn btn-primary btn-big" data-act="start" ${v.players.length < 2 ? 'disabled' : ''}>${v.players.length < 2 ? 'Нужно минимум 2 игрока' : 'Начать игру'}</button>`
      : '<div class="muted">Ждём, пока создатель комнаты начнёт игру…</div>'}
    <button class="btn" data-act="leave">Выйти из комнаты</button>
  </div>`;
}

function gameScreen() {
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
    <div class="prow">${avatar(p)}<div class="pname">${esc(p.name)}${p.id === S.pid ? ' (вы)' : ''}</div>${tag}</div>
    <div class="kv"><span>Капитал</span><b>${money(p.capital)}</b></div>
    <div class="bar"><div style="width:${capPct}%;background:${p.color}"></div></div>
    <div class="kv"><span>Наличные</span><span>${money(p.cash)}</span></div>
  </div>`;
}

function boardHtml() {
  const v = S.view;
  const my = me();
  let html = '<div class="board">';
  v.board.forEach((cell, i) => {
    const [r, c] = cellPos(i);
    const style = `grid-row:${r};grid-column:${c}`;
    const here = v.players.filter((p) => !p.out && displayPos(p) === i);
    const tokens = `<div class="tokens" id="tok-${i}">${here.map((p) => tokenHtml(p)).join('')}</div>`;
    const isMine = my && !my.out && displayPos(my) === i;
    if (cell.type === 'company') {
      const co = v.companies[cell.id];
      const owners = Object.keys(co.owners).map((id) => pl(id)).filter(Boolean);
      html += `<button class="cell ${isMine ? 'here' : ''}" data-idx="${i}" style="${style}" data-act="open" data-id="${cell.id}" aria-label="${esc(co.name)}, цена ${short(co.price)}">
        <div class="band" style="background:${IND[co.industry].color}">${indIcon(co.industry)}</div>
        <div class="cbody">
          <div class="cname">${esc(cellName(co))}</div>
          <div class="cprice">${short(co.price)}</div>
          <div class="cfoot">${chg(co)}<span class="dots">${owners.map((p) => `<span class="dot" style="background:${p.color}"></span>`).join('')}</span></div>
        </div>${tokens}</button>`;
    } else {
      const sp = {
        start: ['s-start', ICONS.start, '#8fb6ff', 'СТАРТ', `+${money(v.config.salary)} зарплата`],
        news: ['s-news', ICONS.news, '#fcc419', 'Новости', 'секретная'],
        tax: ['s-tax', ICONS.tax, '#ff8a80', 'Налог', `−${money(v.config.taxCell)}`],
        bankdeal: ['s-deal', ICONS.deal, '#6fdc8c', 'Сделка с банком', `+${money(v.config.bankDeal)}`],
        insider: ['s-corner', ICONS.insider, '#e8ebf0', 'Инсайдер', 'подсмотреть новости'],
        exchange: ['s-corner', ICONS.exchange, '#e8ebf0', 'Бирже\u00adвые торги', 'продать банку −10%'],
        audit: ['s-corner', ICONS.audit, '#e8ebf0', 'Нало\u00adговая про\u00adверка', '−10% от долей'],
      }[cell.type];
      html += `<div class="cell special ${sp[0]} ${isMine ? 'here' : ''}" data-idx="${i}" style="${style}">${svg(sp[1], 20, sp[2], 2.2)}<div class="t1">${sp[3]}</div><div class="t2">${sp[4]}</div>${tokens}</div>`;
    }
  });
  html += `<div class="center">${centerHtml()}</div></div>`;
  return html;
}

const die = (n) => {
  const pips = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]], 6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]] }[n];
  return `<svg width="56" height="56" viewBox="0 0 100 100" role="img" aria-label="Кубик: ${n}"><rect x="5" y="5" width="90" height="90" rx="18" fill="#e8ebf0"/>${pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="#0f1115"/>`).join('')}</svg>`;
};

function centerHtml() {
  const v = S.view;
  const cur = pl(v.currentId);
  const my = me();
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
  if (v.marketEvent && v.marketEvent.round === v.round) {
    const me2 = v.marketEvent;
    h += `<div class="marketbar">${svg(ICONS.exchange, 22, me2.up ? '#3fb950' : '#ff6b62', 2)}<div><b>Событие круга ${me2.round}: ${esc(me2.title)}.</b> ${esc(me2.text)}</div></div>`;
  }
  const hideEvent = S.anim && v.lastEvent && v.lastEvent.pid === S.anim.pid;  // не раскрываем, куда придёт фишка
  if (v.lastEvent && !hideEvent) {
    h += `<div class="event"><div class="et">${esc(v.lastEvent.title)}</div><div class="ex">${esc(v.lastEvent.text)}</div></div>`;
  }
  for (const n of v.news) {
    const who = pl(n.chooserId);
    const when = n.turnsLeft <= 1 ? 'на следующем ходу' : `через ${n.turnsLeft} ход${n.turnsLeft < 5 ? 'а' : 'ов'}`;
    h += n.known
      ? `<div class="newsbar">${svg(ICONS.clock, 22, '#fcc419', 2)}<div><b>${esc(n.title)} (${esc(n.effect)})</b> — ${when}. ${esc(n.text)}<br><span style="color:#e0b94c">Это знаете вы${who && who.id !== S.pid ? ` и ${esc(who.name)}` : ''}.</span></div></div>`
      : `<div class="newsbar">${svg(ICONS.clock, 22, '#fcc419', 2)}<div><b>${when[0].toUpperCase() + when.slice(1)} — новость про «${esc(v.industries[n.industry].name)}».</b> Вверх или вниз, знает только ${esc(who ? who.name : '?')}.</div></div>`;
  }
  if (v.phase !== 'over' && !S.anim) {
    let a = '';
    if (myTurn()) {
      if (!v.turn.rolled) a += '<button class="btn btn-primary btn-big" data-act="roll">Бросить кубики</button>';
      else if (v.turn.newsChoice) a += '<button class="btn btn-primary btn-big" data-act="news">Выбрать новость</button>';
      else {
        const cell = v.board[my.pos];
        if (cell.type === 'company') a += `<button class="btn" data-act="open" data-id="${cell.id}">Карточка ${esc(v.companies[cell.id].name)}</button>`;
        a += v.turn.extraRoll
          ? '<button class="btn btn-primary" data-act="roll">Дубль! Бросить ещё раз</button>'
          : '<button class="btn btn-primary" data-act="end">Завершить ход</button>';
      }
    } else if (cur && !cur.online) {
      a += `<button class="btn" data-act="skip">Пропустить ход ${esc(cur.name)} (не в сети)</button>`;
    } else if (v.turn.choosing) {
      a += `<div class="muted">${esc(cur.name)} выбирает секретную новость…</div>`;
    }
    if (a) h += `<div class="center-actions">${a}</div>`;
  }
  return h;
}

function rightHtml() {
  const v = S.view;
  const my = me();
  if (!my) return '<div class="card">Вы наблюдаете за игрой</div>';
  const cashPct = Math.min(100, Math.round(my.cash / v.config.winCash * 100));
  const capPct = Math.min(100, Math.round(my.capital / v.config.winCapital * 100));
  let h = `<div class="card">
    <div class="h">Ваш капитал</div>
    <div class="big">${money(my.capital)}</div>
    <div class="kv"><span>Наличные</span><span>${money(my.cash)}</span></div>
    <div class="kv"><span>В акциях</span><span>${money(my.shares)}</span></div>
    <div class="kv" style="font-size:12px"><span>До ${money(v.config.winCash)} наличными</span><span>${cashPct}%</span></div>
    <div class="bar"><div style="width:${cashPct}%;background:var(--up)"></div></div>
    <div class="kv" style="font-size:12px"><span>До ${money(v.config.winCapital)} капиталом</span><span>${capPct}%</span></div>
    <div class="bar"><div style="width:${capPct}%;background:var(--blue)"></div></div>
  </div>`;

  // Действия на клетке
  let act = '';
  if (S.anim && S.anim.pid === S.pid) act += '<div class="hint">Фишка идёт…</div>';
  else if (myTurn() && v.turn.rolled && !my.out) {
    const cell = v.board[my.pos];
    if (cell.type === 'company') {
      const c = v.companies[cell.id];
      const bought = my.bankBought[c.id] || 0;
      const can = bankShares(c.id) > 0 && bought < v.config.bankLimitShares && my.cash >= c.price / 10;
      act += `<button class="btn btn-primary btn-big" data-act="buyBank" data-id="${c.id}" ${can ? '' : 'disabled'}>Купить 10% ${esc(c.name)} · ${money(c.price / 10)}</button>
        <div class="hint">${bankShares(c.id) <= 0 ? 'У банка не осталось свободных долей.' : `У банка вы купили ${bought * 10}% из ${v.config.bankLimitShares * 10}% возможных.`}${my.cash < c.price / 10 ? ' Не хватает наличных.' : ''}</div>`;
    }
    if (cell.type === 'exchange') {
      const mine = Object.values(v.companies).filter((c) => sellable(c.id) > 0);
      act += '<div class="hint">Вы на биржевых торгах: можно продать доли банку по цене −10%.</div>';
      act += mine.length ? mine.map((c) => `<div class="offer"><span class="ico" style="background:${IND[c.industry].color}">${indIcon(c.industry, 16)}</span><div class="info"><div class="l1">${esc(c.name)} · у вас ${sharesOf(S.pid, c.id) * 10}%</div><div class="l2">10% банку за ${money(Math.round(c.price / 10 * (1 - v.config.bankSellDiscount) / 100) * 100)}</div></div><button class="btn btn-sm" data-act="sellBank" data-id="${c.id}">Продать</button></div>`).join('')
        : '<div class="hint">Продавать нечего.</div>';
    }
  }
  if (myTurn()) act += `<div class="hint">${v.turn.lobbied ? 'В этот ход вы уже лоббировали.' : 'Лоббировать можно любую компанию: нажмите на её клетку.'}</div>`;
  if (act) h += `<div class="card"><div class="h">Действия</div>${act}</div>`;

  // Портфель
  const port = Object.values(v.companies).filter((c) => sharesOf(S.pid, c.id) > 0);
  h += `<div class="card"><div class="h">Ваши доли</div>${port.length ? port.map((c) => `<div class="offer"><span class="ico" style="background:${IND[c.industry].color}">${indIcon(c.industry, 16)}</span><div class="info"><div class="l1">${esc(c.name)} · ${sharesOf(S.pid, c.id) * 10}%</div><div class="l2">${money(sharesOf(S.pid, c.id) * c.price / 10)} · ${chg(c)}</div></div><button class="btn btn-sm" data-act="open" data-id="${c.id}">Открыть</button></div>`).join('') : '<div class="hint">Пока нет. Встаньте на клетку компании и купите долю у банка.</div>'}</div>`;

  // Предложения
  h += `<div class="card"><div class="h">Продают игроки</div>${v.offers.length ? v.offers.map(offerRow).join('') : '<div class="hint">Пока никто ничего не продаёт. Выставить свою долю можно в карточке компании.</div>'}</div>`;

  // Журнал
  h += `<div class="card"><div class="h">Журнал</div><div class="log">${[...v.log].reverse().map((l) => `<div>${esc(l.text)}</div>`).join('')}</div></div>`;
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
  if (!S.modal) return '';
  if (S.modal.type === 'company') return companyModal(S.modal.id);
  if (S.modal.type === 'news') return S.anim ? '' : newsModal();
  if (S.modal.type === 'rules') return rulesModal();
  return '';
}

function companyModal(cid) {
  const v = S.view;
  const c = v.companies[cid];
  const ind = IND[c.industry];
  const my = me();
  const ctrl = controller(cid);
  const rent = Math.round(c.price * 0.05 * (ctrl ? 2 : 1));
  const owners = Object.entries(c.owners).sort((a, b) => b[1] - a[1]);
  const segs = [];
  for (const [id, n] of owners) for (let k = 0; k < n; k++) { const p = pl(id); segs.push(`<div class="seg" style="background:${p ? p.color : '#666'}">${esc(p ? p.name[0].toUpperCase() : '?')}</div>`); }
  while (segs.length < 10) segs.push('<div class="seg free"></div>');
  const standing = my && my.pos === v.board.findIndex((b) => b.id === cid);
  const bought = my ? my.bankBought[cid] || 0 : 0;
  const canBuyBank = myTurn() && v.turn.rolled && standing && bankShares(cid) > 0 && bought < v.config.bankLimitShares && my.cash >= c.price / 10;
  const lobbyCost = Math.round(c.price * v.config.lobbyRate);
  const canLobby = myTurn() && !v.turn.lobbied && my.cash >= lobbyCost;
  const offers = v.offers.filter((o) => o.companyId === cid);
  const sel = my ? sellable(cid) : 0;

  let buyText;
  if (!standing) buyText = 'Купить у банка можно, только встав на клетку этой компании.';
  else if (bankShares(cid) <= 0) buyText = 'У банка не осталось свободных долей. Покупайте у игроков.';
  else if (bought >= v.config.bankLimitShares) buyText = 'Вы уже купили у банка 20% этой компании. Больше — только у игроков.';
  else buyText = `Можно взять ещё ${(v.config.bankLimitShares - bought) * 10}%: у банка один игрок покупает не больше 20% компании.`;

  return `<div class="overlay" data-act="close-bg"><div class="modal" role="dialog" aria-label="Карточка компании ${esc(c.name)}">
    <div class="mtop" style="background:${ind.color}"></div>
    <div class="mbody">
      <div class="mhead">
        <div style="display:flex;gap:16px;align-items:center">
          <div class="bigicon" style="background:${ind.color}">${indIcon(c.industry, 32)}</div>
          <div>
            <div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:${ind.label}">${esc(v.industries[c.industry].name.toUpperCase())}</div>
            <div style="font-size:34px;font-weight:800;letter-spacing:-.02em;line-height:1.05">${esc(c.name)}</div>
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
      <div style="font-size:28px;font-weight:800;letter-spacing:-.02em">Выберите, что случится через 2 круга</div></div>
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
      <div><b>Доли.</b> Компания делится на 10 долей по 10%. Встав на клетку, можно купить долю у банка, но не больше 20% одной компании за игру. Остальное — только у игроков.</div>
      <div><b>Аренда.</b> Встал на клетку компании — платишь 5% её цены владельцам по их долям. Непроданная часть не платится. У кого больше 50% — аренда ×2.</div>
      <div><b>Торговля.</b> Свою долю можно выставить по любой цене в карточке компании. Купить чужое предложение можно в свой ход, где бы вы ни стояли. Купленное в этот ход продать нельзя.</div>
      <div><b>Новости.</b> На клетке «Новости» выбираете одну из трёх. Она сработает через 2 круга. Текст видите только вы, остальные — лишь отрасль. Угол «Инсайдер» показывает все секретные новости.</div>
      <div><b>Лоббирование.</b> Один раз за ход: платите 3% цены любой компании, бросок 4–6 — цена ±15%, 1–3 — деньги пропали.</div>
      <div><b>Углы.</b> Старт: +30 000 $ за проход. Биржевые торги: продажа долей банку по цене −10%. Налоговая проверка: 10% от стоимости ваших долей. Инсайдер: смотрите секретные новости.</div>
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
    case 'leave': send({ t: 'leave' }); S.view = null; history.replaceState(null, '', '/'); location.reload(); break;
    case 'copy': case 'copy-link': {
      const link = location.origin + '/?room=' + S.view.code;
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Ссылка скопирована', true), () => toast(link, true));
      break;
    }
    case 'rules': S.modal = { type: 'rules' }; render(); break;
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
    case 'buyOffer': send({ t: 'buyOffer', id: Number(id) }); break;
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.modal && S.modal.type !== 'news') { S.modal = null; render(); }
});

render();
connect();
