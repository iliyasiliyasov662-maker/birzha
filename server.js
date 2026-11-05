// Сервер «Биржи»: отдаёт страницу игры и держит комнаты через WebSocket.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Game } = require('./game');
const { botStep, botBids } = require('./bots');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200); return res.end('ok'); }
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) {
      // Любой неизвестный путь отдаёт страницу игры (ссылки вида /?room=ABCD)
      return fs.readFile(path.join(PUBLIC, 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': TYPES['.html'] }); res.end(d2);
      });
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const rooms = new Map(); // code -> { game, sockets: Map(ws -> pid), touched }

function newCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 4 }, () => abc[crypto.randomInt(abc.length)]).join(''); } while (rooms.has(c));
  return c;
}

function broadcast(room) {
  room.touched = Date.now();
  for (const [ws, pid] of room.sockets) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'state', view: room.game.viewFor(pid) }));
  }
}

function setOnline(room, pid) {
  const p = room.game.player(pid);
  if (!p) return;
  p.online = [...room.sockets.values()].includes(pid);
}

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let room = null;
  let pid = null;
  const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    try {
      if (m.t === 'create' || m.t === 'join') {
        let code = String(m.room || '').toUpperCase().trim();
        if (m.t === 'create') {
          code = newCode();
          rooms.set(code, { game: new Game(code), sockets: new Map(), touched: Date.now() });
        }
        const r = rooms.get(code);
        if (!r) throw new Error('Комната не найдена. Проверьте ссылку или создайте новую');
        let id = typeof m.pid === 'string' && m.pid.length <= 40 ? m.pid : null;
        let p = id && r.game.player(id);
        if (!p) {
          id = crypto.randomUUID();
          p = r.game.addPlayer(id, m.name);
        }
        room = r; pid = id;
        r.sockets.set(ws, pid);
        setOnline(r, pid);
        send({ t: 'joined', room: code, pid });
        broadcast(r);
        return;
      }
      if (!room) throw new Error('Сначала войдите в комнату');
      const g = room.game;
      switch (m.t) {
        case 'start': g.start(pid, m.minutes); break;
        case 'addBot': g.addBot(pid); break;
        case 'removeBot': g.removeBot(pid, m.id); break;
        case 'leave': g.removePlayer(pid); room.sockets.delete(ws); pid = null; break;
        case 'roll': g.roll(pid); break;
        case 'endTurn': g.endTurn(pid); break;
        case 'skipTurn': g.skipTurn(pid); break;
        case 'buyBank': g.buyFromBank(pid, m.company); break;
        case 'sellBank': g.sellToBank(pid, m.company); break;
        case 'lobby': g.lobby(pid, m.company, m.dir); break;
        case 'chooseNews': g.chooseNews(pid, m.idx); break;
        case 'offer': g.placeOffer(pid, m.company, m.shares, m.price); break;
        case 'cancelOffer': g.cancelOffer(pid, m.id); break;
        case 'buyOffer': g.buyOffer(pid, m.id); break;
        case 'rumor': g.rumor(pid, m.company, m.dir); break;
        case 'skipRumor': g.skipRumor(pid); break;
        case 'bid': g.bid(pid, m.amount); break;
        case 'ping': return;
        default: throw new Error('Неизвестное действие');
      }
      broadcast(room);
    } catch (e) {
      send({ t: 'error', msg: e.message || 'Ошибка' });
    }
  });

  ws.on('close', () => {
    if (!room) return;
    room.sockets.delete(ws);
    if (pid) setOnline(room, pid);
    broadcast(room);
  });
});

// Проверка окончания времени и уборка пустых комнат
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    const g = r.game;
    try { if (g.tickAuction(now)) broadcast(r); } catch (e) { console.error('tickAuction', e); }
    try { if (g.autoTimeout(now)) broadcast(r); } catch (e) { console.error('autoTimeout', e); }
    if (g.phase !== 'lobby' && g.phase !== 'over' && g.endsAt && now >= g.endsAt) {
      g.finishByTime();
      broadcast(r);
    }
    if (r.sockets.size === 0 && now - r.touched > 6 * 3600 * 1000) rooms.delete(code);
  }
}, 1000);

// Боты: каждые 0,4 с смотрим, не пора ли кому-то из ботов действовать. Между действиями — паузы,
// чтобы люди видели, что делает бот.
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    const g = r.game;
    if (g.phase !== 'roll' && g.phase !== 'action') continue;
    const turnKey = g.globalTurn;
    if (r.botTurnKey !== turnKey) {         // ход только что перешёл — небольшая пауза перед ботом
      r.botTurnKey = turnKey;
      r.botWait = now + 1200;
    }
    if (now < (r.botWait || 0)) continue;
    try {
      if (g.auction && botBids(g)) { r.botWait = now + 900; broadcast(r); continue; }
      const pause = botStep(g);
      if (pause !== null) { r.botWait = now + pause; broadcast(r); }
    } catch (e) {
      console.error('bot', e.message);
      // бот запутался — просто передаём ход дальше, чтобы игра не встала
      try {
        const cur = g.current();
        if (cur && cur.isBot) { g.turn.newsChoice = null; g.turn.extraRoll = false; if (g.auction) g.resolveAuction(); g.advance(); broadcast(r); }
      } catch (e2) { console.error('bot fallback', e2.message); }
      r.botWait = now + 1500;
    }
  }
}, 400);

server.listen(PORT, () => console.log(`Биржа запущена: http://localhost:${PORT}`));
